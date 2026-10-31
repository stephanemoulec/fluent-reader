import { app, ipcMain, IpcMainEvent, IpcMainInvokeEvent } from "electron"
import * as path from "node:path"
import { pathToFileURL } from "node:url"

// Only the app's own top-level page may use the bridges. Guests have no preload
// today, so this guards against a future frame or window gaining IPC access.
function isAppFrame(event: IpcMainEvent | IpcMainInvokeEvent) {
    const frame = event.senderFrame
    if (!frame || frame.parent !== null) return false
    const page = path.join(
        app.getAppPath(),
        (app.isPackaged ? "dist/" : "") + "index.html"
    )
    return frame.url.split(/[?#]/)[0] === pathToFileURL(page).href
}

type InvokeListener = (event: IpcMainInvokeEvent, ...args: any[]) => unknown

function guardInvoke(
    channel: string,
    listener: InvokeListener
): InvokeListener {
    return (event, ...args) => {
        if (!isAppFrame(event)) {
            throw new Error(`Blocked IPC call to ${channel}`)
        }
        return listener(event, ...args)
    }
}

export function handleIpc(channel: string, listener: InvokeListener) {
    ipcMain.handle(channel, guardInvoke(channel, listener))
}

export function handleIpcOnce(channel: string, listener: InvokeListener) {
    ipcMain.handleOnce(channel, guardInvoke(channel, listener))
}

export function onIpc(
    channel: string,
    listener: (event: IpcMainEvent, ...args: any[]) => void
) {
    ipcMain.on(channel, (event, ...args) => {
        if (isAppFrame(event)) {
            listener(event, ...args)
        } else {
            // A sendSync caller would otherwise wait forever.
            event.returnValue = null
        }
    })
}
