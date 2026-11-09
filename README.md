# Aero Code 环境搭建与运行

适用于 Windows 10/11 x64 + PowerShell。示例路径为 `E:\AI\code_agent`。

## 1. 环境要求

| 组件 | 要求 |
| --- | --- |
| Git | 2.40+ |
| Node.js | >= 22 |
| Bun | 1.4.4 |
| PowerShell | 推荐 PowerShell 7 |

正常开发桌面端不需要 Docker、数据库、Python、Rust 或 Visual Studio C++ 工具链。

检查版本：

```powershell
git --version
node --version
bun --version
pwsh --version
```

如果 Bun 不在 PATH 中，检查 `%USERPROFILE%\.bun\bin`。

如果需要代理，先在当前 PowerShell 窗口设置：

```powershell
$env:HTTP_PROXY  = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:NO_PROXY    = "127.0.0.1,localhost,::1"
```

## 2. 克隆仓库

```powershell
cd E:\AI
git clone https://github.com/deepvip/code_agent.git
cd code_agent
```

`vendor` 是普通目录，不是 submodule，不需要执行 `git submodule update`。

## 3. 安装依赖（两处）

### 3.1 根目录

```powershell
cd E:\AI\code_agent
bun install
```

### 3.2 vendor

```powershell
cd E:\AI\code_agent\vendor\opencode
bun install
```

这一步首次安装约 8 GB，耗时较长。出现其他平台依赖被跳过、`patches` 不再适用或 `husky` 找不到 `.git` 的提示，通常可以忽略；只要没有 `error` 即可。

## 4. 配置模型网关（可选）

设置环境变量：

```powershell
$env:AERO_AI_BASE_URL = "https://ai-gateway.aero-code.internal/v1"
$env:AERO_AI_API_KEY  = "<你的网关密钥>"
```

`AERO_AI_BASE_URL` 需要包含 `/v1`。

部署用户级配置：

```powershell
cd E:\AI\code_agent

pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-managed-config.ps1 -Scope User -DryRun
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-managed-config.ps1 -Scope User
```

第一条是预览，第二条才写入 `%USERPROFILE%\.config\aero-code`。

> 如果 clone 后 `.aerocode` 不存在，先从 `wizard/payload` 恢复技能和主题：
>
> ```powershell
> New-Item -ItemType Directory -Force -Path .aerocode\skills, .aerocode\themes | Out-Null
> Copy-Item -Path wizard\payload\skills\* -Destination .aerocode\skills -Recurse -Force
> Copy-Item -Path wizard\payload\themes\* -Destination .aerocode\themes -Recurse -Force
> ```

## 5. 运行桌面端

```powershell
cd E:\AI\code_agent\vendor\opencode
bun run dev:desktop
```

首次启动会下载/准备 Electron，并构建本地 CLI 和 Web UI，可能需要几分钟。成功后会出现 `Aero Code Dev` 窗口。

`dev:desktop` 必须在 `vendor/opencode` 下执行，不能在仓库根目录执行。

## 6. 可选自检

```powershell
cd E:\AI\code_agent
node scripts/build-cli.mjs
bun run verify
```

期望输出 `30/30 通过`。

## 7. 常见问题

- `bun` 不是内部或外部命令：重开 PowerShell，确认 `%USERPROFILE%\.bun\bin` 在 PATH 中。
- 配置部署报 PowerShell 语法错误：不要用 `bun run deploy:user`，改用上面的 `pwsh -File` 命令。
- Electron 下载慢或失败：检查代理，或清理 `%LOCALAPPDATA%\electron\Cache` 后重试。
- 桌面端打开但模型不可用：检查 `AERO_AI_BASE_URL`、`AERO_AI_API_KEY`、内网/VPN 和网关地址。
- 不要依赖根目录的 `bun run cli`，开发时使用构建后的 Aero Code CLI。
