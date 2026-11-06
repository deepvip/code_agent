#!/usr/bin/env node
/**
 * 参数化品牌迁移工具。
 *
 * 示例：
 *   node scripts/rebrand.mjs --product "Dove Code" --company Dove \
 *     --version 2.0.0 --prefix dove-code --app-id com.dove.code \
 *     --protocol dove-code --provider dove --env-prefix DOVE_AI
 *
 * 设计原则：
 * - 使用当前 brand.json 推导旧值，重复执行是幂等的。
 * - 先备份，再写入；--dry-run 只展示计划，不执行补丁与构建。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"

const root = path.resolve(import.meta.dirname, "..")
const brandFile = path.join(root, "brand", "brand.json")

function usage(message) {
  if (message) console.error(`错误：${message}\n`)
  console.error(`用法：
  node scripts/rebrand.mjs --product "Dove Code" --company Dove \
    --version 2.0.0 --prefix dove-code --app-id com.dove.code \
    --protocol dove-code --provider dove --env-prefix DOVE_AI

可选参数：
  --gateway-url URL       默认 https://ai-gateway.<prefix>.internal/v1
  --update-url URL        默认 https://update.<prefix>.internal/desktop/
  --support-url URL       默认 https://wiki.<prefix>.internal/dev/ai-assistant
  --no-wizard             不编译首次配置向导
  --dry-run               只输出将要修改的文件，不写入
  --help                  显示帮助`)
  process.exit(message ? 2 : 0)
}

function parseArgs(argv) {
  const values = {}
  const flags = new Set()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help") usage()
    if (arg.startsWith("--") && argv[i + 1]?.startsWith("--")) {
      flags.add(arg.slice(2))
      continue
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const value = argv[i + 1]
      if (!value || value.startsWith("--")) flags.add(key)
      else {
        values[key] = value
        i++
      }
    }
  }
  return { values, flags }
}

const { values, flags } = parseArgs(process.argv.slice(2))
const required = ["product", "company", "version", "prefix", "app-id", "protocol", "provider", "env-prefix"]
for (const key of required) if (!values[key]) usage(`缺少 --${key}`)

const cleanPrefix = values.prefix.toLowerCase()
values.provider = values.provider.toLowerCase()
if (!/^[a-z][a-z0-9-]*$/.test(cleanPrefix)) usage("--prefix 只能包含小写字母、数字和连字符")
if (!/^[a-z][a-z0-9-]*$/.test(values.provider)) usage("--provider 只能包含小写字母、数字和连字符")
if (!/^[A-Z][A-Z0-9_]*$/.test(values["env-prefix"])) usage("--env-prefix 必须是大写环境变量前缀")
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(values.version)) usage("--version 必须是语义化版本")

const slugify = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

const oldBrand = JSON.parse(readFileSync(brandFile, "utf8"))
const oldConfigName = `${oldBrand.artifactPrefix}.jsonc`
const newConfigName = `${cleanPrefix}.jsonc`
const oldProvider = oldBrand.provider ?? inferProvider()
const oldSetupExe = oldBrand.setupExe ?? `${compact(oldBrand.productName)}Setup.exe`
const newSetupExe = `${compact(values.product) || cleanPrefix}Setup.exe`
const oldEnvPrefix = inferEnvPrefix()
const oldProjectName = readProjectName()
const newProjectName = `${slugify(values.company) || cleanPrefix}-dev-agent`
const oldThemeName = findThemeName(oldBrand.company)
const newThemeName = `${slugify(values.company) || cleanPrefix}.json`
const newBrand = {
  ...oldBrand,
  productName: values.product,
  company: values.company,
  version: values.version,
  appId: values["app-id"],
  artifactPrefix: cleanPrefix,
  protocol: values.protocol,
  provider: values.provider,
  setupExe: newSetupExe,
  gatewayBaseUrl: values["gateway-url"] ?? `https://ai-gateway.${cleanPrefix}.internal/v1`,
  updateUrl: values["update-url"] ?? `https://update.${cleanPrefix}.internal/desktop/`,
  supportUrl: values["support-url"] ?? `https://wiki.${cleanPrefix}.internal/dev/ai-assistant`,
}

function compact(value) {
  return String(value).replace(/[^A-Za-z0-9]/g, "")
}

function inferProvider() {
  const config = readTextIfExists(path.join(root, oldConfigName)) ?? ""
  return config.match(/"model"\s*:\s*"([^/]+)\/main"/)?.[1] ?? "dove"
}

function readProjectName() {
  try {
    return JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).name
  } catch {
    return undefined
  }
}

function findThemeName(company) {
  const themes = path.join(root, ".opencode", "themes")
  const expected = `${slugify(company) || "dove"}.json`
  if (existsSync(path.join(themes, expected))) return expected
  return readdirSync(themes).find((name) => name.endsWith(".json"))
}

function envPrefixFor(brand) {
  const base = compact(brand.company).toUpperCase() || compact(brand.artifactPrefix).toUpperCase() || "BRAND"
  return `${base}_AI`
}

function inferEnvPrefix() {
  const files = [
    path.join(root, oldConfigName),
    path.join(root, "scripts", "verify-config.mjs"),
    path.join(root, "scripts", "mock-gateway.mjs"),
  ]
  for (const file of files) {
    const text = readTextIfExists(file)
    const match = text?.match(/\b([A-Z][A-Z0-9]+)_AI_(?:BASE_URL|API_KEY)\b/)
    if (match) return match[1] + "_AI"
  }
  return envPrefixFor(oldBrand)
}

function readTextIfExists(file) {
  if (!existsSync(file)) return undefined
  try {
    const stat = statSync(file)
    if (!stat.isFile() || stat.size > 2_000_000) return undefined
    return readFileSync(file, "utf8")
  } catch {
    return undefined
  }
}

function writeText(file, text) {
  // 任意文本写入前先去重 BOM；NSIS 脚本含非 ASCII 内容时保留一个 UTF-8 BOM。
  const clean = text.replace(/^\uFEFF+/, "")
  writeFileSync(file, /\.nsh$/i.test(file) && /[^\x00-\x7F]/.test(clean) ? `\uFEFF${clean}` : clean, "utf8")
}

function walk(dir, result = [], skip) {
  if (!existsSync(dir)) return result
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skip?.(file)) walk(file, result, skip)
    } else result.push(file)
  }
  return result
}

function isTextTarget(file) {
  const rel = path.relative(root, file).replaceAll("\\", "/")
  if (rel === "scripts/rebrand.mjs") return false
  if (rel === "scripts/apply-brand.mjs" || rel === "scripts/apply-copy.mjs") return false
  if (rel === "brand/brand.json") return false
  if (rel.startsWith("vendor/opencode/") || rel.startsWith("node_modules/") || rel.startsWith("tmp/")) return false
  if (rel.startsWith(".rebrand-backup/")) return false
  if (rel.startsWith("wizard/payload/")) return false
  if (rel.startsWith("brand/icons/")) return false
  return /\.(json|jsonc|md|mjs|ps1|cs|tsx|ts|html|nsh|txt)$/.test(rel)
}

const vendorRoot = path.join(root, "vendor", "opencode")
const skipVendorDir = (dir) => /[\\/](node_modules|\.bun|\.git|dist|out|test|tests|__tests__|fixtures)$/.test(dir)
const isVendorText = (file) => /\.(json|jsonc|md|tsx|ts|html|nsh|txt|desktop|xml|svg|css)$/.test(file)

const capitalize = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1)

// 已经执行过旧脚本、但 brand.json 可能已先行更新的历史品牌。
// 作用：把 vendor 里残留的旧品牌一并迁移到本次目标。
const LEGACY_BRANDS = [
  {
    productName: "Acme Code",
    company: "Acme",
    appId: "com.acme.code",
    artifactPrefix: "acme-code",
    protocol: "acme-code",
    provider: "acme",
    setupExe: "AcmeCodeSetup.exe",
    envPrefix: "ACME_AI",
    gatewayBaseUrl: "https://ai-gateway.acme.internal/v1",
    updateUrl: "https://update.acme.internal/desktop/",
    supportUrl: "https://wiki.acme.internal/dev/ai-assistant",
  },
]

function brandFacts(brand, envPrefix) {
  const product = brand.productName ?? ""
  const company = brand.company ?? ""
  const prefix = brand.artifactPrefix ?? ""
  const appId = brand.appId ?? ""
  const protocol = brand.protocol ?? prefix
  const provider = String(brand.provider ?? "").toLowerCase()
  return {
    product,
    company,
    appId,
    prefix,
    protocol,
    provider,
    setup: brand.setupExe ?? (compact(product) || prefix ? `${compact(product) || prefix}Setup.exe` : ""),
    envPrefix: envPrefix ?? "",
    gateway: brand.gatewayBaseUrl ?? "",
    update: brand.updateUrl ?? "",
    support: brand.supportUrl ?? "",
    email: `dev@${slugify(company) || prefix || "example"}.internal`,
    slug: prefix.replace(/-code$/, ""),
    devName: `${product} Dev`,
    betaName: `${product} Beta`,
  }
}

function pairsFor(from, to) {
  const pairs = []
  const add = (a, b, boundary = false) => {
    if (a && b && a !== b) pairs.push([a, b, boundary])
  }

  // `DoveCodeSetup` / `DoveCodeSetup.exe` 这类不带扩展名的标识符。
  const fromCompact = compact(from.product)
  const toCompact = compact(to.product)
  if (fromCompact && toCompact) add(`${fromCompact}Setup`, `${toCompact}Setup`)
  add(from.setup, to.setup)
  if (from.protocol && to.protocol) add(`${from.protocol}://`, `${to.protocol}://`)
  // appId 的子串替换同时覆盖 com.x.y.dev / com.x.y.beta
  add(from.appId, to.appId)
  add(from.gateway, to.gateway)
  add(from.update, to.update)
  add(from.support, to.support)
  if (from.slug && to.slug) add(`service-${from.slug}.json`, `service-${to.slug}.json`)
  if (from.company && to.company) add(from.email, to.email)
  if (from.product && to.product) {
    add(from.devName, to.devName, true)
    add(from.betaName, to.betaName, true)
  }
  add(from.envPrefix, to.envPrefix)

  // provider id 必须优先于产品名/公司名；字段缺失时整组跳过，避免 `""` 之类的空模板误伤源码。
  if (from.provider && to.provider) {
    add(`${from.provider}/main`, `${to.provider}/main`)
    add(`${from.provider}/fast`, `${to.provider}/fast`)
    add(`${capitalize(from.provider)}/main`, `${to.provider}/main`)
    add(`${capitalize(from.provider)}/fast`, `${to.provider}/fast`)
    add(`${from.provider}-main`, `${to.provider}-main`)
    add(`${from.provider}-fast`, `${to.provider}-fast`)
    add(`${from.provider}_config_ready`, `${to.provider}_config_ready`)
  }

  add(from.prefix, to.prefix)
  if (from.product && to.product) add(from.product, to.product, true)
  // 不再裸词替换公司名。`Open` 同时是 `open`/`Open` 这类源码与 UI 常用词，
  // 全局替换会把 fs.promises.open、WebSocket 的 open 事件等一起改坏。
  // 品牌身份由产品名（Open Code）、前缀（open-code）和 provider 专用模式覆盖。

  return pairs
}

function dedupePairs(pairs) {
  const seen = new Set()
  return pairs.filter(([from, to]) => {
    const key = `${from}\u0000${to}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function legacyBrands() {
  const brands = [...LEGACY_BRANDS]
  const backupRoot = path.join(root, ".rebrand-backup")
  if (!existsSync(backupRoot)) return brands
  for (const stamp of readdirSync(backupRoot)) {
    const text = readTextIfExists(path.join(backupRoot, stamp, "brand", "brand.json"))
    if (!text) continue
    try {
      const brand = JSON.parse(text)
      if (brand?.productName && brand?.company) brands.push(brand)
    } catch {
      // 备份损坏时忽略，不影响本次迁移。
    }
  }
  return brands
}

function brandPairs() {
  const to = brandFacts(newBrand, values["env-prefix"])
  const from = brandFacts(oldBrand, oldEnvPrefix)
  const sources = [from]
  const key = (item) => [item.product, item.company, item.prefix, item.appId, item.provider].join("\u0001")
  for (const legacy of legacyBrands()) {
    const candidate = brandFacts(legacy, envPrefixFor(legacy))
    if (sources.some((item) => key(item) === key(candidate))) continue
    sources.push(candidate)
  }
  return dedupePairs(sources.flatMap((source) => pairsFor(source, to)))
}

function replacementPairs() {
  const pairs = [...brandPairs()]
  if (oldProjectName && oldProjectName !== newProjectName) pairs.push([oldProjectName, newProjectName])
  if (oldThemeName && oldThemeName !== newThemeName) pairs.push([oldThemeName, newThemeName])

  // 以下是外层文档/脚本专用的写法；vendor 源码里有意大利语单词 dove（= where），不能做裸词替换。
  const oldSlug = oldThemeName?.replace(/\.json$/i, "")
  const newSlug = newThemeName.replace(/\.json$/i, "")
  if (oldSlug && oldSlug !== newSlug) {
    pairs.push([`可选到 \`${oldSlug}\``, `可选到 \`${newSlug}\``])
    pairs.push([`主题可选到 ${oldSlug}`, `主题可选到 ${newSlug}`])
  }
  if (oldProvider && values.provider) {
    pairs.push([`providers.${oldProvider}.`, `providers.${values.provider}.`])
    pairs.push([`${oldProvider}.key`, `${values.provider}.key`])
    // provider 的裸词（尤其 `open`）不能全局替换；只在 JSONC 配置里处理。
  }

  return dedupePairs(pairs)
}

function replaceAll(text, from, to, boundary = false) {
  if (!from) return text
  if (!boundary) return text.split(from).join(to)
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const guard =
    boundary === "provider" ? "(?<![A-Za-z0-9_./@\\\\-])" : ""
  const tail =
    boundary === "provider" ? "(?![A-Za-z0-9_./@\\\\-])" : "(?![A-Za-z0-9])"
  return text.replace(new RegExp(`${guard}${escaped}${tail}`, "g"), to)
}

function backup(files) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
  const backupDir = path.join(root, ".rebrand-backup", stamp)
  if (flags.has("dry-run")) return backupDir
  mkdirSync(backupDir, { recursive: true })
  for (const file of files) {
    const rel = path.relative(root, file)
    const destination = path.join(backupDir, rel)
    mkdirSync(path.dirname(destination), { recursive: true })
    cpSync(file, destination)
  }
  return backupDir
}

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(" ")}`)
  if (flags.has("dry-run")) return
  // 不使用 shell：Windows 的 Node 路径通常是 `C:\\Program Files\\nodejs\\node.exe`，
  // 交给 cmd.exe 会被错误拆成 `C:\\Program`。
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false, ...options })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function normalizeExistingVendorBrand() {
  const pairs = brandPairs()
  const dryRun = flags.has("dry-run")
  let changed = 0
  for (const file of walk(vendorRoot, [], skipVendorDir)) {
    if (!isVendorText(file)) continue
    const original = readTextIfExists(file)
    if (original === undefined) continue
    let next = original
    for (const [from, to, boundary] of pairs) next = replaceAll(next, from, to, boundary)
    if (file.endsWith("electron-builder.config.ts")) {
      next = next.replace(/(\r?\n\s*name: "[^"]+",){2,}/g, `\n      name: "${cleanPrefix}",`)
    }
    if (next === original) continue
    changed++
    console.log(`${dryRun ? "预演（vendor）" : "修改（vendor）"}：${path.relative(root, file)}`)
    if (!dryRun) writeText(file, next)
  }
  console.log(`vendor 品牌归一化：${changed} 个文件`)
}

const files = walk(root, [], (dir) => /[\\/](node_modules|vendor|\.git|\.rebrand-backup|wizard[\\/]payload)$/.test(dir)).filter(isTextTarget)
const vendorFiles = walk(vendorRoot, [], skipVendorDir).filter(isVendorText)
const backupDir = backup([brandFile, ...files.filter((file) => readTextIfExists(file) !== undefined), ...vendorFiles])
console.log(`备份目录：${backupDir}`)

const pairs = replacementPairs()
// provider id 只应在品牌配置里替换；源码中的 `open` 是通用词/标识符，不能碰。
const providerConfigPairs =
  oldProvider && values.provider
    ? [
        [`"${oldProvider}"`, `"${values.provider}"`],
        [`"${oldProvider}/`, `"${values.provider}/`],
      ]
    : []
let changedFiles = 0
for (const file of files) {
  const original = readTextIfExists(file)
  if (original === undefined) continue
  let next = original
  for (const [from, to, boundary] of pairs) next = replaceAll(next, from, to, boundary)
  if (/\.jsonc$/i.test(file)) {
    for (const [from, to] of providerConfigPairs) next = next.split(from).join(to)
  }
  if (next === original) continue
  changedFiles++
  console.log(`修改：${path.relative(root, file)}`)
  if (!flags.has("dry-run")) writeText(file, next)
}

if (!flags.has("dry-run")) {
  writeFileSync(brandFile, `${JSON.stringify(newBrand, null, 2)}\n`, "utf8")
  const oldConfig = path.join(root, oldConfigName)
  const newConfig = path.join(root, newConfigName)
  if (existsSync(oldConfig) && oldConfig !== newConfig) {
    if (existsSync(newConfig)) throw new Error(`目标配置已存在，拒绝覆盖：${newConfig}`)
    renameSync(oldConfig, newConfig)
  }
  const oldTheme = oldThemeName && path.join(root, ".opencode", "themes", oldThemeName)
  const newTheme = path.join(root, ".opencode", "themes", newThemeName)
  if (oldTheme && existsSync(oldTheme) && oldTheme !== newTheme) {
    if (existsSync(newTheme)) throw new Error(`目标主题已存在，拒绝覆盖：${newTheme}`)
    renameSync(oldTheme, newTheme)
  }
}

console.log(`外层文本修改：${changedFiles} 个文件`)

// 兼容已经执行过旧版脚本的工作树：先把 vendor 里残留的旧品牌规范化为本次目标。
normalizeExistingVendorBrand()

if (flags.has("dry-run")) {
  console.log("\n预演完成：未写入任何文件，也未执行补丁、向导编译或检查。")
  process.exit(0)
}

// 上游源码只通过现有的幂等补丁脚本处理。
run("node", [path.join(root, "scripts", "apply-brand.mjs")])
run("node", [path.join(root, "scripts", "apply-copy.mjs")])

// 重新生成配置向导资源；Windows 下默认编译，其他平台只生成 payload。
run("node", [path.join(root, "scripts", "make-wizard-payload.mjs")])
if (!flags.has("no-wizard") && process.platform === "win32") {
  run("powershell", ["-ExecutionPolicy", "Bypass", "-File", path.join(root, "wizard", "build.ps1")])
} else if (!flags.has("no-wizard")) {
  console.log("当前不是 Windows，已跳过 csc/WinForms 编译；payload 已生成。")
}

run("node", [path.join(root, "scripts", "apply-brand.mjs"), "--check"])
run("node", [path.join(root, "scripts", "apply-copy.mjs"), "--check"])

console.log(`\n品牌迁移完成：${newBrand.productName} ${newBrand.version}`)
console.log("下一步构建（顺序不能反）：")
// 免费模型网关按 User-Agent 里的版本号判断是否 >= 1.18.0。直接使用品牌 channel 构建会得到
// 0.0.0-<channel>-<timestamp>，被网关拒绝；必须显式设置 2.0.0-<channel>-<timestamp>。
console.log("  1) 先编译 CLI（桌面端 prebuild 会从这里复制 opencode-cli.exe）")
console.log("     推荐：node scripts/build-cli.mjs")
console.log("     等价手动命令：")
console.log("       cd vendor/opencode/packages/cli")
console.log(`       $env:OPENCODE_CHANNEL = '${newBrand.provider}'`)
console.log(`       $env:OPENCODE_VERSION = "${newBrand.version}-${newBrand.provider}-$(Get-Date -Format 'yyyyMMddHHmmss')"`)
console.log("       bun run script/build.ts --target=opencode-windows-x64-baseline")
console.log("       Remove-Item Env:OPENCODE_CHANNEL")
console.log("       Remove-Item Env:OPENCODE_VERSION")
console.log("  2) 再编译并打包桌面端")
console.log("     cd vendor/opencode/packages/desktop")
console.log("     $env:OPENCODE_CHANNEL = 'prod'")
console.log("     $env:OPENCODE_CLI_DIST = \"$PWD\\..\\cli\\dist\"")
console.log("     bun run prebuild; bun run build; bun run package:win")
