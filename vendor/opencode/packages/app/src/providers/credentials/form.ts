const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/

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

type Translator = (key: string, vars?: Record<string, string | number | boolean>) => string

export type ModelErr = {
  id?: string
  name?: string
}

export type HeaderErr = {
  key?: string
  value?: string
}

export type ModelRow = {
  row: string
  id: string
  name: string
  err: ModelErr
}

export type HeaderRow = {
  row: string
  key: string
  value: string
  err: HeaderErr
}

export type FormState = {
  providerID: string
  name: string
  baseURL: string
  apiKey: string
  apiMode: ApiMode
  modelsMode: ModelsMode
  models: ModelRow[]
  headers: HeaderRow[]
  err: {
    providerID?: string
    name?: string
    baseURL?: string
    apiMode?: string
  }
}

type ValidateArgs = {
  form: FormState
  t: Translator
  disabledProviders: string[]
  existingProviderIDs: Set<string>
}

export function headerValues(rows: HeaderRow[]) {
  return Object.fromEntries(
    rows
      .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
      .filter((header) => !!header.key && !!header.value)
      .map((header) => [header.key, header.value]),
  )
}

export function validateCustomProvider(input: ValidateArgs) {
  const providerID = input.form.providerID.trim()
  const name = input.form.name.trim()
  const baseURL = input.form.baseURL.trim()
  const apiKey = input.form.apiKey.trim()
  const apiMode = API_MODES.find((mode) => mode.id === input.form.apiMode)
  const packageName = apiMode?.package
  const usageOnly = input.form.modelsMode === "usage"

  const env = apiKey.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
  const key = apiKey && !env ? apiKey : undefined
  const apiModeError = packageName ? undefined : input.t("provider.custom.error.apiMode.unsupported")

  const idError = !providerID
    ? input.t("provider.custom.error.providerID.required")
    : !PROVIDER_ID.test(providerID)
      ? input.t("provider.custom.error.providerID.format")
      : undefined

  const nameError = !name ? input.t("provider.custom.error.name.required") : undefined

  const urlError = !baseURL
    ? input.t("provider.custom.error.baseURL.required")
    : !/^https?:\/\//.test(baseURL)
      ? input.t("provider.custom.error.baseURL.format")
      : undefined

  const disabled = input.disabledProviders.includes(providerID)

  const existsError = idError
    ? undefined
    : input.existingProviderIDs.has(providerID) && !disabled
      ? input.t("provider.custom.error.providerID.exists")
      : undefined

  const seenModels = new Set<string>()

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

  const seenHeaders = new Set<string>()

  const headers = input.form.headers.map((h) => {
    const key = h.key.trim()
    const value = h.value.trim()

    if (!key && !value) return {}

    const keyError = !key
      ? input.t("provider.custom.error.required")
      : seenHeaders.has(key.toLowerCase())
        ? input.t("provider.custom.error.duplicate")
        : (() => {
            seenHeaders.add(key.toLowerCase())

            return undefined
          })()

    const valueError = !value ? input.t("provider.custom.error.required") : undefined

    return { key: keyError, value: valueError }
  })

  const headersValid = headers.every((h) => !h.key && !h.value)

  const headerConfig = headerValues(input.form.headers)

  const err = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
    apiMode: apiModeError,
  }

  const ok =
    !idError && !existsError && !nameError && !urlError && !apiModeError && modelsValid && headersValid

  if (!ok || !packageName) return { err, models, headers }

  return {
    err,
    models,
    headers,
    result: {
      providerID,
      name,
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
    },
  }
}

let row = 0

const nextRow = () => `row-${row++}`

export const modelRow = (): ModelRow => ({ row: nextRow(), id: "", name: "", err: {} })

export const headerRow = (): HeaderRow => ({ row: nextRow(), key: "", value: "", err: {} })
