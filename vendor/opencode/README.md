# OpenCode (vendored)

This directory contains the vendored OpenCode source used by Aero Code.
It is a normal directory, not a Git submodule.

## Requirements

- Bun 1.4.4
- Node.js 22+
- Windows 10/11, macOS, or Linux

## Install

Run from this directory:

```bash
bun install
```

The first install is large (about 8 GB). Platform-specific dependency warnings are normal.

## Develop

```bash
bun run dev          # CLI / TUI
bun run dev:desktop  # desktop app
bun run dev:web      # web UI
```

Run `dev:desktop` from this directory, not from the repository root.

## Check

```bash
bun run typecheck
bun run lint
```

Package tests live under the individual `packages/*/test` directories.

## Build

```bash
bun run --cwd packages/cli build
bun run --cwd packages/desktop build
```

## Notes

- Configuration files use the `aero-code.json` / `aero-code.jsonc` names.
- Project configuration directories are `.aerocode` (preferred) and `.opencode` (compatibility).
- This is upstream code. Keep local changes small so future upstream updates remain easy.

## License

MIT. See `LICENSE`.
