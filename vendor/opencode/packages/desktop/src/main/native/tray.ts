import { app, Menu, nativeImage, Tray, type BrowserWindow } from "electron"
import path from "node:path"

let tray: Tray | null = null

export function createTray(getWindow: () => BrowserWindow | null) {
  if (tray) return tray

  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), "resources/icons/32x32.png"))

  tray = new Tray(icon)
  tray.setToolTip("Aero Code")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示主窗口",
        click: () => {
          const win = getWindow()
          win?.show()
          win?.focus()
        },
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]),
  )
  tray.on("click", () => {
    const win = getWindow()
    if (!win) return
    if (win.isVisible()) win.hide()
    else {
      win.show()
      win.focus()
    }
  })

  return tray
}

export function destroyTray() {
  tray?.destroy()
  tray = null
}
