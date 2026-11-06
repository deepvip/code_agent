# Build the Aero Code first-run setup tool (WinForms, .NET Framework 4.x).
# ASCII only: Windows PowerShell 5.1 without a BOM.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

node scripts/make-wizard-payload.mjs
if ($LASTEXITCODE -ne 0) { throw "payload generation failed" }

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "csc.exe not found: $csc" }

$out = Join-Path $root 'wizard\AeroCodeSetup.exe'
if (Test-Path $out) { Remove-Item $out -Force }

$payload = Join-Path $root 'wizard\payload'
$resources = @(
  "/resource:`"$payload\config.template.json`",config.template.json",
  "/resource:`"$payload\AGENTS.md`",AGENTS.md",
  "/resource:`"$payload\skills\code-review\SKILL.md`",skill.code-review.md",
  "/resource:`"$payload\skills\java-standards\SKILL.md`",skill.java-standards.md",
  "/resource:`"$payload\skills\legacy-migration\SKILL.md`",skill.legacy-migration.md",
  "/resource:`"$payload\themes\aero-code.json`",theme.aero-code.json"
)

$arguments = @(
  '/nologo',
  '/target:winexe',
  '/codepage:65001',
  '/optimize+',
  '/platform:anycpu',
  "/win32icon:`"$root\brand\icons\icon.ico`"",
  "/out:`"$out`"",
  '/r:System.dll',
  '/r:System.Drawing.dll',
  '/r:System.Windows.Forms.dll'
) + $resources + @("`"$root\wizard\Program.cs`"")

& $csc $arguments
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }

$file = Get-Item $out
Write-Output ("built {0} ({1:N0} bytes)" -f $file.FullName, $file.Length)
