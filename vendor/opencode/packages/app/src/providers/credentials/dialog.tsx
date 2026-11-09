import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { useMutation } from "@tanstack/solid-query"
import { TextField } from "@opencode/ui/text-field"
import { showToast } from "@/shell/notifications/toast"
import { batch, createMemo, For, onMount, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { ExternalLink } from "@/runtime/platform/external-link"
import { useServerSDK } from "@/runtime/server/client"
import { useData, useServer } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
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
import { CustomManagedProviderIcon } from "@/providers/models/provider-group"

type FetchedModel = {
  id: string
  name: string
}

const MODELS_MODES = [
  { id: "vendor", labelKey: "provider.custom.models.vendor" },
  { id: "picked", labelKey: "provider.custom.models.picked" },
  { id: "usage", labelKey: "provider.custom.models.usage" },
] as const

export function CustomProviderForm(props: { autofocus?: boolean; editProviderID?: string; hideTitle?: boolean } = {}) {
  const dialog = useDialog()
  const data = useData()
  const server = useServer()
  const serverSDK = useServerSDK()
  const language = useLanguage()
  let existingProviderConfig: Record<string, unknown> | undefined

  const [form, setForm] = createStore<FormState>({
    providerID: "",
    name: "",
    baseURL: "",
    apiKey: "",
    apiMode: "openai",
    modelsMode: "vendor",
    models: [modelRow()],
    headers: [headerRow()],
    err: {},
  })

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

  onMount(() => {
    if (!props.editProviderID) return
    void serverSDK.api.config
      .get({})
      .then((entries) => {
        const config = entries.findLast(
          (entry) => entry.type === "document" && entry.info.providers?.[props.editProviderID!] !== undefined,
        )
        if (!config || config.type !== "document")
          throw new Error(`Provider configuration not found: ${props.editProviderID}`)
        const provider = config.info.providers?.[props.editProviderID!]
        if (!provider) throw new Error(`Provider configuration not found: ${props.editProviderID}`)
        const info = provider as unknown as {
          name?: string
          package?: string
          npm?: string
          settings?: { baseURL?: string; apiKey?: string; headers?: Record<string, string> }
          options?: { baseURL?: string; apiKey?: string; headers?: Record<string, string> }
          headers?: Record<string, string>
          models?: Record<string, { name?: string }>
        }
        existingProviderConfig = provider as unknown as Record<string, unknown>
        const packageName = info.package ?? info.npm
        const apiMode = API_MODES.find((mode) => !!mode.package && mode.package === packageName)?.id ?? "openai"
        const settings = info.settings ?? info.options
        setForm({
          providerID: props.editProviderID,
          name: info.name ?? props.editProviderID,
          baseURL: String(settings?.baseURL ?? ""),
          apiKey: String(settings?.apiKey ?? ""),
          apiMode,
          modelsMode: "picked",
          models: Object.entries(info.models ?? {}).map(([id, model]) => ({
            row: `model-${id}`,
            id,
            name: model.name ?? id,
            err: {},
          })),
          headers: Object.entries(info.headers ?? settings?.headers ?? {}).map(([key, value]) => ({
            row: `header-${key}`,
            key,
            value,
            err: {},
          })),
        })
      })
      .catch((err) => showToast({ title: language.t("common.requestFailed"), description: String(err) }))
  })

  const addModel = () => {
    setForm(
      "models",
      produce((rows) => {
        rows.push(modelRow())
      }),
    )
  }

  const removeModel = (index: number) => {
    if (form.models.length <= 1) return
    setForm(
      "models",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

  const addHeader = () => {
    setForm(
      "headers",
      produce((rows) => {
        rows.push(headerRow())
      }),
    )
  }

  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm(
      "headers",
      produce((rows) => {
        rows.splice(index, 1)
      }),
    )
  }

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

  const setModel = (index: number, key: "id" | "name", value: string) => {
    batch(() => {
      setForm("models", index, key, value)
      setForm("models", index, "err", key, undefined)
    })
  }

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    batch(() => {
      setForm("headers", index, key, value)
      setForm("headers", index, "err", key, undefined)
    })
  }

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
    if (!/^https?:\/\//.test(baseURL)) {
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
    const output = validateCustomProvider({
      form,
      t: language.t,
      // TODO: Restore disabled-provider validation when V2 exposes config reads.
      disabledProviders: [],
      existingProviderIDs: new Set(
        (data.location.provider.list() ?? [])
          .map((provider) => provider.id)
          .filter((id) => id !== props.editProviderID),
      ),
    })

    batch(() => {
      setForm("err", output.err)
      output.models.forEach((err, index) => setForm("models", index, "err", err))
      output.headers.forEach((err, index) => setForm("headers", index, "err", err))
    })

    return output.result
  }

  const saveMutation = useMutation(() => ({
    mutationFn: async (result: NonNullable<ReturnType<typeof validate>>): Promise<typeof result> => {
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
      return result
    },
    onSuccess: (result) => {
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.connect.toast.connected.title", { provider: result.name }),
        description: language.t("provider.connect.toast.connected.description", { provider: result.name }),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const save = (e: SubmitEvent) => {
    e.preventDefault()

    if (saveMutation.isPending || form.apiMode === "system-one") return

    const result = validate()

    if (!result) return
    saveMutation.mutate(result)
  }

  return (
    <div class="flex flex-col gap-6 px-2.5 pb-3 overflow-y-auto max-h-[60vh]">
      <Show when={!props.hideTitle}>
        <div class="px-2.5 flex gap-4 items-center">
          <CustomManagedProviderIcon class="size-5 shrink-0" />
          <div class="text-16-medium text-text-strong">{language.t("provider.custom.title")}</div>
        </div>
      </Show>

      <form onSubmit={save} class="px-2.5 pb-6 flex flex-col gap-6">
        <p class="text-14-regular text-text-base">
          {language.t("provider.custom.description.prefix")}
          <ExternalLink href="https://wiki.aero-code.internal/dev/ai-assistant" tabIndex={-1}>
            {language.t("provider.custom.description.link")}
          </ExternalLink>
          {language.t("provider.custom.description.suffix")}
        </p>

        <div class="grid grid-cols-2 gap-4">
          <TextField
            autofocus={props.autofocus ?? true}
            label={language.t("provider.custom.field.providerID.label")}
            placeholder={language.t("provider.custom.field.providerID.placeholder")}
            description={language.t("provider.custom.field.providerID.description")}
            value={form.providerID}
            onChange={(v) => setField("providerID", v)}
            readOnly={!!props.editProviderID}
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

        <Button
          class="w-auto self-start"
          type="submit"
          size="large"
          variant="contrast"
          disabled={saveMutation.isPending || form.apiMode === "system-one"}
        >
          {saveMutation.isPending ? language.t("common.saving") : language.t("common.submit")}
        </Button>
      </form>
    </div>
  )
}
