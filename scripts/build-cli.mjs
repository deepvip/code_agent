#!/usr/bin/env node
/**
 * 用法：
 *   node scripts/build-cli.mjs
 *   node scripts/build-cli.mjs --target=opencode-windows-x64-baseline
 *   node scripts/build-cli.mjs --skip-web-ui
 *   node scripts/build-cli.mjs --dry-run
 */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { spawnSync } from "node:child_process"

const root = path.resolve(import.meta.dirname, "..")
const brand = JSON.parse(readFileSync(path.join(root, "brand", "brand.json"), "utf8"))
const cli = path.join(root, "vendor", "opencode", "packages", "cli")
const target = process.argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length)
  ?? "opencode-windows-x64-baseline"
const passthrough = process.argv.slice(2).filter((arg) => arg === "--skip-web-ui")
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
const version = `${brand.version}-${brand.provider}-${timestamp}`

console.log(`Building ${brand.productName} CLI ${version} (channel ${brand.provider}, target ${target})`)

if (process.argv.includes("--dry-run")) {
  console.log(`OPENCODE_CHANNEL=${brand.provider}`)
  console.log(`OPENCODE_VERSION=${version}`)
  console.log(`bun run script/build.ts --target=${target}${passthrough.length ? " " + passthrough.join(" ") : ""}`)
  process.exit(0)
}

const result = spawnSync(
  findBun(),
  ["run", "script/build.ts", `--target=${target}`, ...passthrough],
  {
    cwd: cli,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      OPENCODE_CHANNEL: brand.provider,
      OPENCODE_VERSION: version,
    },
  },
)

if (result.error) throw result.error
process.exit(result.status ?? 1)

function findBun() {
  if (process.env.BUN) return process.env.BUN
  const home = process.env.USERPROFILE ?? process.env.HOME
  const binary = process.platform === "win32" ? "bun.exe" : "bun"
  const candidates = [
    home && path.join(home, ".bun", "bin", binary),
    binary,
  ]
  return candidates.find((candidate) => candidate && (candidate === binary || existsSync(candidate))) ?? binary
}
