#!/usr/bin/env node
/**
 * 生成「首次配置」小工具需要的载荷：
 *   wizard/payload/config.template.json   带占位符的托管配置（纯 JSON，无注释）
 *   wizard/payload/AGENTS.md              常驻指令
 *   wizard/payload/skills/<id>/SKILL.md   技能
 *   wizard/payload/themes/acme.json       主题
 *
 * 为什么要有模板：写配置的小工具在 C# 里，不能解析 JSONC（注释），
 * 所以这里把注释去掉、把运行时才知道的值换成占位符。
 *
 * 占位符：
 *   __BASE_URL__    网关地址
 *   __API_KEY__     密钥（本地保存，明文，仅当前用户可读）
 *   __MODEL_ID__    模型 ID（同时用作配置里的模型键，也是发给网关的 model 字段）
 *   __MODEL_NAME__  模型显示名
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const payload = path.join(root, "wizard", "payload")

/** 去掉 JSONC 注释，字符串内部不动。 */
function stripComments(input) {
  let out = ""
  let inString = false
  let escaped = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const next = input[i + 1]

    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      continue
    }

    if (ch === "/" && next === "/") {
      while (i < input.length && input[i] !== "\n") i++
      out += "\n"
      continue
    }

    if (ch === "/" && next === "*") {
      i += 2
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++
      i++
      continue
    }

    out += ch
  }
  return out
}

const brand = JSON.parse(readFileSync(path.join(root, "brand", "brand.json"), "utf8"))
const source = readFileSync(path.join(root, `${brand.artifactPrefix}.jsonc`), "utf8").replace(/^\uFEFF/, "")
const config = JSON.parse(stripComments(source))
const providerID = config.model.split("/")[0]
const themeSource = path.join(root, ".opencode", "themes")
const themeFile = readdirSync(themeSource).find((name) => name.endsWith(".json"))
if (!themeFile) throw new Error(`找不到主题文件：${themeSource}`)

// 上游 schema 地址不属于交付物，去掉以免编辑器去公网取 opencode 的 schema。
delete config.$schema

// 指令随配置目录一起部署：V2 会自动读取 <config>/AGENTS.md，不需要显式路径。
delete config.instructions

config.model = `${providerID}/__MODEL_ID__`
config.providers[providerID].settings.baseURL = "__BASE_URL__"
config.providers[providerID].settings.apiKey = "__API_KEY__"

const template = config.providers[providerID].models.main
template.name = "__MODEL_NAME__"
config.providers[providerID].models = {
  __MODEL_ID__: template,
}

rmSync(payload, { recursive: true, force: true })
mkdirSync(path.join(payload, "skills"), { recursive: true })
mkdirSync(path.join(payload, "themes"), { recursive: true })

writeFileSync(path.join(payload, "config.template.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8")
cpSync(path.join(root, "prompts", "AGENTS.md"), path.join(payload, "AGENTS.md"))
cpSync(path.join(themeSource, themeFile), path.join(payload, "themes", themeFile))
for (const id of ["code-review", "java-standards", "legacy-migration"]) {
  mkdirSync(path.join(payload, "skills", id), { recursive: true })
  cpSync(
    path.join(root, ".opencode", "skills", id, "SKILL.md"),
    path.join(payload, "skills", id, "SKILL.md"),
  )
}

console.log("载荷已生成：wizard/payload")
