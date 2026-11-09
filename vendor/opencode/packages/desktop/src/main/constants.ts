import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "Aero Code Dev",
  beta: "Aero Code Beta",
  prod: "Aero Code",
}

const appIDs: Record<string, string> = {
  dev: "com.Aero.code.dev",
  beta: "com.Aero.code.beta",
  prod: "com.Aero.code",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : appNames.dev

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : appIDs.dev
