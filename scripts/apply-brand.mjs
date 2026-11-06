#!/usr/bin/env node
/**
 *
 * 用法：
 *   node scripts/apply-brand.mjs           # 应用
 *   node scripts/apply-brand.mjs --check   # 只检查，不写入
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"

const root = path.resolve(import.meta.dirname, "..")
const vendor = path.join(root, "vendor", "opencode")
const desktop = path.join(vendor, "packages", "desktop")
const brand = JSON.parse(readFileSync(path.join(root, "brand", "brand.json"), "utf8"))
const checkOnly = process.argv.includes("--check")
const serviceFile = `${brand.artifactPrefix.replace(/-code$/, "")}.json`
const emailDomain =
  String(brand.company)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || brand.artifactPrefix
const publisherEmail = brand.publisherEmail ?? `dev@${emailDomain}.internal`

if (!existsSync(desktop)) {
  console.error(`找不到桌面端源码：${desktop}\n请先执行 git clone 到 vendor/opencode`)
  process.exit(1)
}

const changes = []
const warnings = []

/**
 * @param {string} file
 * @param {Array<{label: string, pattern: RegExp, to: string, done?: string, removed?: boolean}>} rules
 */
function patchFile(file, rules) {
  if (!existsSync(file)) {
    warnings.push(`跳过（文件不存在）：${path.relative(root, file)}`)
    return
  }
  const original = readFileSync(file, "utf8")
  let next = original

  for (const rule of rules) {
    rule.pattern.lastIndex = 0
    const matched = rule.pattern.test(next)
    rule.pattern.lastIndex = 0

    if (matched) {
      next = next.replace(rule.pattern, rule.to)
      changes.push(`${checkOnly ? "待应用" : "已替换"}：${rule.label}`)
    } else if (rule.removed) {
      // 删除类规则：正则不复存在就是期望状态（`done` 无法用于“文本应当消失”的场景）
      changes.push(`已应用：${rule.label}`)
    } else if (rule.done && next.includes(rule.done)) {
      changes.push(`已应用：${rule.label}`)
    } else {
      warnings.push(`未匹配：${rule.label}（上游结构可能已变更，请调整 scripts/apply-brand.mjs）`)
    }
  }

  if (!checkOnly && next !== original) {
    // NSIS 与部分上游脚本要求非 ASCII 内容带 BOM
    const needsBom = /[^\x00-\x7F]/.test(next) && next.charCodeAt(0) !== 0xfeff
    writeFileSync(file, needsBom ? `\uFEFF${next}` : next, "utf8")
  }
}

// 1) 打包身份（顺序有意义：先 productName，再协议名）
patchFile(path.join(desktop, "electron-builder.config.ts"), [
  {
    label: `appId -> ${brand.appId}`,
    pattern: /prod: "ai\.opencode\.desktop",/,
    to: `prod: "${brand.appId}",`,
    done: `prod: "${brand.appId}",`,
  },
  {
    label: `dev appId -> ${brand.appId}.dev`,
    pattern: /dev: "ai\.opencode\.desktop\.dev",/,
    to: `dev: "${brand.appId}.dev",`,
    done: `dev: "${brand.appId}.dev",`,
  },
  {
    label: `beta appId -> ${brand.appId}.beta`,
    pattern: /beta: "ai\.opencode\.desktop\.beta",/,
    to: `beta: "${brand.appId}.beta",`,
    done: `beta: "${brand.appId}.beta",`,
  },
  {
    label: `安装包文件名 -> ${brand.artifactPrefix}`,
    pattern: /artifactName: "opencode-desktop-\$\{os\}-\$\{arch\}\.\$\{ext\}",/,
    to: "artifactName: \"" + brand.artifactPrefix + '-${os}-${arch}.${ext}",',
    done: 'artifactName: "' + brand.artifactPrefix + "-",
  },
  {
    label: `productName -> ${brand.productName}`,
    pattern: /productName: "OpenCode",/,
    to: `productName: "${brand.productName}",`,
    done: `productName: "${brand.productName}",`,
  },
  {
    label: `dev 产品名 -> ${brand.productName} Dev`,
    pattern: /productName: "OpenCode Dev",/,
    to: `productName: "${brand.productName} Dev",`,
    done: `productName: "${brand.productName} Dev",`,
  },
  {
    label: `beta 产品名 -> ${brand.productName} Beta`,
    pattern: /productName: "OpenCode Beta",/,
    to: `productName: "${brand.productName} Beta",`,
    done: `productName: "${brand.productName} Beta",`,
  },
  {
    // 所有渠道统一协议：base / beta / prod 三处
    label: `URL 协议 -> ${brand.protocol}://`,
    pattern: /schemes: \["opencode"\]/g,
    to: `schemes: ["${brand.protocol}"]`,
    done: `schemes: ["${brand.protocol}"]`,
  },
  {
    // 此处 productName 已替换完毕，剩下的 name: "OpenCode" 都是协议显示名
    label: `协议显示名 -> ${brand.productName}`,
    pattern: /name: "OpenCode",/g,
    to: `name: "${brand.productName}",`,
    done: `name: "${brand.productName}",`,
  },
  {
    label: `beta 协议显示名 -> ${brand.productName} Beta`,
    pattern: /name: "OpenCode Beta",/g,
    to: `name: "${brand.productName} Beta",`,
    done: `name: "${brand.productName} Beta",`,
  },
  {
    label: "更新源 -> 内网",
    pattern: /url: "https:\/\/opencode\.ai\/update\/api\/latest\/desktop\/opencode\/",/,
    to: `url: "${brand.updateUrl}",`,
    done: `url: "${brand.updateUrl}",`,
  },
  {
    label: "beta 更新源 -> 内网",
    pattern: /url: "https:\/\/opencode\.ai\/update\/api\/beta\/desktop\/opencode\/",/,
    to: `url: "${brand.updateUrl}",`,
    done: `url: "${brand.updateUrl}",`,
  },
  {
    label: `Linux dev 包名 -> ${brand.artifactPrefix}-dev`,
    pattern: /packageName: "opencode-dev",/,
    to: `packageName: "${brand.artifactPrefix}-dev",`,
    done: `packageName: "${brand.artifactPrefix}-dev",`,
  },
  {
    label: `Linux beta 包名 -> ${brand.artifactPrefix}-beta`,
    pattern: /packageName: "opencode-beta",/,
    to: `packageName: "${brand.artifactPrefix}-beta",`,
    done: `packageName: "${brand.artifactPrefix}-beta",`,
  },
  {
    label: `Linux prod 包名 -> ${brand.artifactPrefix}`,
    pattern: /packageName: "opencode",/,
    to: `packageName: "${brand.artifactPrefix}",`,
    done: `packageName: "${brand.artifactPrefix}",`,
  },
])

// 2) 包元信息（安装器发布者、关于页链接会读这里）
patchFile(path.join(desktop, "package.json"), [
  {
    label: `publisher -> ${brand.company}`,
    pattern: /"name": "OpenCode",/,
    to: `"name": "${brand.company}",`,
    done: `"name": "${brand.company}",`,
  },
  {
    label: `版本号 -> ${brand.version}`,
    pattern: new RegExp(`"version": "(?!${brand.version.replace(/\./g, "\\.")}")[^"]+",`),
    to: `"version": "${brand.version}",`,
    done: `"version": "${brand.version}",`,
  },
  {
    label: "发布者邮箱",
    pattern: /"email": "hello@opencode\.ai"/,
    to: `"email": "${publisherEmail}"`,
    done: `"email": "${publisherEmail}"`,
  },
  {
    label: `homepage -> ${brand.supportUrl}`,
    pattern: /"homepage": "https:\/\/opencode\.ai",/,
    to: `"homepage": "${brand.supportUrl}",`,
    done: `"homepage": "${brand.supportUrl}",`,
  },
])

// 2.1) dev:desktop 的本地版本号也跟随品牌版本，避免关于页显示上游的 2.0.0-local。
patchFile(path.join(desktop, "scripts", "dev.ts"), [
  {
    label: `dev 本地版本 -> ${brand.version}-local`,
    // 负向断言让重复执行时不再把已品牌化的版本当成待替换项。
    pattern: new RegExp(
      "process\\.env\\.OPENCODE_VERSION \\?\\?= `(?!"
        + brand.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        + "-local-)[^`]+-local-\\$\\{Date\\.now\\(\\)\\}`",
    ),
    to: `process.env.OPENCODE_VERSION ??= \`${brand.version}-local-\${Date.now()}\``,
    done: `process.env.OPENCODE_VERSION ??= \`${brand.version}-local-`,
  },
])

// 2.5) 运行时身份：userData 目录、单实例锁、原生菜单名都基于这两个常量
//      不改的话会和本机已装的 OpenCode 抢同一份用户数据
//      dev/beta 也必须是品牌名：`dev:desktop`（未打包）走 dev 身份，
//      保留上游名会让开发态窗口/菜单显示 OpenCode。
patchFile(path.join(desktop, "src", "main", "constants.ts"), [
  {
    label: `运行时应用名 -> ${brand.productName}`,
    pattern: /prod: "OpenCode",/,
    to: `prod: "${brand.productName}",`,
    done: `prod: "${brand.productName}",`,
  },
  {
    label: `运行时应用名（dev）-> ${brand.productName} Dev`,
    pattern: /dev: "OpenCode Dev",/,
    to: `dev: "${brand.productName} Dev",`,
    done: `dev: "${brand.productName} Dev",`,
  },
  {
    label: `运行时应用名（beta）-> ${brand.productName} Beta`,
    pattern: /beta: "OpenCode Beta",/,
    to: `beta: "${brand.productName} Beta",`,
    done: `beta: "${brand.productName} Beta",`,
  },
  {
    label: `运行时 appId -> ${brand.appId}`,
    pattern: /prod: "ai\.opencode\.desktop",/,
    to: `prod: "${brand.appId}",`,
    done: `prod: "${brand.appId}",`,
  },
  {
    label: `运行时 appId（dev）-> ${brand.appId}.dev`,
    pattern: /dev: "ai\.opencode\.desktop\.dev",/,
    to: `dev: "${brand.appId}.dev",`,
    done: `dev: "${brand.appId}.dev",`,
  },
  {
    label: `运行时 appId（beta）-> ${brand.appId}.beta`,
    pattern: /beta: "ai\.opencode\.desktop\.beta",/,
    to: `beta: "${brand.appId}.beta",`,
    done: `beta: "${brand.appId}.beta",`,
  },
  {
    label: "未打包运行时身份 -> 品牌 dev 身份",
    pattern: /app\.isPackaged \? appNames\[CHANNEL\] : "OpenCode Dev"/,
    to: "app.isPackaged ? appNames[CHANNEL] : appNames.dev",
    done: "app.isPackaged ? appNames[CHANNEL] : appNames.dev",
  },
  {
    label: "未打包 appId -> 品牌 dev appId",
    pattern: /app\.isPackaged \? appIDs\[CHANNEL\] : "ai\.opencode\.desktop\.dev"/,
    to: "app.isPackaged ? appIDs[CHANNEL] : appIDs.dev",
    done: "app.isPackaged ? appIDs[CHANNEL] : appIDs.dev",
  },
])

// 3) Linux 桌面项（仅 Linux 打包需要）
patchFile(path.join(desktop, "resources", "linux", "opencode-desktop.desktop"), [
  {
    label: `Linux 菜单名 -> ${brand.productName}`,
    // 兼容任意遗留品牌名（OpenCode / Acme Code ...），已达标时不再匹配
    pattern: new RegExp(`^Name=(?!${brand.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$).+$`, "m"),
    to: `Name=${brand.productName}`,
    done: `Name=${brand.productName}`,
  },
])

// 3.5) 首次配置工具：随安装包分发，并在开始菜单建快捷方式
patchFile(path.join(desktop, "electron-builder.config.ts"), [
  {
    label: `安装目录名 -> ${brand.artifactPrefix}`,
    pattern: /(extraMetadata: \{)(\r?\n)(?!\s*name: "[^"]+",)/,
    to: `$1$2      name: "${brand.artifactPrefix}",$2`,
    done: `name: "${brand.artifactPrefix}",`,
  },
  {
    label: `安装包附带 ${brand.setupExe ?? "DoveCodeSetup.exe"} 与上游许可声明`,
    pattern:
      new RegExp(`filter: \\["opencode-cli", "opencode-cli\\.exe", "opencode-cli\\.version", "${brand.setupExe ?? "DoveCodeSetup.exe"}"(?:, "NOTICE-opencode\\.txt")?\\],`),
    to: `filter: ["opencode-cli", "opencode-cli.exe", "opencode-cli.version", "${brand.setupExe ?? "DoveCodeSetup.exe"}", "NOTICE-opencode.txt"],`,
    done: '"NOTICE-opencode.txt"],',
  },
])

// 3.6) 首次配置工具：把 wizard 构建产物同步到 resources，并清掉旧品牌残留
const setupName = brand.setupExe ?? `${brand.company}CodeSetup.exe`
const setupSource = path.join(root, "wizard", setupName)
const setupTarget = path.join(desktop, "resources", setupName)
if (existsSync(setupSource) && existsSync(path.dirname(setupTarget))) {
  const same = existsSync(setupTarget) && readFileSync(setupSource).equals(readFileSync(setupTarget))
  if (!same) {
    if (!checkOnly) copyFileSync(setupSource, setupTarget)
    changes.push(`${checkOnly ? "待复制" : "已复制"}：首次配置工具 ${setupName}`)
  } else {
    changes.push("已应用：首次配置工具")
  }
  for (const name of readdirSync(path.join(desktop, "resources"))) {
    if (name === setupName || !/Setup\.exe$/i.test(name)) continue
    if (!checkOnly) rmSync(path.join(desktop, "resources", name))
    changes.push(`${checkOnly ? "待删除" : "已删除"}：旧品牌安装器 ${name}`)
  }
} else {
  warnings.push(`未找到首次配置工具：wizard/${setupName}（先运行 wizard/build.ps1）`)
}

// 3.65) MIT 合规：上游要求「在所有副本中保留版权声明与许可声明」。
//       界面里不出现上游名称，所以以文件形式随安装包分发（安装目录 resources/NOTICE-opencode.txt）。
const noticeSource = path.join(root, "brand", "overrides", "NOTICE-opencode.txt")
const noticeTarget = path.join(desktop, "resources", "NOTICE-opencode.txt")
if (existsSync(noticeSource) && existsSync(path.dirname(noticeTarget))) {
  const next = readFileSync(noticeSource, "utf8")
  if (existsSync(noticeTarget) && readFileSync(noticeTarget, "utf8") === next) {
    changes.push("已应用：上游 MIT 许可声明")
  } else {
    if (!checkOnly) writeFileSync(noticeTarget, next, "utf8")
    changes.push(`${checkOnly ? "待写入" : "已写入"}：上游 MIT 许可声明（resources/NOTICE-opencode.txt）`)
  }
}

// 3.66) 列表排序：上游免费系列（provider id `opencode`）固定排在所有提供商之后。
//       排序规则原本只看 popularProviders 的下标，opencode 在下标 1，因此永远排第二。
//       以下是用户明确要求的顺序调整，不改变其它提供商的相对顺序。
patchFile(path.join(vendor, "packages", "app", "src", "providers", "models", "manage.tsx"), [
  {
    label: "管理模型：opencode 排最后",
    pattern: /(sortGroupsBy: \(a, b\) => \{\r?\n)(\s+)(const aRank = popularProviders\.indexOf\(a\.category\))/,
    to: '$1$2if (a.category === "opencode") return 1\n$2if (b.category === "opencode") return -1\n$2$3',
    done: 'if (a.category === "opencode") return 1',
  },
])

patchFile(path.join(vendor, "packages", "app", "src", "settings", "models", "models.tsx"), [
  {
    label: "设置 · 模型：opencode 排最后",
    pattern: /(sortGroupsBy: \(a, b\) => \{\r?\n)(\s+)(const aIndex = popularProviders\.indexOf\(a\.category\))/,
    to: '$1$2if (a.category === "opencode") return 1\n$2if (b.category === "opencode") return -1\n$2$3',
    done: 'if (a.category === "opencode") return 1',
  },
])

patchFile(path.join(vendor, "packages", "app", "src", "providers", "models", "select-dialog.tsx"), [
  {
    label: "模型选择器：合并重复的 opencode 排序规则",
    pattern:
      /(\r?\n)(\s+)(if \(a\.category === "opencode"\) return 1\r?\n\s+if \(b\.category === "opencode"\) return -1)(?:\r?\n\s+if \(a\.category === "opencode"\) return 1\r?\n\s+if \(b\.category === "opencode"\) return -1)+/,
    to: "$1$2$3",
    done: 'if (a.category === "opencode") return 1',
    removed: true,
  },
  {
    label: "模型选择器：opencode 排最后",
    pattern:
      /(const sortModelGroups = \(a: \{ category: string; items: ModelItem\[\] \}, b: \{ category: string; items: ModelItem\[\] \}\) => \{\r?\n)(\s+)(const aIndex = popularProviders\.indexOf\(a\.category\))/,
    to: '$1$2if (a.category === "opencode") return 1\n$2if (b.category === "opencode") return -1\n$2$3',
    done: 'if (a.category === "opencode") return 1',
  },
  {
    label: "模型选择器：免费 opencode 组显示为 OpenCode Free",
    pattern: /fallback=\{<span class="min-w-0 truncate">\{group\.items\[0\]\.provider\.name\}<\/span>\}/,
    to:
      "fallback={\n" +
      '                            <span class="min-w-0 truncate">\n' +
      "                              {group.items.every(isFreeModel)\n" +
      '                                ? language.t("provider.connect.opencode.freeName")\n' +
      "                                : group.items[0].provider.name}\n" +
      "                            </span>\n" +
      "                          }",
    done: "group.items.every(isFreeModel)",
  },
])

patchFile(path.join(vendor, "packages", "app", "src", "settings", "providers", "providers.tsx"), [
  {
    label: "设置 · 提供商：opencode / opencode-go 排最后",
    pattern: /(items\.sort\(\(a, b\) => popularProviders\.indexOf\(a\.id\) - popularProviders\.indexOf\(b\.id\)\))/,
    to:
      'items.sort((a, b) => {\n' +
      '      const trailing = (id: string) => (id === "opencode" ? 2 : id === "opencode-go" ? 1 : 0)\n' +
      "      if (trailing(a.id) !== trailing(b.id)) return trailing(a.id) - trailing(b.id)\n" +
      "      return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id)\n" +
      "    })",
    done: 'const trailing = (id: string) =>',
  },
  {
    label: "设置 · 提供商：去掉 opencode 两行的「推荐」标签",
    pattern:
      /\r?\n\s*<Show when=\{item\.id === "opencode" \|\| item\.id === "opencode-go"\}>\r?\n\s*<Badge>\{language\.t\("dialog\.provider\.tag\.recommended"\)\}<\/Badge>\r?\n\s*<\/Show>/,
    to: "",
    removed: true,
  },
])

// 3.67) 连接提供商弹窗（设置里的「+ 连接」、会话里的「连接提供商」共用）
//       同样把 opencode 的两个内置项排到「热门」末尾，并去掉它们的「推荐」标签。
//       注意：这里只调「热门」分组内部的顺序，不改分组归属，也不动 tagline。
patchFile(path.join(vendor, "packages", "app", "src", "providers", "connect", "dialog.tsx"), [
  {
    label: "连接提供商：opencode / opencode-go 排到「热门」末尾",
    pattern: /const featured = \["opencode-go", "opencode", "anthropic", "openai", "google", "openrouter", "vercel"\]/,
    to: 'const featured = ["anthropic", "openai", "google", "openrouter", "vercel", "opencode-go", "opencode"]',
    done: 'const featured = ["anthropic", "openai", "google", "openrouter", "vercel", "opencode-go", "opencode"]',
  },
  {
    label: "连接提供商：去掉 opencode 两行的「推荐」标签",
    pattern:
      /\r?\n\s*<span class="flex h-4 shrink-0 items-center rounded-xs border-\[0\.5px\] border-v2-border-border-base bg-v2-background-bg-layer-03 px-1 text-\[11px\] font-\[530\] leading-none tracking-\[0\.05px\] text-v2-text-text-muted">\r?\n\s*\{language\.t\("dialog\.provider\.tag\.recommended"\)\}\r?\n\s*<\/span>/,
    to: "",
    removed: true,
  },
])

// 3.6) 安装脚本整文件覆盖：开始菜单快捷方式、卸载清理、安装时写入“未配置”安全默认值
const installerNsh = path.join(desktop, "resources", "windows", "installer.nsh")
const installerOverride = path.join(root, "brand", "overrides", "installer.nsh")
if (existsSync(installerOverride) && existsSync(installerNsh)) {
  // NSIS 只接受一个 UTF-8 BOM；重复 BOM 会被解析成 “?!macro” 并导致安装包构建失败。
  const stripBom = (text) => text.replace(/^\uFEFF+/, "")
  const next = `\uFEFF${stripBom(readFileSync(installerOverride, "utf8"))}`
  if (readFileSync(installerNsh, "utf8") === next) {
    changes.push("已应用：安装脚本")
  } else {
    // 脚本含中文，保留单个 BOM 让 NSIS 按 UTF-8 解析。
    if (!checkOnly) writeFileSync(installerNsh, next, "utf8")
    changes.push(`${checkOnly ? "待替换" : "已替换"}：安装脚本`)
  }
}

// 3.68) 免费模型选择弹窗（会话首页的「选择模型」）
// ==========================================
// Logo 品牌自动化适配与幂等性校验逻辑
// ==========================================

// 1. 获取当前产品名的首字母（例如 'a', 'd', 'o' 等）
const firstLetter = brand.productName.trim().charAt(0).toLowerCase();

// 2. 利用脚本原有的 path 和 vendor 变量定位目标 logo.tsx 文件
const logoFilePath = path.join(vendor, "packages", "ui", "src", "components", "logo.tsx");
let logoContent = "";
try {
  logoContent = readFileSync(logoFilePath, "utf8");
} catch (e) {
  console.log("⚠️ 警告: 未找到 logo.tsx，将由后续流程创建或报错。");
}

// 3. 检查当前文件里是否已经包含了对应首字母的标记（实现幂等性）
const hasTargetMark = logoContent.includes(`data-slot="logo-mark-${firstLetter}"`);
const hasTargetSplash = logoContent.includes(`data-slot="logo-splash-${firstLetter}"`);

if (hasTargetMark && hasTargetSplash) {
  console.log(`✅ 当前品牌首字母为 "${firstLetter.toUpperCase()}"，Logo 已经是最新的，无需重复修改！`);
} else {
  console.log(`🔄 检测到品牌首字母已变更为 "${firstLetter.toUpperCase()}"，正在更新 Logo 组件...`);

  // 4. 根据不同的首字母动态准备对应的 SVG 路径代码
  let markSvg = '';
  let splashSvg = '';

  if (firstLetter === 'd') {
    // 字母 D 的 SVG 路径
    markSvg = '<path data-slot="logo-mark-d" d="M4 2.5V17.5H8C12 17.5 14 14.5 14 10S12 2.5 8 2.5H4Z" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />';
    splashSvg = '<path data-slot="logo-splash-d" d="M24 14V88H40C59 88 70 73 70 51S59 14 40 14H24Z" stroke="var(--icon-strong-base)" stroke-width="10" stroke-linecap="round" fill="none" />';
  } else if (firstLetter === 'o') {
    // 字母 O 的 SVG 路径（已对齐 D 字母的画布左右边界与视口宽度，确保右侧饱满不缺边）
    markSvg = '<path data-slot="logo-mark-o" d="M4 10C4 5.85786 7.35786 2.5 11.5 2.5C15.6421 2.5 19 5.85786 19 10C19 14.1421 15.6421 17.5 11.5 17.5C7.35786 17.5 4 14.1421 4 10Z" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />';
    splashSvg = '<path data-slot="logo-splash-o" d="M50 14C69.8823 14 86 30.1177 86 50C86 69.8823 69.8823 86 50 86C30.1177 86 14 69.8823 14 50C14 30.1177 30.1177 14 50 14Z" stroke="var(--icon-strong-base)" stroke-width="10" stroke-linecap="round" fill="none" />';
  } else {
    // 默认的 A 路径（若首字母为 a 或其他未单独定义的字母）
    markSvg = '<path data-slot="logo-mark-a" d="M8 2.5 13.5 18" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />\n' +
              '      <path data-slot="logo-mark-a" d="M8 2.5 2.5 18" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />\n' +
              '      <path data-slot="logo-mark-a" d="M5 12.5H11" stroke="var(--icon-strong-base)" stroke-width="2.4" stroke-linecap="round" fill="none" />';
    splashSvg = '<path data-slot="logo-splash-a" d="M40 14 66 88M40 14 14 88M24 62H56" stroke="var(--icon-strong-base)" stroke-width="10" stroke-linecap="round" fill="none" />';
  }

  // 5. 执行补丁替换（通过通配符正则抹平历史版本差异，精准写入当前首字母资源）
  patchFile(logoFilePath, [
    {
      label: `方块标记 -> 自动适配 ${firstLetter.toUpperCase()}`,
      pattern: /(<svg\b[^>]*data-component="logo-mark"[^>]*>)[\s\S]*?(<\/svg>)/,
      to: `$1\n      ${markSvg}\n    $2`,
      done: `data-slot="logo-mark-${firstLetter}"`,
    },
    {
      label: `启动画面标记 -> 自动适配 ${firstLetter.toUpperCase()}`,
      pattern: /(<svg\b[^>]*data-component="logo-splash"[^>]*>)[\s\S]*?(<\/svg>)/,
      to: `$1\n      ${splashSvg}\n    $2`,
      done: `data-slot="logo-splash-${firstLetter}"`,
    },
    {
      label: `字标 -> ${brand.productName}`,
      pattern: /<g>[\s\S]*?<\/g>|<g data-slot="logo-wordmark">\s*<text x="0"[^>]*>[\s\S]*?<\/g>/,
      to:
        '<g data-slot="logo-wordmark">\n' +
        '        <text x="117" y="31" text-anchor="middle" font-family="Inter, \'Segoe UI\', system-ui, sans-serif" font-size="36" font-weight="600" letter-spacing="-1" fill="var(--icon-base)">' +
        brand.productName +
        "</text>\n" +
        "      </g>",
      done: 'x="117" y="31"',
    },
  ]);
}

// 启动页使用独立的 Wordmark 组件，上游把 "opencode" 直接画成了 8 段 SVG 路径。
// 这里生成品牌字标：文字 + 一条参与描边动画的下划线，保证 splash 的 onAnimationEnd 仍会触发。
const wordmarkTarget = path.join(
  vendor,
  "packages",
  "ui",
  "src",
  "typography",
  "wordmark",
  "wordmark.tsx",
)
if (existsSync(wordmarkTarget)) {
  const label = brand.productName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  const wordmark = `import { type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g data-slot="wordmark-brand" opacity={props.muted === false ? 1 : 0.6}>
        <text
          x="360"
          y="76"
          text-anchor="middle"
          font-family="Inter, 'Segoe UI', system-ui, sans-serif"
          font-size="64"
          font-weight="600"
          letter-spacing="-2"
          fill={props.outline ? "none" : "currentColor"}
          stroke={props.outline ? "currentColor" : undefined}
          stroke-width={props.outline ? 1 : undefined}
        >${label}</text>
        <path
          data-slot="wordmark-underline"
          d="M180 98H540"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          pathLength={1}
        />
      </g>
    </svg>
  )
}
`
  const original = readFileSync(wordmarkTarget, "utf8").replace(/^\uFEFF/, "")
  if (original === wordmark) {
    changes.push("已应用：启动页字标")
  } else {
    if (!checkOnly) writeFileSync(wordmarkTarget, wordmark, "utf8")
    changes.push(`${checkOnly ? "待替换" : "已替换"}：启动页字标`)
  }
}

// 3.9) 运行目录改名：绝不读写官方 OpenCode 的 ~/.config/opencode、~/.local/share/opencode
patchFile(path.join(vendor, "packages", "util", "src", "global.ts"), [
  {
    label: `配置/数据目录 -> ${brand.artifactPrefix}`,
    pattern: /const app = "opencode"/,
    to: `const app = "${brand.artifactPrefix}"`,
    done: `const app = "${brand.artifactPrefix}"`,
  },
])

// 桌面端主进程用 @opencode/client 读「后台服务注册文件」。它默认写死 opencode/service.json，
// 不改的话会读到官方 OpenCode 的注册文件：版本对不上 → 去 kill 官方后台服务 → 自己起的服务
// 又写在 dove-code 目录，客户端永远找不到 → 报 "Timed out waiting for the background service"。
patchFile(path.join(vendor, "packages", "client", "src", "service-probe.ts"), [
  {
    label: `后台服务注册文件 -> ${brand.artifactPrefix}/service-${serviceFile}`,
    pattern: /join\(process\.env\["XDG_STATE_HOME"\] \?\? join\(homedir\(\), "\.local", "state"\), "opencode", "service\.json"\)/,
    to: `join(process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"), "${brand.artifactPrefix}", "service-${serviceFile}")`,
    done: `"${brand.artifactPrefix}", "service-${serviceFile}"`,
  },
])

patchFile(path.join(vendor, "packages", "core", "src", "config.ts"), [
  {
    label: `默认配置文件 -> ${brand.artifactPrefix}.jsonc`,
    pattern: /path\.join\(directory, "opencode\.jsonc"\)/,
    to: `path.join(directory, "${brand.artifactPrefix}.jsonc")`,
    done: `path.join(directory, "${brand.artifactPrefix}.jsonc")`,
  },
])

patchFile(path.join(vendor, "packages", "core", "src", "config", "discovery.ts"), [
  {
    label: `配置文件 -> ${brand.artifactPrefix}.json(c)`,
    pattern: /export const names = \["opencode\.json", "opencode\.jsonc"\]/,
    to: `export const names = ["${brand.artifactPrefix}.json", "${brand.artifactPrefix}.jsonc"]`,
    done: `"${brand.artifactPrefix}.jsonc"]`,
  },
  {
    label: "系统级配置目录（macOS）",
    pattern: /"\/Library\/Application Support\/opencode"/,
    to: `"/Library/Application Support/${brand.artifactPrefix}"`,
    done: `Application Support/${brand.artifactPrefix}`,
  },
  {
    label: "系统级配置目录（Windows）",
    pattern: /env\.ProgramData \|\| "C:\\\\ProgramData", "opencode"/,
    to: `env.ProgramData || "C:\\\\ProgramData", "${brand.artifactPrefix}"`,
    done: `"C:\\\\ProgramData", "${brand.artifactPrefix}"`,
  },
  {
    label: "系统级配置目录（Linux）",
    pattern: /AbsolutePath\.make\("\/etc\/opencode"\)/,
    to: `AbsolutePath.make("/etc/${brand.artifactPrefix}")`,
    done: `/etc/${brand.artifactPrefix}`,
  },
])

patchFile(path.join(desktop, "src", "main", "native", "logging.ts"), [
  {
    label: "服务日志目录",
    pattern: /path\.join\(xdgData, "opencode", "log"\), path\.join\(app\.getPath\("userData"\), "opencode", "log"\)/,
    to: `path.join(xdgData, "${brand.artifactPrefix}", "log"), path.join(app.getPath("userData"), "${brand.artifactPrefix}", "log")`,
    done: `"${brand.artifactPrefix}", "log"`,
  },
])

patchFile(path.join(desktop, "src", "main", "lifecycle", "environment.ts"), [
  {
    label: `默认协议 -> ${brand.protocol}://`,
    pattern: /app\.setAsDefaultProtocolClient\("opencode"\)/,
    to: `app.setAsDefaultProtocolClient("${brand.protocol}")`,
    done: `setAsDefaultProtocolClient("${brand.protocol}")`,
  },
])

patchFile(path.join(desktop, "src", "main", "service", "background-service.ts"), [
  {
    label: "本地服务状态文件目录",
    pattern: /"opencode",(\r?\n\s*)"service-local\.json"/,
    to: `"${brand.artifactPrefix}",$1"service-local.json"`,
    done: `"${brand.artifactPrefix}",`,
  },
])

patchFile(path.join(desktop, "src", "main", "service", "desktop-cli.ts"), [
  {
    label: "home 目录下的 CLI 安装位置",
    pattern: /path\.join\(home, "\.opencode", "bin", "opencode"\)/,
    to: `path.join(home, ".${brand.artifactPrefix}", "bin", "${brand.artifactPrefix}")`,
    done: `".${brand.artifactPrefix}", "bin"`,
  },
])

// 3.95) 界面残留的品牌字样
patchFile(path.join(vendor, "packages", "app", "src", "shell", "titlebar", "windows-menu.tsx"), [
  {
    label: `左上角菜单标题 -> ${brand.productName}`,
    pattern: /<Menu\.GroupLabel class="desktop-app-menu-heading">OpenCode<\/Menu\.GroupLabel>/,
    to: `<Menu.GroupLabel class="desktop-app-menu-heading">${brand.productName}</Menu.GroupLabel>`,
    done: `>${brand.productName}</Menu.GroupLabel>`,
  },
])

patchFile(path.join(vendor, "packages", "app", "src", "servers", "connect", "screen.tsx"), [
  {
    label: `连接页品牌 aria-label -> ${brand.productName}`,
    pattern: /aria-label="OpenCode"/,
    to: `aria-label="${brand.productName}"`,
    done: `aria-label="${brand.productName}"`,
  },
])

patchFile(path.join(vendor, "packages", "ui", "src", "context", "highlight-theme.tsx"), [
  {
    label: `代码高亮主题名 -> ${brand.productName}`,
    pattern: /^(\s*)name: "OpenCode",/m,
    to: `$1name: "${brand.productName}",`,
    done: `name: "${brand.productName}",`,
  },
])

patchFile(path.join(vendor, "packages", "ui", "src", "theme", "context.tsx"), [
  {
    label: `主题名 -> ${brand.productName}`,
    pattern: /"oc-2": "OpenCode",/,
    to: `"oc-2": "${brand.productName}",`,
    done: `"oc-2": "${brand.productName}",`,
  },
])

// 设置 → 外观 → 主题 下拉框显示的是主题 JSON 里的 name 字段，不是 context.tsx 的映射表。
patchFile(path.join(vendor, "packages", "ui", "src", "theme", "themes", "oc-2.json"), [
  {
    label: `内置主题名（oc-2.json）-> ${brand.productName}`,
    pattern: /"name": "OpenCode",/,
    to: `"name": "${brand.productName}",`,
    done: `"name": "${brand.productName}",`,
  },
])

patchFile(path.join(vendor, "packages", "session-ui", "src", "tools", "tool-renderer.tsx"), [
  {
    label: `工具名 -> ${brand.productName}`,
    pattern: /\["opencode", "OpenCode"\]/,
    to: `["opencode", "${brand.productName}"]`,
    done: `["opencode", "${brand.productName}"]`,
  },
])

// 3.96) 菜单结构：把「设置」从 文件 子菜单提到顶层，紧跟「文件」（Windows 左上角菜单）
patchFile(path.join(vendor, "packages", "app", "src", "shell", "commands", "desktop-menu.ts"), [
  {
    label: "顶层菜单支持直接执行命令",
    pattern:
      /export type DesktopMenu = \{\r?\n  id: string\r?\n  labelKey: DesktopNativeKey\r?\n  role\?: DesktopMenuRole\r?\n  items\?: DesktopMenuEntry\[\]/,
    to: [
      "export type DesktopMenu = {",
      "  id: string",
      "  labelKey: DesktopNativeKey",
      "  role?: DesktopMenuRole",
      "  // 顶层直接执行命令、不展开子菜单（Windows 左上角菜单用）",
      "  command?: string",
      "  items?: DesktopMenuEntry[]",
    ].join("\n"),
    done: "顶层直接执行命令",
  },
  {
    label: "顶层新增「设置」，紧跟「文件」",
    pattern:
      /(      \{ type: "item", labelKey: "desktop\.menu\.closeWindow", action: "window\.close", role: "close" \},\r?\n    \],\r?\n  \},\r?\n)(  \{\r?\n    id: "edit",)/,
    to: [
      "$1  {",
      '    id: "settings",',
      '    labelKey: "desktop.menu.settings",',
      '    command: "settings.open",',
      '    platforms: ["windows"],',
      "  },",
      "$2",
    ].join("\n"),
    done: 'id: "settings",',
  },
  {
    label: "移除「文件」子菜单里的设置项（避免重复）",
    pattern:
      /      \{\r?\n        type: "item",\r?\n        labelKey: "desktop\.menu\.settings",\r?\n        command: "settings\.open",\r?\n        accelerator: \{ windows: "Ctrl\+," \},\r?\n        platforms: \["windows"\],\r?\n      \},\r?\n/,
    to: "",
    done: 'id: "settings",',
  },
])

patchFile(path.join(vendor, "packages", "app", "src", "shell", "titlebar", "windows-menu.tsx"), [
  {
    label: "顶层命令项渲染成普通菜单项",
    pattern:
      /            <For each=\{DESKTOP_MENU\.filter\(\(menu\) => desktopMenuVisible\(menu, "windows"\)\)\}>\r?\n              \{\(menu\) => \(\r?\n                <DesktopMenuSubmenu label=\{language\.t\(menu\.labelKey\)\}>/,
    to: [
      '            <For each={DESKTOP_MENU.filter((menu) => desktopMenuVisible(menu, "windows"))}>',
      "              {(menu) => {",
      "                const command = menu.command",
      "",
      "                // 顶层命令项（例如「设置」）直接执行，不展开子菜单",
      "                if (command)",
      "                  return (",
      "                    <DesktopMenuItem",
      "                      label={language.t(menu.labelKey)}",
      "                      keybind={props.command.keybind(command)}",
      "                      disabled={commandDisabled(command)}",
      "                      onSelect={() => runCommand(command)}",
      "                    />",
      "                  )",
      "",
      "                return (",
      "                  <DesktopMenuSubmenu label={language.t(menu.labelKey)}>",
    ].join("\n"),
    done: "顶层命令项（例如「设置」）",
  },
  {
    label: "顶层命令项渲染分支收尾",
    pattern: /                <\/DesktopMenuSubmenu>\r?\n              \)\}\r?\n            <\/For>/,
    to: ["                  </DesktopMenuSubmenu>", "                )", "              }}", "            </For>"].join("\n"),
    done: "                )\n              }}\n            </For>",
  },
])

// 3.97) 关于页：整页替换（原页面上游文字标志、贡献者名单、GitHub 链接）
const aboutOverride = path.join(root, "brand", "overrides", "settings-about.tsx")
const aboutTarget = path.join(vendor, "packages", "app", "src", "settings", "about", "about.tsx")
if (existsSync(aboutOverride) && existsSync(aboutTarget)) {
  const next = readFileSync(aboutOverride, "utf8")
  if (readFileSync(aboutTarget, "utf8") === next) {
    changes.push("已应用：关于页")
  } else {
    if (!checkOnly) writeFileSync(aboutTarget, next, "utf8")
    changes.push(`${checkOnly ? "待替换" : "已替换"}：关于页`)
  }
}

patchFile(path.join(vendor, "packages", "app", "src", "settings", "shell.tsx"), [
  {
    label: "关于页调用（去掉动画参数）",
    pattern: /<SettingsAbout active=\{surface\.view\(\)\.tab === "about"\} \/>/,
    to: "<SettingsAbout />",
    done: "<SettingsAbout />",
  },
])

// 3.98) 外链与通知图标：内部构建不允许跳转到 opencode.ai（文档、反馈、Console、Go 升级）
const opencodeLinks = [
  "packages/app/src/settings/appearance/appearance.tsx",
  "packages/app/src/settings/providers/extensions.tsx",
  "packages/app/src/settings/workspaces/project-extensions.tsx",
  "packages/app/src/shell/commands/desktop-menu.ts",
  "packages/app/src/home/projects/controller.tsx",
  "packages/app/src/shell/errors/error.tsx",
  "packages/app/src/shell/titlebar/titlebar.tsx",
  "packages/app/src/providers/credentials/dialog.tsx",
  "packages/app/src/providers/connect/dialog.tsx",
  "packages/app/src/session/usage-exceeded-dialogs.tsx",
]
for (const rel of opencodeLinks) {
  patchFile(path.join(vendor, rel), [
    {
      label: `外链 -> ${brand.supportUrl}`,
      pattern: /https:\/\/opencode\.ai[^"`\s)]*/g,
      to: brand.supportUrl,
      done: brand.supportUrl,
    },
  ])
}

for (const rel of [
  "packages/desktop/src/renderer/platform/notifications.ts",
  "packages/app/src/runtime/platform/web.ts",
]) {
  patchFile(path.join(vendor, rel), [
    {
      label: "通知图标（去掉 opencode.ai 图标地址）",
      pattern: /^\s*icon: "https:\/\/opencode\.ai\/favicon-96x96-v3\.png",\r?\n/gm,
      to: "      // 通知图标沿用系统/应用图标\n",
      done: "通知图标沿用系统/应用图标",
    },
  ])
}

// 3.99) 自动更新：内部构建没有更新服务器。检查走本地短路，恒返回「已是最新版本」，
//      既不联网（原来会报 ERR_CONNECTION_CLOSED），也不显示「不支持更新」
patchFile(path.join(vendor, "packages", "gui-extensions", "src", "updater", "main.ts"), [
  {
    label: "更新检查入口保持启用",
    pattern: /const enabled = false/,
    to: 'const enabled = build.packaged && build.channel !== "dev"',
    done: 'const enabled = build.packaged && build.channel !== "dev"',
  },
  {
    label: "更新检查平台层改为本地短路",
    pattern:
      /  \/\/ electron-updater loads only in packaged builds that update, after the first window is up\.\r?\n  const platform = enabled\r?\n    \? await import\("\.\/platform"\)\.then\(\(module\) => runPromise\(module\.make\(build\.channel\)\)\)\r?\n    : undefined/,
    to: [
      "  // 内部构建没有更新服务器：检查恒为「已是最新版本」，不发起网络请求。",
      "  const platform: Platform | undefined = enabled",
      "    ? {",
      "        checkForUpdate: Effect.succeed(undefined),",
      "        stageUpdate: () => Effect.void,",
      "        installAndRestart: Effect.void,",
      "      }",
      "    : undefined",
    ].join("\n"),
    done: "checkForUpdate: Effect.succeed(undefined)",
  },
  {
    label: "引入 Platform 类型",
    pattern: /import \{ make \} from "\.\/machine"/,
    to: 'import { make, type Platform } from "./machine"',
    done: 'import { make, type Platform } from "./machine"',
  },
])

// 4) 图标：prebuild 会用 icons/<channel> 整个覆盖 resources/icons，所以必须写这里
//    dev:desktop 走 dev 渠道，dev/beta 也要替换，否则开发态窗口/任务栏还是上游图标。
const iconSource = path.join(root, "brand", "icons")
const iconChannels = ["prod", "dev", "beta"]
if (existsSync(iconSource)) {
  const icons = readdirSync(iconSource).filter((name) => /\.(ico|icns|png)$/i.test(name))
  if (!icons.length) {
    warnings.push("brand/icons 为空：沿用上游图标（建议至少提供 icon.ico / icon.icns / icon.png）")
  }
  for (const channel of iconChannels) {
    const iconTarget = path.join(desktop, "icons", channel)
    for (const name of icons) {
      if (!checkOnly) {
        mkdirSync(iconTarget, { recursive: true })
        copyFileSync(path.join(iconSource, name), path.join(iconTarget, name))
      }
      changes.push(`${checkOnly ? "待复制" : "已复制"}图标（${channel}）：${name}`)
    }
  }
} else {
  warnings.push("缺少 brand/icons 目录：沿用上游图标")
}

console.log(`\n品牌：${brand.productName}（${brand.appId}）`)
console.log(`目标：${path.relative(root, desktop)}\n`)
for (const line of changes) console.log("  " + line)
for (const line of warnings) console.log("  ! " + line)
console.log(
  `\n${checkOnly ? "检查完成" : "应用完成"}：${changes.length} 项变更，${warnings.length} 项提示。\n` +
    `下一步：\n` +
    `  1) 安装 Bun 1.4.4+（打包脚本依赖 Bun）\n` +
    `  2) cd vendor/opencode && bun install\n` +
    `  3) 先编译 CLI（桌面端 prebuild 会从这里复制 opencode-cli.exe）\n` +
    `     推荐：node scripts/build-cli.mjs\n` +
    `     等价手动命令：\n` +
    `       cd vendor/opencode/packages/cli\n` +
    `       $env:OPENCODE_CHANNEL = '${brand.provider}'\n` +
    `       $env:OPENCODE_VERSION = "${brand.version}-${brand.provider}-$(Get-Date -Format 'yyyyMMddHHmmss')"\n` +
    `       bun run script/build.ts --target=opencode-windows-x64-baseline\n` +
    `       Remove-Item Env:OPENCODE_CHANNEL\n` +
    `       Remove-Item Env:OPENCODE_VERSION\n` +
    `  4) 再编译并打包桌面端：\n` +
    `     cd vendor/opencode/packages/desktop\n` +
    `     $env:OPENCODE_CHANNEL = 'prod'\n` +
    `     $env:OPENCODE_CLI_DIST = "$PWD\\..\\cli\\dist"\n` +
    `     bun run prebuild; bun run build; bun run package:win\n`,
)
