import { ipcMain, shell, dialog, app, session, clipboard, net } from "electron"
import { WindowManager } from "./window"
import { handleIpc, handleIpcOnce, onIpc } from "./ipc"
import * as fs from "node:fs"
import { ImageCallbackTypes, LinkTarget, TouchBarTexts } from "../schema-types"
import { initMainTouchBar } from "./touchbar"
import { getDefaultBrowser, openInPrivateWindow } from "./private-window"
import { getLinkTarget } from "./settings"
import * as fontList from "font-list"

const webviewInputFocused = `(() => {
    let element = document.activeElement
    while (element?.shadowRoot?.activeElement) {
        element = element.shadowRoot.activeElement
    }
    return !!element && (
        element.matches("input, textarea, select, iframe, frame") || element.isContentEditable
    )
})()`

// Chromium's own limit on how long a click allows a page to open a popup.
const USER_INPUT_WINDOW = 5000
const USER_INPUT_EVENTS = new Set([
    "mouseDown",
    "rawKeyDown",
    "keyDown",
    "gestureTap",
])

const UPDATE_CHECK_TIMEOUT = 15000
const LATEST_RELEASE_API =
    "https://api.github.com/repos/yang991178/fluent-reader/releases/latest"

export function isNewerVersion(latest: string, current: string) {
    const parse = (version: string) =>
        version.replace(/^v/, "").split(".").map(Number)
    const [a, b] = [parse(latest), parse(current)]
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true
        if (a[i] < b[i]) return false
    }
    return false
}

async function checkForUpdate() {
    // Store builds update themselves, and dev builds have no release to compare.
    if (!app.isPackaged || process.windowsStore || process.mas) return null
    try {
        const response = await net.fetch(LATEST_RELEASE_API, {
            signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT),
        })
        if (!response.ok) return null
        const { tag_name: version, html_url: url } = await response.json()
        if (
            typeof version === "string" &&
            typeof url === "string" &&
            url.startsWith("https://github.com/") &&
            isNewerVersion(version, app.getVersion())
        ) {
            return { version, url }
        }
    } catch (err) {
        console.log(err)
    }
    return null
}

// Electron approves every permission request unless a session says otherwise.
const GUEST_PERMISSIONS = new Set(["fullscreen", "clipboard-sanitized-write"])

function isPermissionAllowed(
    contents: Electron.WebContents | null,
    permission: string
) {
    // Article notifications come from the app's own window, never from a guest.
    if (permission === "notifications") return contents?.getType() === "window"
    return GUEST_PERMISSIONS.has(permission)
}

export function setPermissionHandlers(target: Electron.Session) {
    target.setPermissionRequestHandler((contents, permission, callback) => {
        callback(isPermissionAllowed(contents, permission))
    })
    target.setPermissionCheckHandler((contents, permission) =>
        isPermissionAllowed(contents, permission)
    )
}

export function setUtilsListeners(manager: WindowManager) {
    setPermissionHandlers(session.defaultSession)
    setPermissionHandlers(session.fromPartition("sandbox"))

    async function openPrivate(url: string) {
        try {
            await openInPrivateWindow(url)
        } catch (err) {
            console.log(err)
            if (manager.hasWindow())
                manager.mainWindow.webContents.send("private-window-failed")
        }
    }

    async function openExternal(url: string, background = false) {
        if (url.startsWith("https://") || url.startsWith("http://")) {
            const isPrivate = getLinkTarget() === LinkTarget.Private
            if (background && process.platform === "darwin") {
                if (isPrivate) openPrivate(url)
                else shell.openExternal(url, { activate: false })
            } else if (background && manager.hasWindow()) {
                manager.mainWindow.setAlwaysOnTop(true)
                if (isPrivate) await openPrivate(url)
                else await shell.openExternal(url)
                setTimeout(() => manager.mainWindow.setAlwaysOnTop(false), 1000)
            } else if (isPrivate) {
                openPrivate(url)
            } else {
                shell.openExternal(url)
            }
        }
    }

    app.on("web-contents-created", (_, contents) => {
        // Guests may only reach the browser right after real input, once per input.
        let lastInput = 0
        contents.on("input-event", (_, input) => {
            if (USER_INPUT_EVENTS.has(input.type)) lastInput = Date.now()
        })
        const consumeInput = () => {
            const allowed = Date.now() - lastInput < USER_INPUT_WINDOW
            lastInput = 0
            return allowed
        }
        contents.setWindowOpenHandler(details => {
            if (contents.getType() === "webview" && consumeInput())
                openExternal(
                    details.url,
                    details.disposition === "background-tab"
                )
            return {
                action: manager.hasWindow() ? "deny" : "allow",
            }
        })
        contents.on("will-navigate", (event, url) => {
            event.preventDefault()
            if (contents.getType() === "webview" && consumeInput())
                openExternal(url)
        })
    })

    onIpc("get-version", event => {
        event.returnValue = app.getVersion()
    })

    handleIpc("open-external", (_, url: string, background: boolean) => {
        openExternal(url, background)
    })

    handleIpc("can-open-private-window", async () => {
        return (await getDefaultBrowser()) !== null
    })

    handleIpc("show-error-box", async (_, title, content, copy?: string) => {
        if (manager.hasWindow() && copy != null) {
            const response = await dialog.showMessageBox(manager.mainWindow, {
                type: "error",
                title: title,
                message: title,
                detail: content,
                buttons: ["OK", copy],
                cancelId: 0,
                defaultId: 0,
            })
            if (response.response === 1) {
                clipboard.writeText(`${title}: ${content}`)
            }
        } else {
            dialog.showErrorBox(title, content)
        }
    })

    handleIpc(
        "show-message-box",
        async (_, title, message, confirm, cancel, defaultCancel, type) => {
            if (manager.hasWindow()) {
                let response = await dialog.showMessageBox(manager.mainWindow, {
                    type: type,
                    title: title,
                    message: title,
                    detail: message,
                    buttons:
                        process.platform === "win32"
                            ? ["Yes", "No"]
                            : [confirm, cancel],
                    cancelId: 1,
                    defaultId: defaultCancel ? 1 : 0,
                })
                return response.response === 0
            } else {
                return false
            }
        }
    )

    handleIpc(
        "show-save-dialog",
        async (_, filters: Electron.FileFilter[], path: string) => {
            ipcMain.removeAllListeners("write-save-result")
            if (manager.hasWindow()) {
                let response = await dialog.showSaveDialog(manager.mainWindow, {
                    defaultPath: path,
                    filters: filters,
                })
                if (!response.canceled) {
                    handleIpcOnce("write-save-result", (_, result, errmsg) => {
                        fs.writeFile(response.filePath, result, err => {
                            if (err) dialog.showErrorBox(errmsg, String(err))
                        })
                    })
                    return true
                }
            }
            return false
        }
    )

    handleIpc("show-open-dialog", async (_, filters: Electron.FileFilter[]) => {
        if (manager.hasWindow()) {
            let response = await dialog.showOpenDialog(manager.mainWindow, {
                filters: filters,
                properties: ["openFile"],
            })
            if (!response.canceled) {
                try {
                    return await fs.promises.readFile(
                        response.filePaths[0],
                        "utf-8"
                    )
                } catch (err) {
                    console.log(err)
                }
            }
        }
        return null
    })

    handleIpc("get-cache", async () => {
        return await session.defaultSession.getCacheSize()
    })

    handleIpc("clear-cache", async () => {
        await session.defaultSession.clearCache()
    })

    app.on("web-contents-created", (_, contents) => {
        if (contents.getType() === "webview") {
            contents.on(
                "did-fail-load",
                (event, code, desc, validated, isMainFrame) => {
                    if (isMainFrame && manager.hasWindow()) {
                        manager.mainWindow.webContents.send(
                            "webview-error",
                            desc
                        )
                    }
                }
            )
            contents.on("context-menu", (_, params) => {
                if (
                    (params.hasImageContents ||
                        params.selectionText ||
                        params.linkURL) &&
                    manager.hasWindow()
                ) {
                    if (params.hasImageContents) {
                        ipcMain.removeHandler("image-callback")
                        handleIpcOnce(
                            "image-callback",
                            (_, type: ImageCallbackTypes) => {
                                switch (type) {
                                    case ImageCallbackTypes.OpenExternal:
                                    case ImageCallbackTypes.OpenExternalBg:
                                        openExternal(
                                            params.srcURL,
                                            type ===
                                                ImageCallbackTypes.OpenExternalBg
                                        )
                                        break
                                    case ImageCallbackTypes.SaveAs:
                                        contents.session.downloadURL(
                                            params.srcURL
                                        )
                                        break
                                    case ImageCallbackTypes.Copy:
                                        contents.copyImageAt(params.x, params.y)
                                        break
                                    case ImageCallbackTypes.CopyLink:
                                        clipboard.writeText(params.srcURL)
                                        break
                                }
                            }
                        )
                        manager.mainWindow.webContents.send(
                            "webview-context-menu",
                            [params.x, params.y]
                        )
                    } else {
                        manager.mainWindow.webContents.send(
                            "webview-context-menu",
                            [params.x, params.y],
                            params.selectionText,
                            params.linkURL
                        )
                    }
                    contents
                        .executeJavaScript(
                            `new Promise(resolve => {
                        const dismiss = () => {
                            document.removeEventListener("mousedown", dismiss)
                            document.removeEventListener("scroll", dismiss)                            
                            resolve()
                        }
                        document.addEventListener("mousedown", dismiss)
                        document.addEventListener("scroll", dismiss)
                    })`
                        )
                        .then(() => {
                            if (manager.hasWindow()) {
                                manager.mainWindow.webContents.send(
                                    "webview-context-menu"
                                )
                            }
                        })
                }
            })
            contents.on("before-input-event", async (_, input) => {
                if (input.type !== "keyDown" || !manager.hasWindow()) return
                const mainWindow = manager.mainWindow
                const url = contents.getURL()
                if (url.startsWith("https://") || url.startsWith("http://")) {
                    // Inspect the guest's focused frame, including iframe editors.
                    // Leave the original key event alone so typing works normally.
                    // Electron can report no focused frame for a focused webview.
                    // An iframe host in the fallback document keeps its own keys.
                    const frame = contents.focusedFrame || contents.mainFrame
                    try {
                        const inputFocused = await frame.executeJavaScript(
                            webviewInputFocused
                        )
                        if (
                            inputFocused ||
                            contents.isDestroyed() ||
                            frame.isDestroyed() ||
                            contents.getURL() !== url
                        )
                            return
                    } catch {
                        // The frame may disappear while navigating or closing.
                        return
                    }
                }
                if (manager.hasWindow() && manager.mainWindow === mainWindow) {
                    mainWindow.webContents.send("webview-keydown", input)
                }
            })
        }
    })

    handleIpc("write-clipboard", (_, text) => {
        clipboard.writeText(text)
    })

    handleIpc("close-window", () => {
        if (manager.hasWindow()) manager.mainWindow.close()
    })

    handleIpc("minimize-window", () => {
        if (manager.hasWindow()) manager.mainWindow.minimize()
    })

    handleIpc("maximize-window", () => {
        manager.zoom()
    })

    onIpc("is-maximized", event => {
        event.returnValue =
            Boolean(manager.mainWindow) && manager.mainWindow.isMaximized()
    })

    onIpc("is-focused", event => {
        event.returnValue =
            manager.hasWindow() && manager.mainWindow.isFocused()
    })

    onIpc("is-fullscreen", event => {
        event.returnValue =
            manager.hasWindow() && manager.mainWindow.isFullScreen()
    })

    handleIpc("request-focus", () => {
        if (manager.hasWindow()) {
            const win = manager.mainWindow
            if (win.isMinimized()) win.restore()
            if (process.platform === "win32") {
                win.setAlwaysOnTop(true)
                win.setAlwaysOnTop(false)
            }
            win.focus()
        }
    })

    handleIpc("request-attention", () => {
        if (manager.hasWindow() && !manager.mainWindow.isFocused()) {
            if (process.platform === "win32") {
                manager.mainWindow.flashFrame(true)
                manager.mainWindow.once("focus", () => {
                    manager.mainWindow.flashFrame(false)
                })
            } else if (process.platform === "darwin") {
                app.dock.bounce()
            }
        }
    })

    handleIpc("touchbar-init", (_, texts: TouchBarTexts) => {
        if (manager.hasWindow()) initMainTouchBar(texts, manager.mainWindow)
    })
    handleIpc("touchbar-destroy", () => {
        if (manager.hasWindow()) manager.mainWindow.setTouchBar(null)
    })

    handleIpc("check-update", checkForUpdate)

    handleIpc("init-font-list", () => {
        return fontList.getFonts({
            disableQuoting: true,
        })
    })
}
