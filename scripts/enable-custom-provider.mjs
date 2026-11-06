#!/usr/bin/env node
// 自定义中转站 / API 模式 / 供应商模型列表能力：
//   node scripts/enable-custom-provider.mjs
// 仅检查、不落盘：
//   node scripts/enable-custom-provider.mjs --check
// 跳过客户端代码生成：
//   node scripts/enable-custom-provider.mjs --no-generate
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const vendor = path.join(root, "vendor", "opencode");
const checkOnly = process.argv.includes("--check");
const skipGenerate = process.argv.includes("--no-generate");

// 保留源码块自身的缩进；只去掉模板字符串首尾用于排版的空行。
const block = (value) => value.replace(/^\n/, "").replace(/\n[ \t]*$/, "");

const previousOnMountBlock = [
  "  onMount(() => {",
  "    if (!props.editProviderID) return",
  "    void serverSDK.api.config",
  "      .get({})",
  "      .then((entries) => {",
  '        const config = entries.find((entry) => entry.type === "document")',
  '        if (!config || config.type !== "document")',
  "          throw new Error(`Provider configuration not found: ${props.editProviderID}`)",
  "        const provider = config.info.providers?.[props.editProviderID!]",
  "        if (!provider) throw new Error(`Provider configuration not found: ${props.editProviderID}`)",
  "        const info = provider as unknown as {",
  "          name?: string",
  "          package?: string",
  "          settings?: { baseURL?: string; apiKey?: string }",
  "          headers?: Record<string, string>",
  "          models?: Record<string, { name?: string }>",
  "        }",
  "        existingProviderConfig = provider as unknown as Record<string, unknown>",
  '        const apiMode = API_MODES.find((mode) => !!mode.package && mode.package === info.package)?.id ?? "openai"',
  "        setForm({",
  "          providerID: props.editProviderID,",
  "          name: info.name ?? props.editProviderID,",
  '          baseURL: String(info.settings?.baseURL ?? ""),',
  '          apiKey: "",',
  "          apiMode,",
  '          modelsMode: "picked",',
  "          models: Object.entries(info.models ?? {}).map(([id, model]) => ({",
  "            row: `model-${id}`,",
  "            id,",
  "            name: model.name ?? id,",
  "            err: {},",
  "          })),",
  "          headers: Object.entries(info.headers ?? {}).map(([key, value]) => ({",
  "            row: `header-${key}`,",
  "            key,",
  "            value,",
  "            err: {},",
  "          })),",
  "        })",
  "      })",
  '      .catch((err) => showToast({ title: language.t("common.requestFailed"), description: String(err) }))',
  "  })",
].join("\n");

const onMountBlock = [
  "  onMount(() => {",
  "    if (!props.editProviderID) return",
  "    void serverSDK.api.config",
  "      .get({})",
  "      .then((entries) => {",
  "        const config = entries.findLast(",
  '          (entry) => entry.type === "document" && entry.info.providers?.[props.editProviderID!] !== undefined,',
  "        )",
  '        if (!config || config.type !== "document")',
  "          throw new Error(`Provider configuration not found: ${props.editProviderID}`)",
  "        const provider = config.info.providers?.[props.editProviderID!]",
  "        if (!provider) throw new Error(`Provider configuration not found: ${props.editProviderID}`)",
  "        const info = provider as unknown as {",
  "          name?: string",
  "          package?: string",
  "          npm?: string",
  "          settings?: { baseURL?: string; apiKey?: string; headers?: Record<string, string> }",
  "          options?: { baseURL?: string; apiKey?: string; headers?: Record<string, string> }",
  "          headers?: Record<string, string>",
  "          models?: Record<string, { name?: string }>",
  "        }",
  "        existingProviderConfig = provider as unknown as Record<string, unknown>",
  "        const packageName = info.package ?? info.npm",
  '        const apiMode = API_MODES.find((mode) => !!mode.package && mode.package === packageName)?.id ?? "openai"',
  "        const settings = info.settings ?? info.options",
  "        setForm({",
  "          providerID: props.editProviderID,",
  "          name: info.name ?? props.editProviderID,",
  '          baseURL: String(settings?.baseURL ?? ""),',
  '          apiKey: "",',
  "          apiMode,",
  '          modelsMode: "picked",',
  "          models: Object.entries(info.models ?? {}).map(([id, model]) => ({",
  "            row: `model-${id}`,",
  "            id,",
  "            name: model.name ?? id,",
  "            err: {},",
  "          })),",
  "          headers: Object.entries(info.headers ?? settings?.headers ?? {}).map(([key, value]) => ({",
  "            row: `header-${key}`,",
  "            key,",
  "            value,",
  "            err: {},",
  "          })),",
  "        })",
  "      })",
  '      .catch((err) => showToast({ title: language.t("common.requestFailed"), description: String(err) }))',
  "  })",
].join("\n");

const legacyOnMountBlock = [
  "  onMount(() => {",
  "    if (!props.editProviderID) return",
  "    void sdk.api.config",
  "      .get({})",
  "      .then((entries) => {",
  '        const config = entries.find((entry) => entry.type === "document")',
  "        const provider = config?.info.providers?.[props.editProviderID!]",
  "        if (!provider) throw new Error(`Provider configuration not found: ${props.editProviderID}`)",
  "        const info = provider as unknown as {",
  "          name?: string",
  "          options?: { baseURL?: string; headers?: Record<string, string> }",
  "          models?: Record<string, { name?: string }>",
  "        }",
  "        existingProviderConfig = provider as unknown as Record<string, unknown>",
  "        setForm({",
  "          providerID: props.editProviderID,",
  "          name: info.name ?? props.editProviderID,",
  '          baseURL: String(info.options?.baseURL ?? ""),',
  '          apiKey: "",',
  "          models: Object.entries(info.models ?? {}).map(([id, model]) => ({",
  "            row: `model-${id}`,",
  "            id,",
  "            name: model.name ?? id,",
  "            err: {},",
  "          })),",
  "          headers: Object.entries(info.options?.headers ?? {}).map(([key, value]) => ({",
  "            row: `header-${key}`,",
  "            key,",
  "            value,",
  "            err: {},",
  "          })),",
  "        })",
  "      })",
  '      .catch((err) => showToast({ title: language.t("common.requestFailed"), description: String(err) }))',
  "  })",
].join("\n");

const tasks = [
  {
    file: path.join(vendor, "packages", "app", "src", "providers", "credentials", "form.ts"),
    edits: [
      {
        label: "自定义中转站/Provider 增加 API 模式与模型选择状态",
        before: 'const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"',
        after: block(`
export const API_MODES = [
  {
    id: "openai",
    package: "@ai-sdk/openai-compatible",
    labelKey: "provider.custom.apiMode.openai.label",
    descriptionKey: "provider.custom.apiMode.openai.description",
  },
  {
    id: "responses",
    package: "@opencode/ai/providers/openai-compatible/responses",
    labelKey: "provider.custom.apiMode.responses.label",
    descriptionKey: "provider.custom.apiMode.responses.description",
  },
  {
    id: "anthropic",
    package: "@opencode/ai/providers/anthropic-compatible",
    labelKey: "provider.custom.apiMode.anthropic.label",
    descriptionKey: "provider.custom.apiMode.anthropic.description",
  },
  {
    id: "gemini",
    package: "@opencode/ai/providers/google",
    labelKey: "provider.custom.apiMode.gemini.label",
    descriptionKey: "provider.custom.apiMode.gemini.description",
  },
  {
    id: "system-one",
    package: undefined,
    labelKey: "provider.custom.apiMode.systemOne.label",
    descriptionKey: "provider.custom.apiMode.systemOne.description",
  },
] as const

export type ApiMode = (typeof API_MODES)[number]["id"]
export type ModelsMode = "vendor" | "picked" | "usage"
`),
      },
      {
        label: "自定义 Provider 表单保存 API 模式与模型选择模式",
        before: block(`
  baseURL: string
  apiKey: string
  models: ModelRow[]
`),
        after: block(`
  baseURL: string
  apiKey: string
  apiMode: ApiMode
  modelsMode: ModelsMode
  models: ModelRow[]
`),
      },
      {
        label: "自定义 Provider 表单校验 API 模式错误",
        before: block(`
    baseURL?: string
  }
}
`),
        after: block(`
    baseURL?: string
    apiMode?: string
  }
}
`),
      },
      {
        label: "自定义 Provider 复用请求头归一化逻辑",
        before: "export function validateCustomProvider(input: ValidateArgs) {",
        after: block(`
export function headerValues(rows: HeaderRow[]) {
  return Object.fromEntries(
    rows
      .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
      .filter((header) => !!header.key && !!header.value)
      .map((header) => [header.key, header.value]),
  )
}

export function validateCustomProvider(input: ValidateArgs) {
`),
      },
      {
        label: "自定义 Provider 按 API 模式选择协议包",
        before: block(`
  const apiKey = input.form.apiKey.trim()

  const env = apiKey.match(/^\\{env:([^}]+)\\}$/)?.[1]?.trim()
  const key = apiKey && !env ? apiKey : undefined
`),
        after: block(`
  const apiKey = input.form.apiKey.trim()
  const apiMode = API_MODES.find((mode) => mode.id === input.form.apiMode)
  const packageName = apiMode?.package
  const usageOnly = input.form.modelsMode === "usage"

  const env = apiKey.match(/^\\{env:([^}]+)\\}$/)?.[1]?.trim()
  const key = apiKey && !env ? apiKey : undefined
  const apiModeError = packageName ? undefined : input.t("provider.custom.error.apiMode.unsupported")
`),
      },
      {
        label: "自定义 Provider 支持仅记录用量模式",
        before: block(`
  const models = input.form.models.map((m) => {
    const id = m.id.trim()

    const idError = !id
      ? input.t("provider.custom.error.required")
      : seenModels.has(id)
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenModels.add(id)

            return undefined
          })()

    const nameError = !m.name.trim() ? input.t("provider.custom.error.required") : undefined

    return { id: idError, name: nameError }
  })

  const modelsValid = models.every((m) => !m.id && !m.name)
  const modelConfig = Object.fromEntries(input.form.models.map((m) => [m.id.trim(), { name: m.name.trim() }]))
`),
        after: block(`
  const models = usageOnly
    ? []
    : input.form.models.map((m) => {
        const id = m.id.trim()

        const idError = !id
          ? input.t("provider.custom.error.required")
          : seenModels.has(id)
            ? input.t("provider.custom.error.duplicate")
            : (() => {
                seenModels.add(id)

                return undefined
              })()

        const nameError = !m.name.trim() ? input.t("provider.custom.error.required") : undefined

        return { id: idError, name: nameError }
      })

  const modelsValid = usageOnly || models.every((m) => !m.id && !m.name)
  const modelConfig = usageOnly
    ? {}
    : Object.fromEntries(input.form.models.map((m) => [m.id.trim(), { name: m.name.trim() }]))
`),
      },
      {
        label: "自定义 Provider 复用请求头配置",
        before: block(`
  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((h) => ({ key: h.key.trim(), value: h.value.trim() }))
      .filter((h) => !!h.key && !!h.value)
      .map((h) => [h.key, h.value]),
  )
`),
        after: block(`
  const headerConfig = headerValues(input.form.headers)
`),
      },
      {
        label: "自定义 Provider 校验 API 模式是否受支持",
        before: block(`
  const err = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
  }

  const ok = !idError && !existsError && !nameError && !urlError && modelsValid && headersValid

  if (!ok) return { err, models, headers }
`),
        after: block(`
  const err = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
    apiMode: apiModeError,
  }

  const ok =
    !idError && !existsError && !nameError && !urlError && !apiModeError && modelsValid && headersValid

  if (!ok || !packageName) return { err, models, headers }
`),
      },
      {
        label: "自定义 Provider 写入协议包、设置和密钥",
        before: block(`
      key,
      config: {
        npm: OPENAI_COMPATIBLE,
        name,
        ...(env ? { env: [env] } : {}),
        options: {
          baseURL,
          ...(Object.keys(headerConfig).length ? { headers: headerConfig } : {}),
        },
        models: modelConfig,
      },
`),
        after: block(`
      config: {
        package: packageName,
        name,
        ...(env ? { env: [env] } : {}),
        settings: {
          baseURL,
          ...(key ? { apiKey: key } : {}),
        },
        ...(Object.keys(headerConfig).length ? { headers: headerConfig } : {}),
        models: modelConfig,
      },
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "app", "src", "providers", "credentials", "form.test.ts"),
    edits: [
      {
        label: "自定义 Provider 表单测试覆盖 API 模式",
        before: block(`
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        models:
`),
        after: block(`
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        apiMode: "openai",
        modelsMode: "picked",
        models:
`),
      },
      {
        label: "自定义 Provider 表单测试匹配新的配置结构",
        before: block(`
      key: undefined,
      config: {
        npm: "@ai-sdk/openai-compatible",
        name: "Custom Provider",
        env: ["CUSTOM_PROVIDER_KEY"],
        options: {
          baseURL: "https://api.example.com",
          headers: {
            "X-Test": "enabled",
          },
        },
        models: {
          "model-a": { name: "Model A" },
        },
      },
`),
        after: block(`
      config: {
        package: "@ai-sdk/openai-compatible",
        name: "Custom Provider",
        env: ["CUSTOM_PROVIDER_KEY"],
        settings: {
          baseURL: "https://api.example.com",
        },
        headers: {
          "X-Test": "enabled",
        },
        models: {
          "model-a": { name: "Model A" },
        },
      },
`),
      },
      {
        label: "自定义 Provider 重复行测试覆盖 API 模式",
        before: block(`
        apiKey: "secret",
        models: [
`),
        after: block(`
        apiKey: "secret",
        apiMode: "openai",
        modelsMode: "picked",
        models: [
`),
      },
      {
        label: "自定义 Provider 表单测试覆盖协议映射和仅用量模式",
        before: block(`
    expect(result.headers[1]).toEqual({
      key: "provider.custom.error.duplicate",
      value: undefined,
    })
  })
})
`),
        after: block(`
    expect(result.headers[1]).toEqual({
      key: "provider.custom.error.duplicate",
      value: undefined,
    })
  })

  test("maps each API mode to its provider package", () => {
    const cases = [
      ["openai", "@ai-sdk/openai-compatible"],
      ["responses", "@opencode/ai/providers/openai-compatible/responses"],
      ["anthropic", "@opencode/ai/providers/anthropic-compatible"],
      ["gemini", "@opencode/ai/providers/google"],
    ] as const

    for (const [apiMode, packageName] of cases) {
      const result = validateCustomProvider({
        form: {
          providerID: "custom-provider",
          name: "Provider",
          baseURL: "https://api.example.com",
          apiKey: "secret",
          apiMode,
          modelsMode: "picked",
          models: [{ row: "m0", id: "model-a", name: "Model A", err: {} }],
          headers: [],
          err: {},
        },
        t,
        disabledProviders: [],
        existingProviderIDs: new Set(),
      })

      expect(result.result?.config.package).toBe(packageName)
    }
  })

  test("saves no models in usage-only mode", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        apiMode: "openai",
        modelsMode: "usage",
        models: [{ row: "m0", id: "", name: "", err: {} }],
        headers: [],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result?.config.models).toEqual({})
  })
})
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "app", "src", "providers", "credentials", "dialog.tsx"),
    edits: [
      {
        label: "自定义中转站/Provider 表单引入模型列表状态",
        before: [
          'import { batch, For } from "solid-js"',
          'import { batch, For, onMount } from "solid-js"',
          'import { batch, createMemo, For, Show } from "solid-js"',
        ],
        after: 'import { batch, createMemo, For, onMount, Show } from "solid-js"',
      },
      {
        label: "自定义中转站/Provider 表单接入服务端 SDK",
        before: 'import { useData } from "@/runtime/server/current"',
        after: [
          'import { useServerSDK } from "@/runtime/server/client"',
          'import { useData, useServer } from "@/runtime/server/current"',
        ].join("\n"),
        skipIf: 'import { useServerSDK } from "@/runtime/server/client"',
      },
      {
        label: "自定义中转站/Provider 表单引入 API 模式定义",
        before: 'import { type FormState, headerRow, modelRow, validateCustomProvider } from "./form"',
        after: block(`
import {
  API_MODES,
  type ApiMode,
  type FormState,
  type ModelsMode,
  headerRow,
  headerValues,
  modelRow,
  validateCustomProvider,
} from "./form"
`),
      },
      {
        label: "自定义中转站/Provider 表单定义模型列表类型",
        before: [
          "export function CustomProviderForm(props: { autofocus?: boolean } = {}) {",
          "export function CustomProviderForm(props: { autofocus?: boolean; editProviderID?: string } = {}) {",
        ],
        after: block(`
type FetchedModel = {
  id: string
  name: string
}

const MODELS_MODES = [
  { id: "vendor", labelKey: "provider.custom.models.vendor" },
  { id: "picked", labelKey: "provider.custom.models.picked" },
  { id: "usage", labelKey: "provider.custom.models.usage" },
] as const

export function CustomProviderForm(props: { autofocus?: boolean; editProviderID?: string } = {}) {
`),
        skipIf: "type FetchedModel = {",
      },
      {
        label: "自定义 Provider 表单支持隐藏内部标题",
        before:
          "export function CustomProviderForm(props: { autofocus?: boolean; editProviderID?: string } = {}) {",
        after:
          "export function CustomProviderForm(props: { autofocus?: boolean; editProviderID?: string; hideTitle?: boolean } = {}) {",
      },
      {
        label: "自定义 Provider 表单在编辑弹窗中隐藏重复标题",
        before: block(`
      <div class="px-2.5 flex gap-4 items-center">
        <CustomManagedProviderIcon class="size-5 shrink-0" />
        <div class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</div>
      </div>
`),
        after: block(`
      <Show when={!props.hideTitle}>
        <div class="px-2.5 flex gap-4 items-center">
          <CustomManagedProviderIcon class="size-5 shrink-0" />
          <div class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</div>
        </div>
      </Show>
`),
      },
      {
        label: "自定义中转站/Provider 表单初始化服务端上下文",
        before: [
          block(`
  const data = useData()
  const language = useLanguage()
`),
          block(`
  const data = useData()
  const server = useServer()
  const serverSDK = useServerSDK()
  const language = useLanguage()
`),
          block(`
  const data = useData()
  const server = useServer()
  const sdk = useServerSDK()
  const language = useLanguage()
`),
        ],
        after: block(`
  const data = useData()
  const server = useServer()
  const serverSDK = useServerSDK()
  const language = useLanguage()
`),
      },
      {
        label: "自定义中转站/Provider 表单初始化 API 模式和模型选择模式",
        before: block(`
    apiKey: "",
    models: [modelRow()],
`),
        after: block(`
    apiKey: "",
    apiMode: "openai",
    modelsMode: "vendor",
    models: [modelRow()],
`),
      },
      {
        label: "自定义中转站/Provider 表单增加模型列表状态和筛选",
        before: "  const addModel = () => {",
        skipIf: "const [fetched, setFetched] = createStore<{",
        after: block(`
  const [fetched, setFetched] = createStore<{
    models: FetchedModel[]
    loading: boolean
    filter: string
    error?: string
  }>({
    models: [],
    loading: false,
    filter: "",
  })

  const selectedIDs = createMemo(() => new Set(form.models.map((model) => model.id.trim()).filter(Boolean)))
  const fetchedIDs = createMemo(() => new Set(fetched.models.map((model) => model.id)))
  const filteredFetched = createMemo(() => {
    const query = fetched.filter.trim().toLowerCase()
    if (!query) return fetched.models
    return fetched.models.filter(
      (model) => model.id.toLowerCase().includes(query) || model.name.toLowerCase().includes(query),
    )
  })
  const visibleFetched = createMemo(() => {
    if (form.modelsMode === "usage") return []
    if (form.modelsMode === "picked") return filteredFetched().filter((model) => selectedIDs().has(model.id))
    return filteredFetched()
  })
  const manualRows = createMemo(() =>
    form.models
      .map((model, index) => ({ model, index }))
      .filter(({ model }) => !model.id.trim() || !fetchedIDs().has(model.id.trim())),
  )

  const addModel = () => {
`),
      },
      {
        label: "自定义中转站/Provider 表单在地址或密钥变化时清空模型列表",
        before: block(`
  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    setForm(key, value)

    if (key === "apiKey") return
    setForm("err", key, undefined)
  }
`),
        after: block(`
  const clearFetched = () => {
    batch(() => {
      setFetched("models", [])
      setFetched("filter", "")
      setFetched("error", undefined)
    })
  }

  const setField = (key: "providerID" | "name" | "baseURL" | "apiKey", value: string) => {
    batch(() => {
      setForm(key, value)
      if (key !== "apiKey") setForm("err", key, undefined)
      if (key === "baseURL" || key === "apiKey") clearFetched()
    })
  }
`),
      },
      {
        label: "自定义中转站/Provider 表单检测并获取供应商模型列表",
        before: "  const validate = () => {",
        after: block(`
  const addFetchedModels = (models: readonly FetchedModel[]) => {
    setForm(
      "models",
      produce((rows) => {
        rows.splice(0, rows.length, ...rows.filter((row) => row.id.trim() || row.name.trim()))
        const ids = new Set(rows.map((row) => row.id.trim()))
        models.forEach((model) => {
          if (ids.has(model.id)) return
          rows.push({ ...modelRow(), id: model.id, name: model.name || model.id })
          ids.add(model.id)
        })
        if (!rows.length) rows.push(modelRow())
      }),
    )
  }

  const removeFetchedModels = (models: readonly FetchedModel[]) => {
    setForm(
      "models",
      produce((rows) => {
        const ids = new Set(models.map((model) => model.id))
        rows.splice(0, rows.length, ...rows.filter((row) => !ids.has(row.id.trim())))
        if (!rows.length) rows.push(modelRow())
      }),
    )
  }

  const selectAllFetched = () => {
    const models = filteredFetched()
    if (!models.length) return
    batch(() => {
      if (form.modelsMode === "usage") setForm("modelsMode", "picked")
      addFetchedModels(models)
    })
  }

  const selectNoneFetched = () => {
    const models = filteredFetched()
    if (!models.length) return
    removeFetchedModels(models)
  }

  const setApiMode = (mode: ApiMode) => {
    batch(() => {
      setForm("apiMode", mode)
      setForm(
        "err",
        "apiMode",
        mode === "system-one" ? language.t("provider.custom.error.apiMode.unsupported") : undefined,
      )
      clearFetched()
    })
  }

  const setModelsMode = (mode: ModelsMode) => {
    setForm("modelsMode", mode)
    if (mode === "vendor" && fetched.models.length) addFetchedModels(fetched.models)
  }

  const toggleFetched = (model: FetchedModel) => {
    const selected = selectedIDs().has(model.id)
    batch(() => {
      if (form.modelsMode === "usage") setForm("modelsMode", "picked")
      if (selected) {
        removeFetchedModels([model])
        return
      }
      addFetchedModels([model])
    })
  }

  const fetchModels = async () => {
    if (fetched.loading || form.apiMode === "system-one") return

    const baseURL = form.baseURL.trim()
    if (!baseURL) {
      setForm("err", "baseURL", language.t("provider.custom.error.baseURL.required"))
      return
    }
    if (!/^https?:\\/\\//.test(baseURL)) {
      setForm("err", "baseURL", language.t("provider.custom.error.baseURL.format"))
      return
    }

    batch(() => {
      setFetched("loading", true)
      setFetched("error", undefined)
    })

    try {
      const result = await serverSDK.api.provider.models({
        baseURL,
        mode: form.apiMode,
        apiKey: form.apiKey.trim() || undefined,
        headers: headerValues(form.headers),
      })
      const models = result.models.map((model) => ({ id: model.id, name: model.name ?? model.id }))

      batch(() => {
        setFetched("models", models)
        setFetched("loading", false)
        if (!models.length) setFetched("error", language.t("provider.custom.models.empty"))
        if (models.length && form.modelsMode === "vendor") addFetchedModels(models)
      })
    } catch (error) {
      setFetched("loading", false)
      setFetched("error", error instanceof Error ? error.message : String(error))
    }
  }

  const validate = () => {
`),
      },
      {
        label: "自定义中转站/Provider 表单保存到配置 API",
        before: block(`
      // TODO: Restore custom providers when V2 exposes config and arbitrary credential APIs.
      throw new Error(language.t("provider.custom.unavailable"))
`),
        after: block(`
      await server.ctx.sync.updateConfig({
        providers: {
          [result.providerID]: result.config,
        },
      })
      return result
`),
        skipIf: "await server.ctx.sync.updateConfig({",
      },
      {
        label: "自定义中转站/Provider 阻止 System One 决策 API 保存",
        before: "    if (saveMutation.isPending) return",
        after: '    if (saveMutation.isPending || form.apiMode === "system-one") return',
      },
      {
        label: "兼容旧版自定义 Provider 编辑模式",
        when: "void sdk.api.config",
        before: "            readOnly={!!props.editProviderID}\n",
        after: "",
      },
      {
        label: "自定义中转站/Provider 表单增加 API 模式栏和模型列表 UI",
        before: block(`
        <div class="flex flex-col gap-4">
          <TextField
            autofocus={props.autofocus ?? true}
            label={language.t("provider.custom.field.providerID.label")}
            placeholder={language.t("provider.custom.field.providerID.placeholder")}
            description={language.t("provider.custom.field.providerID.description")}
            value={form.providerID}
            onChange={(v) => setField("providerID", v)}
            validationState={form.err.providerID ? "invalid" : undefined}
            error={form.err.providerID}
          />
          <TextField
            label={language.t("provider.custom.field.name.label")}
            placeholder={language.t("provider.custom.field.name.placeholder")}
            value={form.name}
            onChange={(v) => setField("name", v)}
            validationState={form.err.name ? "invalid" : undefined}
            error={form.err.name}
          />
          <TextField
            label={language.t("provider.custom.field.baseURL.label")}
            placeholder={language.t("provider.custom.field.baseURL.placeholder")}
            value={form.baseURL}
            onChange={(v) => setField("baseURL", v)}
            validationState={form.err.baseURL ? "invalid" : undefined}
            error={form.err.baseURL}
          />
          <TextField
            label={language.t("provider.custom.field.apiKey.label")}
            placeholder={language.t("provider.custom.field.apiKey.placeholder")}
            description={language.t("provider.custom.field.apiKey.description")}
            value={form.apiKey}
            onChange={(v) => setField("apiKey", v)}
          />
        </div>

        <div class="flex flex-col gap-3">
          <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.label")}</label>
          <For each={form.models}>
            {(m, i) => (
              <div class="flex gap-2 items-start" data-row={m.row}>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.models.id.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.models.id.placeholder")}
                    value={m.id}
                    onChange={(v) => setModel(i(), "id", v)}
                    validationState={m.err.id ? "invalid" : undefined}
                    error={m.err.id}
                  />
                </div>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.models.name.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.models.name.placeholder")}
                    value={m.name}
                    onChange={(v) => setModel(i(), "name", v)}
                    validationState={m.err.name ? "invalid" : undefined}
                    error={m.err.name}
                  />
                </div>
                <IconButton
                  type="button"
                  icon={<Icon name="trash" />}
                  variant="ghost"
                  class="mt-1.5"
                  onClick={() => removeModel(i())}
                  disabled={form.models.length <= 1}
                  aria-label={language.t("provider.custom.models.remove")}
                />
              </div>
            )}
          </For>
          <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addModel} class="self-start">
            {language.t("provider.custom.models.add")}
          </Button>
        </div>

        <div class="flex flex-col gap-3">
          <label class="text-12-medium text-text-weak">{language.t("provider.custom.headers.label")}</label>
          <For each={form.headers}>
            {(h, i) => (
              <div class="flex gap-2 items-start" data-row={h.row}>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.headers.key.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.headers.key.placeholder")}
                    value={h.key}
                    onChange={(v) => setHeader(i(), "key", v)}
                    validationState={h.err.key ? "invalid" : undefined}
                    error={h.err.key}
                  />
                </div>
                <div class="flex-1">
                  <TextField
                    label={language.t("provider.custom.headers.value.label")}
                    hideLabel
                    placeholder={language.t("provider.custom.headers.value.placeholder")}
                    value={h.value}
                    onChange={(v) => setHeader(i(), "value", v)}
                    validationState={h.err.value ? "invalid" : undefined}
                    error={h.err.value}
                  />
                </div>
                <IconButton
                  type="button"
                  icon={<Icon name="trash" />}
                  variant="ghost"
                  class="mt-1.5"
                  onClick={() => removeHeader(i())}
                  disabled={form.headers.length <= 1}
                  aria-label={language.t("provider.custom.headers.remove")}
                />
              </div>
            )}
          </For>
          <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addHeader} class="self-start">
            {language.t("provider.custom.headers.add")}
          </Button>
        </div>
`),
        after: block(`
        <div class="grid grid-cols-2 gap-4">
          <TextField
            autofocus={props.autofocus ?? true}
            label={language.t("provider.custom.field.providerID.label")}
            placeholder={language.t("provider.custom.field.providerID.placeholder")}
            description={language.t("provider.custom.field.providerID.description")}
            value={form.providerID}
            onChange={(v) => setField("providerID", v)}
            validationState={form.err.providerID ? "invalid" : undefined}
            error={form.err.providerID}
          />
          <TextField
            label={language.t("provider.custom.field.name.label")}
            placeholder={language.t("provider.custom.field.name.placeholder")}
            value={form.name}
            onChange={(v) => setField("name", v)}
            validationState={form.err.name ? "invalid" : undefined}
            error={form.err.name}
          />
        </div>

        <div class="flex items-start gap-4">
          <div class="flex w-44 shrink-0 flex-col gap-1" role="radiogroup" aria-label={language.t("provider.custom.apiMode.label")}>
            <span class="px-2 pb-1 text-12-medium text-text-weak">{language.t("provider.custom.apiMode.label")}</span>
            <For each={API_MODES}>
              {(mode) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={form.apiMode === mode.id}
                  class="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left focus-visible:outline-none"
                  classList={{
                    "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base": form.apiMode === mode.id,
                    "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover": form.apiMode !== mode.id,
                    "opacity-60": mode.id === "system-one",
                  }}
                  onClick={() => setApiMode(mode.id)}
                >
                  <span class="text-[13px] font-[530] leading-5">{language.t(mode.labelKey)}</span>
                  <span class="text-[11px] leading-4 text-v2-text-text-muted">{language.t(mode.descriptionKey)}</span>
                </button>
              )}
            </For>
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-4">
            <TextField
              label={language.t("provider.custom.field.baseURL.label")}
              placeholder={language.t("provider.custom.field.baseURL.placeholder")}
              value={form.baseURL}
              onChange={(v) => setField("baseURL", v)}
              validationState={form.err.baseURL ? "invalid" : undefined}
              error={form.err.baseURL}
            />
            <TextField
              label={language.t("provider.custom.field.apiKey.label")}
              placeholder={language.t("provider.custom.field.apiKey.placeholder")}
              description={language.t("provider.custom.field.apiKey.description")}
              value={form.apiKey}
              onChange={(v) => setField("apiKey", v)}
            />

            <Show when={form.err.apiMode}>
              {(error) => <p class="text-12-regular text-text-danger-base">{error()}</p>}
            </Show>

            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-2">
                <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.label")}</label>
                <Button
                  type="button"
                  size="small"
                  variant="ghost"
                  icon="download"
                  onClick={fetchModels}
                  disabled={fetched.loading || form.apiMode === "system-one"}
                >
                  {fetched.loading
                    ? language.t("provider.custom.models.fetching")
                    : language.t("provider.custom.models.fetch")}
                </Button>
              </div>

              <Show when={fetched.error}>
                {(error) => <p class="text-12-regular text-text-danger-base">{error()}</p>}
              </Show>

              <Show when={fetched.models.length > 0 || form.modelsMode !== "vendor"}>
                <div class="flex flex-col gap-2">
                  <div class="flex flex-wrap gap-1">
                    <For each={MODELS_MODES}>
                      {(mode) => (
                        <button
                          type="button"
                          class="rounded-sm px-2 py-1 text-[11px] font-[530] leading-4 focus-visible:outline-none"
                          classList={{
                            "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base": form.modelsMode === mode.id,
                            "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover":
                              form.modelsMode !== mode.id,
                          }}
                          onClick={() => setModelsMode(mode.id)}
                        >
                          {language.t(mode.labelKey)}
                        </button>
                      )}
                    </For>
                  </div>

                  <Show when={fetched.models.length > 0}>
                    <div class="flex items-center gap-2">
                      <div class="min-w-0 flex-1">
                        <TextField
                          label={language.t("provider.custom.models.filter.label")}
                          hideLabel
                          placeholder={language.plural("provider.custom.models.filter", fetched.models.length)}
                          value={fetched.filter}
                          onChange={(v) => setFetched("filter", v)}
                        />
                      </div>
                      <Button type="button" size="small" variant="ghost" onClick={selectAllFetched}>
                        {language.t("provider.custom.models.selectAll")}
                      </Button>
                      <Button type="button" size="small" variant="ghost" onClick={selectNoneFetched}>
                        {language.t("provider.custom.models.selectNone")}
                      </Button>
                    </div>

                    <div class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-v2-border-border-muted p-2">
                      <For each={visibleFetched()}>
                        {(model) => (
                          <button
                            type="button"
                            title={model.id}
                            class="max-w-full truncate rounded-sm border px-2 py-1 text-[11px] font-[440] leading-4 focus-visible:outline-none"
                            classList={{
                              "border-v2-border-border-base bg-v2-background-bg-layer-03 text-v2-text-text-base":
                                selectedIDs().has(model.id),
                              "border-v2-border-border-muted text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover":
                                !selectedIDs().has(model.id),
                            }}
                            onClick={() => toggleFetched(model)}
                          >
                            {model.name}
                          </button>
                        )}
                      </For>
                      <Show when={form.modelsMode !== "usage" && !visibleFetched().length}>
                        <span class="text-12-regular text-text-weak">
                          {language.t(
                            !fetched.filter && form.modelsMode === "picked"
                              ? "provider.custom.models.noSelection"
                              : "provider.custom.models.noMatches",
                          )}
                        </span>
                      </Show>
                    </div>
                  </Show>

                  <Show when={form.modelsMode === "usage"}>
                    <p class="text-12-regular text-text-weak">{language.t("provider.custom.models.usageHint")}</p>
                  </Show>
                </div>
              </Show>

              <Show when={manualRows().length > 0}>
                <div class="flex flex-col gap-2">
                  <label class="text-12-medium text-text-weak">{language.t("provider.custom.models.manual")}</label>
                  <For each={manualRows()}>
                    {(entry) => (
                      <div class="flex gap-2 items-start" data-row={entry.model.row}>
                        <div class="flex-1">
                          <TextField
                            label={language.t("provider.custom.models.id.label")}
                            hideLabel
                            placeholder={language.t("provider.custom.models.id.placeholder")}
                            value={entry.model.id}
                            onChange={(v) => setModel(entry.index, "id", v)}
                            validationState={entry.model.err.id ? "invalid" : undefined}
                            error={entry.model.err.id}
                          />
                        </div>
                        <div class="flex-1">
                          <TextField
                            label={language.t("provider.custom.models.name.label")}
                            hideLabel
                            placeholder={language.t("provider.custom.models.name.placeholder")}
                            value={entry.model.name}
                            onChange={(v) => setModel(entry.index, "name", v)}
                            validationState={entry.model.err.name ? "invalid" : undefined}
                            error={entry.model.err.name}
                          />
                        </div>
                        <IconButton
                          type="button"
                          icon={<Icon name="trash" />}
                          variant="ghost"
                          class="mt-1.5"
                          onClick={() => removeModel(entry.index)}
                          disabled={form.models.length <= 1}
                          aria-label={language.t("provider.custom.models.remove")}
                        />
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addModel} class="self-start">
                {language.t("provider.custom.models.add")}
              </Button>
            </div>

            <div class="flex flex-col gap-3">
              <label class="text-12-medium text-text-weak">{language.t("provider.custom.headers.label")}</label>
              <For each={form.headers}>
                {(h, i) => (
                  <div class="flex gap-2 items-start" data-row={h.row}>
                    <div class="flex-1">
                      <TextField
                        label={language.t("provider.custom.headers.key.label")}
                        hideLabel
                        placeholder={language.t("provider.custom.headers.key.placeholder")}
                        value={h.key}
                        onChange={(v) => setHeader(i(), "key", v)}
                        validationState={h.err.key ? "invalid" : undefined}
                        error={h.err.key}
                      />
                    </div>
                    <div class="flex-1">
                      <TextField
                        label={language.t("provider.custom.headers.value.label")}
                        hideLabel
                        placeholder={language.t("provider.custom.headers.value.placeholder")}
                        value={h.value}
                        onChange={(v) => setHeader(i(), "value", v)}
                        validationState={h.err.value ? "invalid" : undefined}
                        error={h.err.value}
                      />
                    </div>
                    <IconButton
                      type="button"
                      icon={<Icon name="trash" />}
                      variant="ghost"
                      class="mt-1.5"
                      onClick={() => removeHeader(i())}
                      disabled={form.headers.length <= 1}
                      aria-label={language.t("provider.custom.headers.remove")}
                    />
                  </div>
                )}
              </For>
              <Button type="button" size="small" variant="ghost" icon="plus-small" onClick={addHeader} class="self-start">
                {language.t("provider.custom.headers.add")}
              </Button>
            </div>
          </div>
        </div>
`),
      },
      {
        label: "自定义中转站/Provider 表单禁用 System One 提交",
        before: "          disabled={saveMutation.isPending}",
        after: '          disabled={saveMutation.isPending || form.apiMode === "system-one"}',
      },
      {
        label: "自定义 Provider 编辑表单引入生命周期",
        before: 'import { batch, createMemo, For, Show } from "solid-js"',
        after: 'import { batch, createMemo, For, onMount, Show } from "solid-js"',
      },
      {
        label: "自定义 Provider 表单支持编辑模式",
        before: "export function CustomProviderForm(props: { autofocus?: boolean } = {}) {",
        after:
          "export function CustomProviderForm(props: { autofocus?: boolean; editProviderID?: string } = {}) {",
      },
      {
        label: "自定义 Provider 编辑表单保留现有配置",
        before: block(`
  const serverSDK = useServerSDK()
  const language = useLanguage()
`),
        after: block(`
  const serverSDK = useServerSDK()
  const language = useLanguage()
  let existingProviderConfig: Record<string, unknown> | undefined
`),
      },
      {
        label: "升级自定义 Provider 编辑回填逻辑（多配置文件与旧版字段）",
        when: "onMount(() => {",
        before: previousOnMountBlock,
        after: onMountBlock,
      },
      {
        label: "升级旧版自定义 Provider 编辑回填逻辑",
        when: "void sdk.api.config",
        before: legacyOnMountBlock,
        after: onMountBlock,
      },
      {
        label: "编辑自定义 Provider 时回填名称、地址、API 模式、模型和请求头",
        before: "  const addModel = () => {",
        after: `${onMountBlock}\n\n  const addModel = () => {`,
        skipIf: "onMount(() => {",
      },
      {
        label: "编辑自定义 Provider 时允许保留当前 Provider ID",
        before:
          "      existingProviderIDs: new Set((data.location.provider.list() ?? []).map((provider) => provider.id)),",
        after: [
          "      existingProviderIDs: new Set(",
          "        (data.location.provider.list() ?? [])",
          "          .map((provider) => provider.id)",
          "          .filter((id) => id !== props.editProviderID),",
          "      ),",
        ].join("\n"),
      },
      {
        label: "编辑 Provider ID 时禁止改名",
        before: block(`
            value={form.providerID}
            onChange={(v) => setField("providerID", v)}
`),
        after: block(`
            value={form.providerID}
            onChange={(v) => setField("providerID", v)}
            readOnly={!!props.editProviderID}
`),
      },
      {
        label: "编辑时合并配置并保留原有设置和请求头",
        before: [
          block(`
      await server.ctx.sync.updateConfig({
        providers: {
          [result.providerID]: result.config,
        },
      })
`),
          block(`
      const previousOptions = (existingProviderConfig?.options ?? {}) as Record<string, unknown>
      const config = existingProviderConfig
        ? ({
            ...existingProviderConfig,
            ...result.config,
            options: { ...previousOptions, ...result.config.options },
          } as typeof result.config)
        : result.config
      await server.ctx.sync.updateConfig({
        providers: {
          [result.providerID]: config,
        },
      })
`),
        ],
        after: block(`
      const previous = existingProviderConfig as
        | { settings?: Record<string, unknown>; headers?: Record<string, string> }
        | undefined
      const config = existingProviderConfig
        ? ({
            ...existingProviderConfig,
            ...result.config,
            settings: { ...previous?.settings, ...result.config.settings },
            headers: { ...previous?.headers, ...result.config.headers },
          } as typeof result.config)
        : result.config
      await server.ctx.sync.updateConfig({
        providers: {
          [result.providerID]: config,
        },
      })
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "app", "src", "settings", "providers", "providers.tsx"),
    edits: [
      {
        label: "配置来源 Provider 优先识别环境变量与自定义来源",
        before: block(`
  const source = (item: ProviderItem): ProviderSource | undefined => {
    const current = integration(item)
    const credential = current?.connections.find((connection) => connection.type === "credential")

    if (credential) return credential.method === "oauth" ? "account" : "api"

    if (current?.connections.some((connection) => connection.type === "env")) return "env"

    if (current) return "config"
`),
        after: block(`
  const source = (item: ProviderItem): ProviderSource | undefined => {
    const current = integration(item)
    const credential = current?.connections.find((connection) => connection.type === "credential")

    if (credential) return credential.method === "oauth" ? "account" : "api"

    if (current?.connections.some((connection) => connection.type === "env")) return "env"

    if ("source" in item && item.source === "custom") return "custom"

    if (current) return "config"
`),
      },
      {
        label: "供应商设置列表引入自定义 Provider 编辑表单",
        before: block(`
import { DialogConnectProvider, useProviderConnectController } from "@/providers/connect/dialog"
import { ProviderModelIcon } from "@/providers/models/provider-group"
`),
        after: block(`
import { DialogConnectProvider, useProviderConnectController } from "@/providers/connect/dialog"
import { CustomProviderForm } from "@/providers/credentials/dialog"
import { ProviderModelIcon } from "@/providers/models/provider-group"
`),
      },
      {
        label: "供应商设置编辑弹窗引入 Dialog 容器组件",
        before: block(`
import { DialogConnectProvider, useProviderConnectController } from "@/providers/connect/dialog"
import { CustomProviderForm } from "@/providers/credentials/dialog"
import { ProviderModelIcon } from "@/providers/models/provider-group"
`),
        after: block(`
import { DialogConnectProvider, useProviderConnectController } from "@/providers/connect/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { CustomProviderForm } from "@/providers/credentials/dialog"
import { ProviderModelIcon } from "@/providers/models/provider-group"
`),
      },
      {
        label: "供应商列表增加自定义 Provider 编辑入口",
        before: "  const available = createMemo(() => {",
        after: block(`
  const editCustomProvider = (providerID: string) => {
    void dialog.show(() => (
      <Dialog
        containerClass="!h-[min(calc(100vh_-_16px),640px)] !w-[min(calc(100vw_-_16px),640px)]"
        class="[font-family:var(--v2-font-family-sans)] [&_[data-slot=dialog-header]]:!px-5 [&_[data-slot=dialog-header-title]]:!text-[15px]"
      >
        <DialogHeader closeLabel={language.t("common.close")}>
          <DialogTitle>{language.t("provider.custom.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody class="min-h-0 flex-1 overflow-hidden px-2 pb-2">
          <CustomProviderForm autofocus={false} editProviderID={providerID} hideTitle />
        </DialogBody>
      </Dialog>
    ))
  }

  const available = createMemo(() => {
`),
      },
      {
        label: "连接的自定义 Provider 显示编辑按钮",
        before: block(`
                            fallback={
                              <Show
                                when={canDisconnect(item)}
                                fallback={
                                  <span class="settings-provider-env-hint">
                                    {language.t("settings.providers.connected.environmentDescription")}
                                  </span>
                                }
                              >
                                <Button
                                  size="normal"
                                  variant="ghost-muted"
                                  onClick={() => void disconnect(item, item.name)}
                                >
                                  {language.t("common.disconnect")}
                                </Button>
                              </Show>
`),
        after: block(`
                            fallback={
                              <div class="flex items-center gap-2">
                                <Show when={source(item) === "custom"}>
                                  <Button
                                    size="normal"
                                    variant="ghost-muted"
                                    onClick={() => editCustomProvider(item.id)}
                                  >
                                    {language.t("common.edit")}
                                  </Button>
                                </Show>
                                <Show
                                  when={canDisconnect(item)}
                                  fallback={
                                    <Show when={source(item) !== "custom"}>
                                      <span class="settings-provider-env-hint">
                                        {language.t("settings.providers.connected.environmentDescription")}
                                      </span>
                                    </Show>
                                  }
                                >
                                  <Button
                                    size="normal"
                                    variant="ghost-muted"
                                    onClick={() => void disconnect(item, item.name)}
                                  >
                                    {language.t("common.disconnect")}
                                  </Button>
                                </Show>
                              </div>
`),
      },
      {
        label: "自定义 Provider 编辑优先于账号配置菜单",
        before: block(`
                          <Show
                            when={canManageAccounts(item)}
                            fallback={
                              <div class="flex items-center gap-2">
                                <Show when={source(item) === "custom"}>
                                  <Button
                                    size="normal"
                                    variant="ghost-muted"
                                    onClick={() => editCustomProvider(item.id)}
                                  >
                                    {language.t("common.edit")}
                                  </Button>
                                </Show>
                                <Show
                                  when={canDisconnect(item)}
                                  fallback={
                                    <Show when={source(item) !== "custom"}>
                                      <span class="settings-provider-env-hint">
                                        {language.t("settings.providers.connected.environmentDescription")}
                                      </span>
                                    </Show>
                                  }
                                >
                                  <Button
                                    size="normal"
                                    variant="ghost-muted"
                                    onClick={() => void disconnect(item, item.name)}
                                  >
                                    {language.t("common.disconnect")}
                                  </Button>
                                </Show>
                              </div>
                            }
                          >
                            <AccountMenu provider={item} />
                          </Show>
`),
        after: block(`
                          <Show when={source(item) === "custom"} fallback={
                            <Show
                              when={canManageAccounts(item)}
                              fallback={
                                <Show
                                  when={canDisconnect(item)}
                                  fallback={
                                    <span class="settings-provider-env-hint">
                                      {language.t("settings.providers.connected.environmentDescription")}
                                    </span>
                                  }
                                >
                                  <Button
                                    size="normal"
                                    variant="ghost-muted"
                                    onClick={() => void disconnect(item, item.name)}
                                  >
                                    {language.t("common.disconnect")}
                                  </Button>
                                </Show>
                              }
                            >
                              <AccountMenu provider={item} />
                            </Show>
                          }>
                            <Button
                              size="normal"
                              variant="ghost-muted"
                              onClick={() => editCustomProvider(item.id)}
                            >
                              {language.t("common.edit")}
                            </Button>
                          </Show>
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "app", "src", "runtime", "server", "sync.tsx"),
    edits: [
      {
        label: "前端调用服务端配置更新 API",
        before: block(`
    mutationFn: async (config: Config) => {
      // TODO: Restore config updates when the V2 client exposes a config API.
      // await serverSDK.api.config.update({ config })
      throw new Error(\`Config updates are unavailable: \${Object.keys(config).length} fields were not saved\`)
    },
`),
        after: block(`
    mutationFn: async (patch: Parameters<ServerApi["config"]["update"]>[0]) => {
      await serverSDK.api.config.update(patch)
    },
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "schema", "src", "config.ts"),
    edits: [
      {
        label: "配置更新 Schema 允许提交 Provider",
        before: block(`
export const Patch = Schema.Struct({
  shell: Schema.NullOr(Schema.String),
}).annotate({ identifier: "Config.Patch" })
`),
        after: block(`
export const Patch = Schema.Struct({
  shell: Schema.NullOr(Schema.String).pipe(optional),
  providers: Schema.Record(Schema.String, Schema.Json).pipe(optional),
}).annotate({ identifier: "Config.Patch" })
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "core", "src", "config.ts"),
    edits: [
      {
        label: "配置落盘逻辑合并 Provider 设置",
        before: block(`
            try: () =>
              applyEdits(
                text,
                modify(text, ["shell"], patch.shell ?? undefined, {
                  formattingOptions: { tabSize: 2, insertSpaces: true },
                }),
              ),
`),
        after: block(`
            try: () => {
              const formattingOptions = { tabSize: 2, insertSpaces: true }
              const base =
                patch.shell === undefined
                  ? text
                  : applyEdits(text, modify(text, ["shell"], patch.shell ?? undefined, { formattingOptions }))
              return Object.entries(patch.providers ?? {}).reduce(
                (current, [providerID, provider]) =>
                  applyEdits(current, modify(current, ["providers", providerID], provider, { formattingOptions })),
                base,
              )
            },
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "core", "src", "config", "normalize.ts"),
    edits: [
      {
        label: "兼容旧版 providers 中的 npm/options 字段",
        before: block(`
  const legacyProviders = migrateProviders(input.provider, diagnostics)
  const nativeProviders = decodeMap(input.providers, ConfigProvider.Info, ["providers"], diagnostics, decodeEncoded)
`),
        after: block(`
  const isLegacyProvider = (value: unknown) =>
    isRecord(value) &&
    (own(value, "npm") || own(value, "options") || own(value, "api") || own(value, "provider"))
  const legacyProviders = mergeMaps(
    migrateProviders(input.provider, diagnostics),
    migrateProviders(
      isRecord(input.providers)
        ? Object.fromEntries(Object.entries(input.providers).filter(([, raw]) => isLegacyProvider(raw)))
        : undefined,
      diagnostics,
    ),
    ["providers"],
    diagnostics,
  )
  const nativeProviders = decodeMap(
    isRecord(input.providers)
      ? Object.fromEntries(Object.entries(input.providers).filter(([, raw]) => !isLegacyProvider(raw)))
      : input.providers,
    ConfigProvider.Info,
    ["providers"],
    diagnostics,
    decodeEncoded,
  )
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "core", "src", "config", "plugin", "policy.ts"),
    edits: [
      {
        label: "允许用户显式配置的 Provider 绕过默认 deny 策略",
        before: block(`
    yield* ctx.provider.transform((providers) => {
      const current = policies()
      const denied: string[] = []
      for (const record of providers.list()) {
        const policy = current.findLast(
          (policy) => policy.action === "provider.use" && Wildcard.match(record.provider.id, policy.resource),
        )
        if (policy?.effect !== "deny") continue
        providers.remove(record.provider.id)
        // Skip unconfigured catalog entries; deny-all policies would otherwise log the whole catalog.
        if (record.provider.activation === "enabled") denied.push(record.provider.id)
      }
      if (denied.length) runSync(Effect.logDebug("providers denied by policy", { providers: denied }))
    })
`),
        after: block(`
    yield* ctx.provider.transform((providers) => {
      const current = policies()
      const organizationPolicy = managed.current()
      const denied: string[] = []
      for (const record of providers.list()) {
        const policy = current.findLast(
          (policy) => policy.action === "provider.use" && Wildcard.match(record.provider.id, policy.resource),
        )
        if (policy?.effect !== "deny") continue
        // A provider explicitly configured by the user is allowed to override the
        // default deny-all policy; organization policy still has the final say.
        if (
          record.provider.activation === "enabled" &&
          ManagedPolicy.decision(organizationPolicy.statements, "provider.use", record.provider.id) !== "deny"
        )
          continue
        providers.remove(record.provider.id)
        // Skip unconfigured catalog entries; deny-all policies would otherwise log the whole catalog.
        if (record.provider.activation === "enabled") denied.push(record.provider.id)
      }
      if (denied.length) runSync(Effect.logDebug("providers denied by policy", { providers: denied }))
    })
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "protocol", "src", "groups", "provider.ts"),
    edits: [
      {
        label: "Provider 协议增加模型发现输入输出",
        before: block(`
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const ProviderGroup = HttpApiGroup.make("server.provider")
`),
        after: block(`
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const ProviderModelDiscoveryInput = Schema.Struct({
  baseURL: Schema.String,
  mode: Schema.Literals(["openai", "responses", "anthropic", "gemini", "system-one"]),
  apiKey: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})

export const ProviderModelDiscoveryOutput = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String),
    }),
  ),
})

export const ProviderGroup = HttpApiGroup.make("server.provider")
`),
      },
      {
        label: "Provider 协议增加模型发现接口",
        before: block(`
  .annotateMerge(
    OpenApi.annotations({
      title: "provider",
`),
        after: block(`
  .add(
    HttpApiEndpoint.post("provider.models", "/api/provider/models", {
      payload: ProviderModelDiscoveryInput,
      success: ProviderModelDiscoveryOutput,
      error: ServiceUnavailableError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "provider.models",
        summary: "Discover provider models",
        description: "Ask a provider for the models its API exposes, using the configured API mode and credentials.",
      }),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "provider",
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "server", "src", "handlers", "provider.ts"),
    edits: [
      {
        label: "Provider 服务端处理器接入模型发现",
        before: block(`
import { Provider } from "@opencode/core/provider"
import { ProviderNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
`),
        after: block(`
import { Provider } from "@opencode/core/provider"
import { ProviderDiscovery } from "@opencode/core/provider-discovery"
import { ProviderNotFoundError, ServiceUnavailableError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
`),
      },
      {
        label: "Provider 服务端处理器暴露模型发现接口",
        before: block(`
          return yield* response(Effect.succeed(provider))
        }),
      )
  }),
)
`),
        after: block(`
          return yield* response(Effect.succeed(provider))
        }),
      )
      .handle(
        "provider.models",
        Effect.fn(function* (ctx) {
          return yield* ProviderDiscovery.discover(ctx.payload).pipe(
            Effect.provide(FetchHttpClient.layer),
            Effect.mapError(
              (error) =>
                new ServiceUnavailableError({
                  message: error.message,
                  service: "provider",
                }),
            ),
          )
        }),
      )
  }),
)
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "plugin", "src", "promise", "adapter.ts"),
    edits: [
      {
        label: "插件 Promise 适配器暴露模型发现接口",
        before: block(`
            get: adaptApiMethod(ProviderEndpoints["provider.get"], host.provider.get),
            transform: transform(host.provider),
`),
        after: block(`
            get: adaptApiMethod(ProviderEndpoints["provider.get"], host.provider.get),
            models: adaptApiMethod(ProviderEndpoints["provider.models"], host.provider.models),
            transform: transform(host.provider),
`),
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "core", "src", "plugin", "host.ts"),
    edits: [
      {
        label: "Provider 插件宿主接入模型发现",
        before: 'import { Effect, Schema, Stream } from "effect"\nimport { Agent } from "../agent.js"',
        after:
          'import { Effect, Schema, Stream } from "effect"\nimport { FetchHttpClient } from "effect/http"\nimport { Agent } from "../agent.js"',
      },
      {
        label: "Provider 插件宿主引入模型发现实现",
        before: 'import { Provider } from "../provider.js"\nimport { Reference } from "../reference.js"',
        after:
          'import { Provider } from "../provider.js"\nimport { ProviderDiscovery } from "../provider-discovery.js"\nimport { Reference } from "../reference.js"',
      },
      {
        label: "Provider 插件宿主暴露模型发现接口",
        before: [
          "      reload: providers.reload,\n      transform: (callback) =>\n        providers.transform((editor) => {",
        ],
        after:
          "      models: (input) => ProviderDiscovery.discover(input).pipe(Effect.provide(FetchHttpClient.layer)),\n      reload: providers.reload,\n      transform: (callback) =>\n        providers.transform((editor) => {",
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "core", "test", "fixture", "policy.ts"),
    edits: [
      {
        label: "测试 Provider 桩补齐模型发现接口",
        before: [
          '      provider: {\n        list: () => Effect.die("unused provider.list"),\n        get: () => Effect.die("unused provider.get"),\n        transform: () => Effect.succeed({ dispose: Effect.void }),',
        ],
        after:
          '      provider: {\n        list: () => Effect.die("unused provider.list"),\n        get: () => Effect.die("unused provider.get"),\n        models: () => Effect.die("unused provider.models"),\n        transform: () => Effect.succeed({ dispose: Effect.void }),',
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "core", "test", "plugin", "host.ts"),
    edits: [
      {
        label: "测试插件宿主默认 Provider 桩补齐模型发现接口",
        before: [
          '    provider: overrides.provider ?? {\n      list: () => Effect.die("unused provider.list"),\n      get: () => Effect.die("unused provider.get"),\n      transform: () => Effect.die("unused provider.transform"),',
        ],
        after:
          '    provider: overrides.provider ?? {\n      list: () => Effect.die("unused provider.list"),\n      get: () => Effect.die("unused provider.get"),\n      models: () => Effect.die("unused provider.models"),\n      transform: () => Effect.die("unused provider.transform"),',
      },
      {
        label: "测试 Provider 宿主补齐模型发现接口",
        before: [
          "    reload: providers.reload,\n    transform: (callback) =>\n      providers.transform((editor) =>\n        callback({",
        ],
        after:
          '    models: () => Effect.die("unused provider.models"),\n    reload: providers.reload,\n    transform: (callback) =>\n      providers.transform((editor) =>\n        callback({',
      },
      {
        label: "测试空 Provider 宿主补齐模型发现接口",
        before: [
          'export const noProviders: Plugin.Context["provider"] = {\n  list: () => Effect.succeed(located([])),\n  get: () => Effect.die("unused provider.get"),\n  transform: () => Effect.die("unused provider.transform"),',
        ],
        after:
          'export const noProviders: Plugin.Context["provider"] = {\n  list: () => Effect.succeed(located([])),\n  get: () => Effect.die("unused provider.get"),\n  models: () => Effect.die("unused provider.models"),\n  transform: () => Effect.die("unused provider.transform"),',
      },
    ],
  },
  {
    file: path.join(vendor, "packages", "app", "src", "runtime", "i18n", "en.ts"),
    edits: [
      {
        label: "自定义中转站/Provider 增加 API 模式文案",
        before: block(`
  "provider.custom.description.prefix": "Configure an OpenAI-compatible provider. See the ",
  "provider.custom.description.link": "provider config docs",
  "provider.custom.description.suffix": ".",
`),
        after: block(`
  "provider.custom.description.prefix": "Configure a custom provider. See the ",
  "provider.custom.description.link": "provider config docs",
  "provider.custom.description.suffix": ".",
  "provider.custom.apiMode.label": "API mode",
  "provider.custom.apiMode.openai.label": "OpenAI compatible",
  "provider.custom.apiMode.openai.description": "Chat Completions, the most widely supported API",
  "provider.custom.apiMode.responses.label": "OpenAI Responses",
  "provider.custom.apiMode.responses.description": "Responses API, used by Codex",
  "provider.custom.apiMode.anthropic.label": "Anthropic compatible",
  "provider.custom.apiMode.anthropic.description": "Anthropic Messages, used by Claude Code",
  "provider.custom.apiMode.gemini.label": "Gemini compatible",
  "provider.custom.apiMode.gemini.description": "Gemini generateContent, used by the Gemini CLI",
  "provider.custom.apiMode.systemOne.label": "System One",
  "provider.custom.apiMode.systemOne.description": "Decision API used by routing groups",
`),
      },
      {
        label: "自定义中转站/Provider 增加模型列表文案",
        before: '  "provider.custom.models.label": "Models",',
        after: block(`
  "provider.custom.models.label": "Models",
  "provider.custom.models.fetch": "Fetch models",
  "provider.custom.models.fetching": "Fetching models…",
  "provider.custom.models.empty": "The provider returned no models.",
  "provider.custom.models.vendor": "Vendor's list",
  "provider.custom.models.picked": "Picked only",
  "provider.custom.models.usage": "Usage only",
  "provider.custom.models.usageHint": "No models will be enabled. This provider is saved for usage only.",
  "provider.custom.models.filter.label": "Filter models",
  "provider.custom.models.filter.one": "Filter {{count}} model…",
  "provider.custom.models.filter.other": "Filter {{count}} models…",
  "provider.custom.models.selectAll": "Select all",
  "provider.custom.models.selectNone": "Select none",
  "provider.custom.models.noMatches": "No models match this filter.",
  "provider.custom.models.noSelection": "No models selected.",
  "provider.custom.models.manual": "Added by hand",
`),
      },
      {
        label: "自定义中转站/Provider 增加 API 模式错误文案",
        before: '  "provider.custom.error.baseURL.format": "Must start with http:// or https://",',
        after: block(`
  "provider.custom.error.baseURL.format": "Must start with http:// or https://",
  "provider.custom.error.apiMode.unsupported": "System One decision APIs are not supported as chat providers yet.",
`),
      },
    ],
  },
];

const creates = [
  {
    file: path.join(vendor, "packages", "core", "src", "provider-discovery.ts"),
    marker: "export * as ProviderDiscovery",
    label: "新增供应商模型发现实现",
    content: [
      'export * as ProviderDiscovery from "./provider-discovery.js"',
      "",
      'import { Effect, Schema } from "effect"',
      'import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"',
      "",
      'export type Mode = "openai" | "responses" | "anthropic" | "gemini" | "system-one"',
      "",
      "export type Input = {",
      "  readonly baseURL: string",
      "  readonly mode: Mode",
      "  readonly apiKey?: string",
      "  readonly headers?: Readonly<Record<string, string>>",
      "}",
      "",
      "export type Model = {",
      "  readonly id: string",
      "  readonly name?: string",
      "}",
      "",
      "export type Output = {",
      "  readonly models: readonly Model[]",
      "}",
      "",
      "const RemoteModel = Schema.StructWithRest(",
      "  Schema.Struct({",
      "    id: Schema.optional(Schema.String),",
      "    name: Schema.optional(Schema.String),",
      "    display_name: Schema.optional(Schema.String),",
      "    displayName: Schema.optional(Schema.String),",
      "  }),",
      "  [Schema.Record(Schema.String, Schema.Unknown)],",
      ")",
      "",
      "const RemoteModels = Schema.Union([",
      "  Schema.Struct({ data: Schema.Array(RemoteModel) }),",
      "  Schema.Struct({ models: Schema.Array(RemoteModel) }),",
      "  Schema.Array(RemoteModel),",
      "])",
      "",
      "type RemoteModelValue = Schema.Schema.Type<typeof RemoteModel>",
      "",
      "export function discover(input: Input): Effect.Effect<Output, Error, HttpClient.HttpClient> {",
      "  return Effect.gen(function* () {",
      "    const http = yield* HttpClient.HttpClient",
      '    const url = `${input.baseURL.replace(/\\/+$/, "").replace(/\\/models$/, "")}/models`',
      "    const headers: Record<string, string> = { ...input.headers }",
      "    const hasHeader = (name: string) => Object.keys(headers).some((key) => key.toLowerCase() === name)",
      "",
      "    if (input.apiKey) {",
      '      if (input.mode === "anthropic") {',
      '        if (!hasHeader("x-api-key")) headers["x-api-key"] = input.apiKey',
      '        if (!hasHeader("authorization")) headers.authorization = `Bearer ${input.apiKey}`',
      '        if (!hasHeader("anthropic-version")) headers["anthropic-version"] = "2023-06-01"',
      '      } else if (input.mode === "gemini") {',
      '        if (!hasHeader("x-goog-api-key")) headers["x-goog-api-key"] = input.apiKey',
      '      } else if (!hasHeader("authorization")) {',
      "        headers.authorization = `Bearer ${input.apiKey}`",
      "      }",
      "    }",
      "",
      "    const response = yield* http",
      "      .execute(",
      "        HttpClientRequest.get(url).pipe(",
      "          HttpClientRequest.acceptJson,",
      "          HttpClientRequest.setHeaders(headers),",
      "        ),",
      "      )",
      "      .pipe(",
      '        Effect.timeout("20 seconds"),',
      "        Effect.mapError(",
      "          (error) => new Error(`Could not fetch the provider model list: ${String(error)}`),",
      "        ),",
      "      )",
      "",
      "    if (response.status < 200 || response.status >= 300) {",
      '      const body = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")))',
      "      return yield* Effect.fail(",
      "        new Error(",
      '          `Provider model list request failed with HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`,',
      "        ),",
      "      )",
      "    }",
      "",
      "    const data = yield* HttpClientResponse.schemaBodyJson(RemoteModels)(response).pipe(",
      '      Effect.mapError(() => new Error("Provider returned an invalid model list.")),',
      "    )",
      "",
      "    const list: ReadonlyArray<RemoteModelValue> = Array.isArray(data)",
      "      ? data",
      '      : "models" in data',
      "        ? data.models",
      '        : "data" in data',
      "          ? data.data",
      "          : []",
      "    const seen = new Set<string>()",
      "    const models = list.flatMap((model) => {",
      "      const raw = model.id ?? model.name",
      "      if (!raw) return []",
      '      const id = raw.replace(/^models\\//, "")',
      "      if (seen.has(id)) return []",
      "      seen.add(id)",
      "      const name = model.displayName ?? model.display_name ?? (model.name !== raw ? model.name : undefined)",
      "      return [{ id, ...(name ? { name } : {}) }]",
      "    })",
      "",
      "    return { models }",
      "  })",
      "}",
      "",
    ].join("\n"),
  },
];

const pending = [];
const errors = [];

for (const task of tasks) {
  let content;
  try {
    content = readFileSync(task.file, "utf8");
  } catch {
    errors.push(`缺少文件：${path.relative(root, task.file)}`);
    continue;
  }

  const crlf = content.includes("\r\n");
  let next = content.replace(/\r\n/g, "\n");
  let changed = false;

  for (const [index, edit] of task.edits.entries()) {
    if (edit.after && next.includes(edit.after)) continue;
    if (edit.skipIf && next.includes(edit.skipIf)) continue;
    if (edit.when && !next.includes(edit.when)) continue;
    const before = Array.isArray(edit.before) ? edit.before : [edit.before];
    const counts = before.map((value) => next.split(value).length - 1);
    const unique = counts.findIndex((count) => count === 1);
    if (unique === -1) {
      const superseded = task.edits
        .slice(index + 1)
        .some((later) => later.after && next.includes(later.after));
      if (counts.every((count) => count === 0) && superseded) continue;
      errors.push(
        `无法唯一定位「${edit.label}」：${path.relative(root, task.file)}（匹配数 ${counts.join("/")}）`,
      );
      continue;
    }
    next = next.replace(before[unique], edit.after);
    changed = true;
    pending.push(`${path.relative(root, task.file)}：${edit.label}`);
  }

  task.changed = changed;
  task.next = crlf ? next.replace(/\n/g, "\r\n") : next;
}

for (const create of creates) {
  if (existsSync(create.file)) {
    const content = readFileSync(create.file, "utf8");
    if (content.includes(create.marker)) continue;
    errors.push(`文件已存在但内容不匹配：${path.relative(root, create.file)}`);
    continue;
  }
  pending.push(`${path.relative(root, create.file)}：${create.label}`);
}

if (errors.length) {
  console.error("检查失败，未修改任何文件：");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (checkOnly) {
  console.log(
    pending.length
      ? "待应用的自定义中转站 / API 模式 / 模型列表注入："
      : "自定义中转站 / API 模式 / 模型列表注入已启用，无需修改。",
  );
  for (const item of pending) console.log(`  - ${item}`);
  process.exit(0);
}

for (const task of tasks) {
  if (task.changed) writeFileSync(task.file, task.next, "utf8");
}

for (const create of creates) {
  if (existsSync(create.file)) continue;
  mkdirSync(path.dirname(create.file), { recursive: true });
  writeFileSync(create.file, create.content, "utf8");
}

console.log(
  pending.length
    ? "已应用自定义中转站 / API 模式 / 模型列表注入："
    : "自定义中转站 / API 模式 / 模型列表注入已启用，无需修改。",
);
for (const item of pending) console.log(`  - ${item}`);

if (skipGenerate) {
  console.log("已跳过客户端代码生成（--no-generate）。如类型未更新，请运行：bun run generate");
} else {
  const result = spawnSync("bun run generate", {
    cwd: path.join(vendor, "packages", "client"),
    stdio: "inherit",
    shell: true,
  });
  if (result.error || result.status !== 0) {
    console.error("客户端代码生成失败。请在 vendor/opencode/packages/client 下运行：bun run generate");
    process.exitCode = 1;
  } else {
    console.log("已重新生成客户端 API 类型。");
  }
}
