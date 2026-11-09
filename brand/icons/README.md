# 品牌图标目录

把公司的安装包图标放到这里，`scripts/apply-brand.mjs` 会覆盖到
`vendor/opencode/packages/desktop/resources/icons/prod/`。

## 必需文件

| 文件 | 用途 | 规格 |
|---|---|---|
| `icon.ico` | Windows 安装器 / 应用图标 | 256×256 多尺寸（16/32/48/64/128/256） |
| `icon.icns` | macOS 应用图标 | 1024×1024 源图导出 |
| `icon.png` | Linux / 通用 | 1024×1024 透明背景 |

## 可选（Windows 商店 / MSIX）

`Square44x44Logo.png`、`Square150x150Logo.png`、`StoreLogo.png` 等，
命名与上游保持一致即可。

## 注意

- 不要使用上游 OpenCode 的图标或其衍生图形，避免商标混淆。
- 深色底 + 单色图标在小尺寸下辨识度最好。
