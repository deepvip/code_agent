<#
.SYNOPSIS
  部署 Aero 研发助手的托管配置。

.DESCRIPTION
  两种作用域：
    Machine  配置写入 %ProgramData%\aero-code —— 全机生效，用户不可覆盖（推荐）
    User     配置写入 %USERPROFILE%\.config\aero-code —— 仅当前用户

  两处部署时的路径改写：
    1. instructions 会被改写成绝对路径。V2 里相对路径按「用户打开的工作区」解析，
       不是按配置文件所在目录，直接下发相对路径会指向用户的代码仓库。
    2. 技能走目录约定：配置目录下的 skills\ 会被自动扫描，不需要写 skills 字段。

  主题文件写到用户级配置目录，因为 V2 的主题发现只扫描全局配置目录与项目的 .opencode/themes。

.PARAMETER Scope
  Machine（默认）或 User。

.PARAMETER DryRun
  只打印将要执行的操作，不写文件。

.EXAMPLE
  .\scripts\install-managed-config.ps1 -DryRun
  .\scripts\install-managed-config.ps1 -Scope Machine
#>
[CmdletBinding()]
param(
  [ValidateSet('Machine', 'User')]
  [string]$Scope = 'Machine',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $root 'aero-code.jsonc'
if (-not (Test-Path $configFile)) { throw "找不到配置文件：$configFile" }

if ($Scope -eq 'Machine') {
  $target = Join-Path $env:ProgramData 'aero-code'
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
  )
  if (-not $isAdmin -and -not $DryRun) {
    throw '写入 %ProgramData% 需要管理员权限。请用管理员 PowerShell 运行，或改用 -Scope User。'
  }
} else {
  $target = Join-Path $env:USERPROFILE '.config\aero-code'
}

$themeTarget = Join-Path $env:USERPROFILE '.config\aero-code\themes'

function Copy-Tree {
  param([string]$From, [string]$To)
  if (-not (Test-Path $From)) { Write-Host "  跳过（不存在）：$From" -ForegroundColor DarkGray; return }
  if ($DryRun) { Write-Host "  [dry-run] $From -> $To" -ForegroundColor Cyan; return }
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  Copy-Item -Path (Join-Path $From '*') -Destination $To -Recurse -Force
  Write-Host "  已复制：$From -> $To" -ForegroundColor Green
}

function Backup-IfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    $backup = "$Path.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
    if (-not $DryRun) { Copy-Item $Path $backup -Force }
    Write-Host "  已备份：$backup" -ForegroundColor Yellow
  }
}

Write-Host "`nAero 研发助手 · 配置部署" -ForegroundColor White
Write-Host "作用域：$Scope"
Write-Host "目标目录：$target`n"

# 1) 主配置：把 instructions 改写成绝对路径（V2 的相对路径按工作区解析）
$targetConfig = Join-Path $target 'aero-code.jsonc'
$instructions = ($target -replace '\\', '/') + '/prompts/AGENTS.md'

Backup-IfExists $targetConfig
Backup-IfExists (Join-Path $target 'aero-code.json')

if ($DryRun) {
  Write-Host "  [dry-run] $configFile -> $targetConfig"
  Write-Host "  [dry-run] instructions -> $instructions" -ForegroundColor Cyan
} else {
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  $text = [System.IO.File]::ReadAllText($configFile, [System.Text.Encoding]::UTF8)
  $text = [System.Text.RegularExpressions.Regex]::Replace(
    $text,
    '"instructions"\s*:\s*\[[^\]]*\]',
    ('"instructions": ["' + $instructions + '"]')
  )
  [System.IO.File]::WriteAllText($targetConfig, $text, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "  已写入：$targetConfig" -ForegroundColor Green
  Write-Host "  instructions = $instructions" -ForegroundColor Green
}

# 2) 技能与指令：技能走「配置目录下 skills\」的自动发现约定
Copy-Tree (Join-Path $root '.opencode\skills') (Join-Path $target 'skills')
Copy-Tree (Join-Path $root 'prompts') (Join-Path $target 'prompts')

# 3) 主题：只能放到用户级全局配置目录
Copy-Tree (Join-Path $root '.opencode\themes') $themeTarget

Write-Host "`n完成。" -ForegroundColor White
Write-Host @"

部署后的目录应为：
  $target\aero-code.jsonc
  $target\skills\<技能名>\SKILL.md
  $target\prompts\AGENTS.md
  $themeTarget\acme.json

后续步骤：
  1. 下发模型网关地址与密钥（二选一）：
     a) 启动前设置环境变量 AERO_AI_BASE_URL / AERO_AI_API_KEY
     b) 把密钥写入受保护文件，并把配置里的 apiKey 改为 {file:...}
  2. 启动桌面端，确认：
     - 模型列表只有 Aero AI
     - 设置里的主题可选到 acme
     - /review 命令可用
  3. 校验：node .\scripts\verify-config.mjs
"@ -ForegroundColor DarkGray
