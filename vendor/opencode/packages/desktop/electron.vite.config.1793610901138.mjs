// electron.vite.config.ts
import { defineConfig } from "electron-vite";

// scripts/picker.ts
import picker from "@brendonovich/vite-plugin-opencode";
import MagicString from "magic-string";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseSync, Visitor } from "vite";
var attribute = "data-opencode-picker-source";
function pickerPlugin() {
  const plugin = picker();
  const client = "/__vite_opencode_picker_client.js";
  let workspaceRoot = "";
  return {
    ...plugin,
    configResolved(config) {
      plugin.configResolved(config);
      workspaceRoot = gitRoot(config.root);
    },
    resolveId(id) {
      return plugin.resolveId(id === client ? "virtual:vite-opencode-picker/client" : id);
    },
    configureServer(server) {
      server.middlewares.use(client, (_request, response) => {
        response.setHeader("content-type", "text/javascript");
        response.end(plugin.load(plugin.resolveId("virtual:vite-opencode-picker/client")));
      });
      plugin.configureServer(server);
    },
    transformIndexHtml: {
      order: "pre",
      handler() {
        return [{ tag: "script", attrs: { type: "module", src: client }, injectTo: "body" }];
      }
    },
    // The package tags elements through a Babel parse and print of every component, a second Babel
    // pass on top of Solid's. Inserting the attribute where Oxc finds each element gives the same tags
    // at about a quarter of the cost, which the first renderer bundle waits on.
    transform(code, id) {
      const file = id.split("?", 1)[0];
      if (!/\.[jt]sx$/.test(file) || file.includes("/node_modules/")) return;
      const source = relative(workspaceRoot, file).replaceAll(sep, "/");
      if (source.startsWith("../")) return;
      const parsed = parseSync(file, code);
      if (parsed.errors.length) return;
      const lines = [0, ...Array.from(code.matchAll(/\n/g), (match) => match.index + 1)];
      const output = new MagicString(code);
      new Visitor({
        JSXOpeningElement(node) {
          if (node.name.type !== "JSXIdentifier" || !/^[a-z]/.test(node.name.name)) return;
          if (node.attributes.some((item) => item.type === "JSXAttribute" && item.name.name === attribute)) return;
          const line = lines.findLastIndex((start) => start <= node.start) + 1;
          output.appendLeft(node.selfClosing ? node.end - 2 : node.end - 1, ` ${attribute}="${source}:${line}"`);
        }
      }).visit(parsed.program);
      if (!output.hasChanged()) return;
      return { code: output.toString(), map: output.generateMap({ hires: "boundary", source: file }) };
    }
  };
}
function gitRoot(root) {
  for (let dir = resolve(root); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return resolve(root);
  }
}

// scripts/utils.ts
import { chmod, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname as dirname2, join as join2 } from "node:path";
import { Option, Schema } from "effect";
var Manifest = Schema.fromJsonString(Schema.Struct({ version: Schema.NonEmptyString }));
var CLI_BINARIES = [
  {
    target: "aarch64-apple-darwin",
    package: "@opencode/cli-darwin-arm64",
    os: "darwin",
    cpu: "arm64"
  },
  {
    target: "x86_64-apple-darwin",
    package: "@opencode/cli-darwin-x64-baseline",
    os: "darwin",
    cpu: "x64"
  },
  {
    target: "aarch64-pc-windows-msvc",
    package: "@opencode/cli-windows-arm64",
    os: "win32",
    cpu: "arm64"
  },
  {
    target: "x86_64-pc-windows-msvc",
    package: "@opencode/cli-windows-x64-baseline",
    os: "win32",
    cpu: "x64"
  },
  {
    target: "x86_64-unknown-linux-gnu",
    package: "@opencode/cli-linux-x64-baseline",
    os: "linux",
    cpu: "x64"
  },
  {
    target: "aarch64-unknown-linux-gnu",
    package: "@opencode/cli-linux-arm64",
    os: "linux",
    cpu: "arm64"
  }
];
var CLI_TARGET = process.env.OPENCODE_CLI_TARGET;
function nativeTarget() {
  const { platform, arch } = process;
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}
function getCurrentCli(target = process.env.OPENCODE_CLI_TARGET ?? nativeTarget()) {
  const binaryConfig = CLI_BINARIES.find((item) => item.target === target);
  if (!binaryConfig) throw new Error(`CLI configuration not available for target '${target}'`);
  return binaryConfig;
}
function nodePtyPackage(target) {
  const cli = getCurrentCli(target);
  return `@lydell/node-pty-${cli.os}-${cli.cpu}`;
}

// electron.vite.config.ts
function resolveChannel() {
  const raw = process.env.OPENCODE_CHANNEL;
  if (raw === "local" || raw === "dev" || raw === "beta" || raw === "prod") return raw;
  if (raw === "latest") return "prod";
  return "dev";
}
var appPlugin = (await import("@opencode/app/vite")).default;
var sentry = process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT ? (await import("@sentry/vite-plugin")).sentryVitePlugin({
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  telemetry: false,
  release: {
    name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE
  },
  sourcemaps: {
    assets: "./out/renderer/**",
    filesToDeleteAfterUpload: "./out/renderer/**/*.map"
  }
}) : false;
var initialGraph = /* @__PURE__ */ new Set();
var initialChunk = {
  name: "opencode-desktop:initial-chunk",
  renderStart() {
    const entries = [...this.getModuleIds()].filter((id) => this.getModuleInfo(id)?.isEntry);
    initialGraph.clear();
    entries.forEach((id) => initialGraph.add(id));
    for (const id of initialGraph) this.getModuleInfo(id)?.importedIds.forEach((imported) => initialGraph.add(imported));
  }
};
var electron_vite_config_default = defineConfig(({ command }) => {
  const channel = resolveChannel();
  const nodePtyPkg = nodePtyPackage();
  return {
    main: {
      resolve: {
        dedupe: ["effect"]
      },
      define: {
        // Local renderer/server mode still uses the dev application identity and updater policy.
        "import.meta.env.OPENCODE_CHANNEL": JSON.stringify(channel === "local" ? "dev" : channel)
      },
      build: {
        minify: command === "build",
        rolldownOptions: {
          input: { index: "src/main/index.ts" },
          // Keep this identical to electron-vite's Node 20.11+ shim. Its regex insertion can
          // corrupt bundled TypeScript, while an output banner places the shim safely.
          output: {
            format: "es",
            // DesktopPaths resolves resources from the main output directory,
            // including when the lazy desktop entry shares it with other chunks.
            chunkFileNames: "[name]-[hash].js",
            banner: `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`
          }
        },
        externalizeDeps: {
          // Bundle the Effect family together.
          exclude: ["effect", "@effect/platform-node", "@effect/platform-node-shared", "drizzle-orm"],
          include: [nodePtyPkg]
        }
      },
      plugins: [
        {
          name: "opencode:node-pty-narrower",
          enforce: "pre",
          resolveId(s) {
            if (s === "@lydell/node-pty") return nodePtyPkg;
            return void 0;
          }
        }
      ]
    },
    preload: {
      build: {
        minify: command === "build",
        rolldownOptions: {
          input: { index: "src/preload/index.ts" },
          output: {
            format: "cjs",
            // The package is "type": "module". Under --no-sandbox Electron loads the preload
            // through Node's module loader, which treats a .js file as ESM and fails on
            // require("electron"). The sandboxed path ignores the extension.
            entryFileNames: "[name].cjs"
          }
        }
      }
    },
    renderer: {
      experimental: {
        bundledDev: true
      },
      define: {
        "import.meta.env.OPENCODE_VERSION": JSON.stringify(process.env.OPENCODE_VERSION),
        "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify(channel),
        "import.meta.env.OPENCODE_TEST_ONBOARDING": JSON.stringify(
          command === "serve" && process.env.OPENCODE_TEST_ONBOARDING === "1"
        )
      },
      plugins: [pickerPlugin(), appPlugin, initialChunk, sentry],
      publicDir: "../../../app/public",
      root: "src/renderer",
      build: {
        minify: command === "build",
        sourcemap: true,
        rolldownOptions: {
          input: {
            main: "src/renderer/index.html"
          },
          output: {
            codeSplitting: {
              groups: [{ name: (id) => initialGraph.has(id) ? "app" : null, priority: 10 }]
            }
          }
        }
      }
    }
  };
});
export {
  electron_vite_config_default as default
};
