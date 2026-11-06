#!/usr/bin/env node
/**
 * 用法：
 *   node scripts/apply-copy.mjs           # 应用
 *   node scripts/apply-copy.mjs --check   # 只统计将要改动的行数
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const root = path.resolve(import.meta.dirname, "..")
const brand = JSON.parse(readFileSync(path.join(root, "brand", "brand.json"), "utf8"))
const checkOnly = process.argv.includes("--check")
const i18n = path.join(root, "vendor", "opencode", "packages", "app", "src", "runtime", "i18n")

// 全部语言包 + 原生菜单 + 两个 HTML 标题
const localeFiles = existsSync(i18n)
  ? readdirSync(i18n)
      .filter((name) => /^[a-z]{2,3}\.ts$/.test(name) || name === "desktop-native.ts")
      .map((name) => path.join(i18n, name))
  : []

// gui-extensions 下还有 ssh / updater / wsl / pairing 等独立命名空间，各有整套语言包
const extensions = path.join(root, "vendor", "opencode", "packages", "gui-extensions", "src")
const extensionLocaleFiles = existsSync(extensions)
  ? readdirSync(extensions, { recursive: true })
      .map((entry) => path.join(extensions, entry))
      .filter((file) => /[\\/]i18n[\\/][a-z]{2,3}\.ts$/.test(file))
  : []

const files = [
  ...localeFiles,
  ...extensionLocaleFiles,
  path.join(root, "vendor", "opencode", "packages", "desktop", "src", "renderer", "index.html"),
  path.join(root, "vendor", "opencode", "packages", "app", "index.html"),
]

/**
 * 只能按语义重写、不能做字符串替换的关于页文案。
 * 按语言分别给文案，避免英文界面里出现中文。
 */
const about = {
  en: {
    description: `${brand.productName}, the internal coding agent`,
    trademark: `${brand.productName} is a trademark of ${brand.company}`,
    thanks: `Thanks to the upstream open source project and its contributors`,
  },
  zh: {
    description: `${brand.productName}，企业内部编程智能体`,
    trademark: `${brand.productName} 是${brand.company}内部产品标识`,
    thanks: `感谢上游开源项目及其贡献者 `,
  },
  zht: {
    description: `${brand.productName}，企業內部程式設計智能體`,
    trademark: `${brand.productName} 是${brand.company}的內部產品標識`,
    thanks: `感謝上游開源專案及其貢獻者 `,
  },
}

function overridesFor(locale) {
  const copy = about[locale] ?? about.en
  return [
    {
      // 官网 → 内部文档
      pattern: /("settings\.about\.website":\s*)"[^"]*"/g,
      to: `$1"${brand.supportUrl.replace(/^https?:\/\//, "")}"`,
    },
    {
      // 开源项目简介 → 内部产品简介
      pattern: /("settings\.about\.description":\s*)"[^"]*"/g,
      to: `$1"${copy.description}"`,
    },
    {
      // 上游的商标声明必须整体替换，不能只换名字
      pattern: /("settings\.about\.trademark":\s*)"[^"]*"/g,
      to: `$1"${copy.trademark}"`,
    },
    {
      // 版权方
      pattern: /("settings\.about\.copyright":\s*)"[^"]*"/g,
      to: `$1"© ${brand.company}"`,
    },
// ========== 新增这一行！强制更新thanks致谢文案 ==========
    {
      pattern: /("settings\.about\.thanks":\s*)"[^"]*"/g,
      to: `$1${JSON.stringify(copy.thanks)}`,
    }
  ]
}

const report = []
let total = 0

for (const file of files) {
  if (!existsSync(file)) {
    report.push(`跳过（不存在）：${path.relative(root, file)}`)
    continue
  }
  const original = readFileSync(file, "utf8")
  let next = original
  let hits = 0

  const locale = path.basename(file).replace(/\.ts$/, "")
  for (const rule of overridesFor(locale)) {
    next = next.replace(rule.pattern, rule.to)
  }

  // 关于页致谢语：新增 key，其他语言按运行时英文回退
  const thanks = about[locale]?.thanks
  if (thanks && !next.includes('"settings.about.thanks"')) {
    next = next.replace(
      /^(\s*"settings\.about\.description":.*\r?\n)/m,
      (line) => `${line}  "settings.about.thanks": ${JSON.stringify(thanks)},\n`,
    )
  }

  next = next
    .split("\n")
    .map((line) => {
      // 内置 OpenCode 提供商保留原名（用户要求）；这里要放在品牌字样过滤之前，
      // 才能把已经替换过的「Dove Code Console」恢复成上游名称。
      if (line.includes('"provider.connect.opencode.name"')) {
        return line.replace(/("provider\.connect\.opencode\.name":\s*)"[^"]*"/, '$1"OpenCode Console"')
      }
      if (!line.includes("OpenCode") && !line.includes("Anomaly Innovations")) return line
      // 小写 opencode 出现在这些行里时代表 CLI 命令或配置文件名，不要动产品名之外的内容
      if (line.includes("registered trademark")) return line
      // 管理模型里上游免费系列保留原名（用户要求），只改品牌文案
      if (line.includes('"provider.connect.opencode.freeName"')) return line
      return line.replaceAll("OpenCode", brand.productName).replaceAll("Anomaly Innovations, Inc.", brand.company)
    })
    .join("\n")

  // HTML 标题
  next = next.replace(/<title>OpenCode<\/title>/g, `<title>${brand.productName}</title>`)

  const before = original.split("\n")
  const after = next.split("\n")
  if (after.length !== before.length) hits = Math.max(after.length, before.length)
  else hits = after.reduce((count, line, index) => count + (line === before[index] ? 0 : 1), 0)

  total += hits
  if (hits > 0) report.push(`${path.relative(root, file)}：${hits} 行`)
  if (!checkOnly && next !== original) writeFileSync(file, next, "utf8")
}

console.log(`\n品牌：${brand.productName}`)
if (report.length) for (const line of report) console.log("  " + line)
console.log(`\n${checkOnly ? "待修改" : "已修改"} ${total} 行，涉及 ${report.length} 个文件。`)
if (total === 0) console.log("（已经是品牌文案，或上游文案结构已变更）")
