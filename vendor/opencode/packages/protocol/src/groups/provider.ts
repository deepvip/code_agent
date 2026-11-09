import { Provider } from "@opencode/schema/provider"
import { Location } from "@opencode/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ProviderNotFoundError, ServiceUnavailableError } from "../errors.js"
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
  .add(
    HttpApiEndpoint.get("provider.list", "/api/provider", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Provider.Info)),
      error: ServiceUnavailableError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "provider.list",
          summary: "List providers",
          description: "Retrieve active AI providers so clients can show provider availability and configuration.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("provider.get", "/api/provider/:providerID", {
      params: { providerID: Provider.ID },
      query: LocationQuery,
      success: Location.response(Provider.Info),
      error: [ProviderNotFoundError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "provider.get",
          summary: "Get provider",
          description: "Retrieve a single AI provider so clients can inspect its availability and endpoint settings.",
        }),
      ),
  )
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
      description: "Experimental provider routes.",
    }),
  )
