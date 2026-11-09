import { describe, expect, test } from "bun:test"
import { validateCustomProvider } from "./form"

const t = (key: string) => key

describe("validateCustomProvider", () => {
  test("builds trimmed config payload", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: " Custom Provider ",
        baseURL: "https://api.example.com ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        apiMode: "openai",
        modelsMode: "picked",
        models: [{ row: "m0", id: " model-a ", name: " Model A ", err: {} }],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
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
    })
  })

  test("flags duplicate rows and allows reconnecting disabled providers", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        apiMode: "openai",
        modelsMode: "picked",
        models: [
          { row: "m0", id: "model-a", name: "Model A", err: {} },
          { row: "m1", id: "model-a", name: "Model A 2", err: {} },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: ["custom-provider"],
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBeUndefined()
    expect(result.models[1]).toEqual({
      id: "provider.custom.error.duplicate",
      name: undefined,
    })
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
