import { Provider } from "@opencode/core/provider"
import { ProviderDiscovery } from "@opencode/core/provider-discovery"
import { ProviderNotFoundError, ServiceUnavailableError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "provider.list",
        Effect.fn(function* () {
          const providers = yield* Provider.Service
          return yield* response(providers.available())
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const providers = yield* Provider.Service
          const provider = yield* providers.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
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
