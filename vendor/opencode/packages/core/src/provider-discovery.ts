export * as ProviderDiscovery from "./provider-discovery.js"

import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

export type Mode = "openai" | "responses" | "anthropic" | "gemini" | "system-one"

export type Input = {
  readonly baseURL: string
  readonly mode: Mode
  readonly apiKey?: string
  readonly headers?: Readonly<Record<string, string>>
}

export type Model = {
  readonly id: string
  readonly name?: string
}

export type Output = {
  readonly models: readonly Model[]
}

const RemoteModel = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
    display_name: Schema.optional(Schema.String),
    displayName: Schema.optional(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

const RemoteModels = Schema.Union([
  Schema.Struct({ data: Schema.Array(RemoteModel) }),
  Schema.Struct({ models: Schema.Array(RemoteModel) }),
  Schema.Array(RemoteModel),
])

type RemoteModelValue = Schema.Schema.Type<typeof RemoteModel>

export function discover(input: Input): Effect.Effect<Output, Error, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const url = `${input.baseURL.replace(/\/+$/, "").replace(/\/models$/, "")}/models`
    const headers: Record<string, string> = { ...input.headers }
    const hasHeader = (name: string) => Object.keys(headers).some((key) => key.toLowerCase() === name)

    if (input.apiKey) {
      if (input.mode === "anthropic") {
        if (!hasHeader("x-api-key")) headers["x-api-key"] = input.apiKey
        if (!hasHeader("authorization")) headers.authorization = `Bearer ${input.apiKey}`
        if (!hasHeader("anthropic-version")) headers["anthropic-version"] = "2023-06-01"
      } else if (input.mode === "gemini") {
        if (!hasHeader("x-goog-api-key")) headers["x-goog-api-key"] = input.apiKey
      } else if (!hasHeader("authorization")) {
        headers.authorization = `Bearer ${input.apiKey}`
      }
    }

    const response = yield* http
      .execute(
        HttpClientRequest.get(url).pipe(
          HttpClientRequest.acceptJson,
          HttpClientRequest.setHeaders(headers),
        ),
      )
      .pipe(
        Effect.timeout("20 seconds"),
        Effect.mapError(
          (error) => new Error(`Could not fetch the provider model list: ${String(error)}`),
        ),
      )

    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(Effect.catch(() => Effect.succeed("")))
      return yield* Effect.fail(
        new Error(
          `Provider model list request failed with HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`,
        ),
      )
    }

    const data = yield* HttpClientResponse.schemaBodyJson(RemoteModels)(response).pipe(
      Effect.mapError(() => new Error("Provider returned an invalid model list.")),
    )

    const list: ReadonlyArray<RemoteModelValue> = Array.isArray(data)
      ? data
      : "models" in data
        ? data.models
        : "data" in data
          ? data.data
          : []
    const seen = new Set<string>()
    const models = list.flatMap((model) => {
      const raw = model.id ?? model.name
      if (!raw) return []
      const id = raw.replace(/^models\//, "")
      if (seen.has(id)) return []
      seen.add(id)
      const name = model.displayName ?? model.display_name ?? (model.name !== raw ? model.name : undefined)
      return [{ id, ...(name ? { name } : {}) }]
    })

    return { models }
  })
}
