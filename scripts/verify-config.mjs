#!/usr/bin/env node
/**

 * 用法：node scripts/verify-config.mjs
 * 退出码：0 全部通过；1 有失败项
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const root = path.resolve(import.meta.dirname, "..")
// 必须用我们自己构建的 CLI：配置文件名与目录都已改名，上游 npm 包不认。
// 桌面端内嵌的是 x64-baseline 变体，优先用它，保证自检对象与实际交付物一致。
const dist = path.join(root, "vendor", "opencode", "packages", "cli", "dist")
const candidates =
  process.platform === "win32"
    ? [
        path.join(dist, "cli-windows-x64-baseline", "bin", "opencode.exe"),
        path.join(dist, "cli-windows-x64", "bin", "opencode.exe"),
      ]
    : [
        path.join(dist, "cli-linux-x64-baseline", "bin", "opencode"),
        path.join(dist, "cli-linux-x64", "bin", "opencode"),
      ]
const cli =
  candidates.find((candidate) => existsSync(candidate)) ??
  (process.platform === "win32"
    ? path.join(root, "node_modules", "@opencode", "cli", "bin", "opencode.exe")
    : path.join(root, "node_modules", "@opencode", "cli", "bin", "opencode"))

if (!existsSync(cli)) {
  console.error(`找不到 Aero Code CLI：${cli}\n请先构建 packages/cli`)
  process.exit(1)
}

const env = {
  ...process.env,
  AERO_AI_BASE_URL: process.env.AERO_AI_BASE_URL ?? "https://ai-gateway.aero-code.internal/v1",
  AERO_AI_API_KEY: process.env.AERO_AI_API_KEY ?? "sk-verify-only",
}

function run(args) {
  return execFileSync(cli, args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

// 与 packages/core/src/util/wildcard.ts 保持一致的匹配语义：* -> .*，? -> .
function toRegExp(pattern) {
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
  return new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "s")
}

function evaluate(action, resource, rules) {
  const normalized = resource.replaceAll("\\", "/")
  return (
    rules.findLast((rule) => toRegExp(rule.action).test(action) && toRegExp(rule.resource).test(normalized)) ?? {
      action,
      resource: "*",
      effect: "ask",
    }
  )
}

const results = []
function check(name, actual, expected) {
  const pass = actual === expected
  results.push({ name, actual, expected, pass })
}

let agents
let models
try {
  // 后台服务冷启动时，第一个请求可能早于项目注册，返回一份空配置。
  // 这里轮询预热，避免自检结果被启动时序影响。
  agents = debugJSON(["debug", "agents"])
  models = run(["models"]).split(/\r?\n/).filter(Boolean)
} catch (error) {
  console.error("CLI 执行失败，配置可能无法解析：\n" + (error.stdout || error.message))
  process.exit(1)
}

function debugJSON(args) {
  const deadline = Date.now() + 10_000
  for (;;) {
    const value = JSON.parse(run(args))
    const empty = Array.isArray(value) ? value.length === 0 : !value || Object.keys(value).length === 0
    if (!empty || Date.now() > deadline) return value
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
}

const byId = new Map(agents.map((agent) => [agent.id, agent]))

// 1) 自定义 Agent 是否注册成功
for (const id of ["build", "review", "migrate", "docs"]) {
  check(`agent 已注册：${id}`, byId.has(id), true)
}

// 2) 模型是否指向内部网关
check("默认模型可用", models.includes("aero/main"), true)
check("备用模型可用", models.includes("aero/fast"), true)

// 3) 权限：核心安全断言（"最后匹配生效"）
function effectOf(agentId, action, resource) {
  const agent = byId.get(agentId)
  if (!agent) return "MISSING_AGENT"
  return evaluate(action, resource, agent.permissions ?? []).effect
}

check("build 可改普通源码", effectOf("build", "edit", "C:/repo/src/a.ts"), "allow")
check("build 读 .env 被拒", effectOf("build", "read", "C:/repo/.env"), "deny")
check("build 读 .env.local 被拒", effectOf("build", "read", "C:/repo/.env.local"), "deny")
check("build 读 .env.example 放行", effectOf("build", "read", "C:/repo/.env.example"), "allow")
check("build 读私钥被拒", effectOf("build", "read", "C:/repo/certs/server.pem"), "deny")
check("build 改 CI 流程被拒", effectOf("build", "edit", "C:/repo/.github/workflows/ci.yml"), "deny")
check("build rm 需确认", effectOf("build", "shell", "rm -rf build"), "ask")
check("build 强制推送被拒", effectOf("build", "shell", "git push --force origin main"), "deny")

// 只读 Agent 不能被全局规则"放开"——这是最容易踩的坑
check("plan 不可改代码", effectOf("plan", "edit", "C:/repo/src/a.ts"), "deny")
check("review 不可改代码", effectOf("review", "edit", "C:/repo/src/a.ts"), "deny")
check("review 不可执行命令", effectOf("review", "shell", "npm test"), "deny")
check("migrate 可改代码", effectOf("migrate", "edit", "C:/repo/src/a.ts"), "allow")
check("migrate 不可推送", effectOf("migrate", "shell", "git push origin main"), "deny")

// 上游内置技能必须屏蔽：opencode 讲上游产品，report 会把诊断发到 GitHub
check("屏蔽内置技能 opencode", effectOf("build", "skill", "opencode"), "deny")
check("屏蔽内置技能 report", effectOf("build", "skill", "report"), "deny")

// 4) 技能与指令：路径必须不依赖「用户当前工作区」
const raw = readFileSync(path.join(root, "aero-code.jsonc"), "utf8")
const refs = [...raw.matchAll(/"\.\/(prompts)\/[^"]*"/g)].map((match) => match[0].replaceAll('"', ""))
for (const ref of refs) {
  check(`引用存在：${ref}`, existsSync(path.join(root, ref)), true)
}

// 显式写 skills 字段会被解析成用户当前打开的仓库下的路径，部署后必然失效
check("没有 workspace 相对的 skills 字段", /"skills"\s*:/.test(raw), false)

const skillsDir = path.join(root, ".aerocode", "skills")
check("技能目录存在：.aerocode/skills", existsSync(skillsDir), true)
if (existsSync(skillsDir)) {
  for (const name of readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, "SKILL.md")
    const content = existsSync(file) ? readFileSync(file, "utf8") : ""
    check(`技能 ${name} 有 SKILL.md`, content.length > 0, true)
    check(`技能 ${name} 有 description`, /^description:\s*\S+/m.test(content), true)
  }
}

const width = Math.max(...results.map((item) => item.name.length))
for (const item of results) {
  console.log(`${item.pass ? "PASS" : "FAIL"}  ${item.name.padEnd(width)}  期望=${item.expected} 实际=${item.actual}`)
}

const failed = results.filter((item) => !item.pass)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
