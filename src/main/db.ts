import { app, ipcMain, dialog, nativeTheme } from "electron"
import { Worker } from "node:worker_threads"
import * as path from "node:path"
import type Store from "electron-store"
import { SchemaTypes, ThemeSettings } from "../schema-types"
import { WindowManager } from "./window"
import { clearServiceCredentials } from "./settings"
import performUpdate from "./update-scripts"
import type { DatabaseQuery, RestoreDialogTexts } from "../bridges/db"

export function initDB(
    store: Store<SchemaTypes>,
    manager: WindowManager,
    restart: () => void
): void {
    const worker = new Worker(path.join(__dirname, "db-worker.js"), {
        workerData: {
            dbPath: path.join(path.dirname(store.path), "fluent-reader.db"),
        },
    })
    let nextId = 0
    let workerError: Error
    let closing = false
    let backupBusy = false
    const pending = new Map<
        number,
        { resolve: (result: any) => void; reject: (err: Error) => void }
    >()
    const fail = (error: Error) => {
        workerError = error
        for (const request of pending.values()) request.reject(error)
        pending.clear()
    }
    worker.on("error", fail)
    worker.on("exit", code =>
        fail(new Error(`Database worker exited (${code})`))
    )
    worker.on("message", ({ id, result, error }) => {
        const request = pending.get(id)
        if (!request) return
        pending.delete(id)
        if (error) request.reject(new Error(error))
        else request.resolve(result)
    })
    const request = (operation: string, ...args: unknown[]): Promise<any> => {
        if (workerError) return Promise.reject(workerError)
        return new Promise((resolve, reject) => {
            const id = nextId++
            pending.set(id, { resolve, reject })
            try {
                worker.postMessage({ id, operation, args })
            } catch (err) {
                pending.delete(id)
                reject(err)
            }
        })
    }
    // Queue the close behind committed writes before allowing Electron to quit.
    app.on("before-quit", event => {
        if (closing) return
        event.preventDefault()
        closing = true
        request("close")
            .catch(console.error)
            .finally(() => {
                worker.terminate().finally(() => app.quit())
            })
    })
    ipcMain.handle(
        "db:execute",
        (_, sql: string, params: unknown[], method: DatabaseQuery["method"]) =>
            request("execute", { sql, params, method })
    )
    ipcMain.handle("db:batch", (_, queries: DatabaseQuery[]) =>
        request("batch", queries)
    )

    ipcMain.handle("db-export-all", async () => {
        if (!manager.hasWindow() || backupBusy) return
        backupBusy = true
        try {
            const result = await dialog.showSaveDialog(manager.mainWindow, {
                defaultPath: "Fluent_Reader_Backup.frdata",
                filters: [
                    { name: "Fluent Reader Data", extensions: ["frdata"] },
                ],
            })
            if (result.canceled) return
            // Credentials are device-bound and deliberately absent from portable backups.
            const { serviceConfigs, encryptedServiceConfigs, ...settings } =
                store.store
            await request("export", result.filePath, settings)
        } catch (err) {
            dialog.showErrorBox("Export Error", String(err))
        } finally {
            backupBusy = false
        }
    })
    ipcMain.handle("db-import-all", async (_, texts: RestoreDialogTexts) => {
        if (!manager.hasWindow() || backupBusy) return true
        backupBusy = true
        try {
            const result = await dialog.showOpenDialog(manager.mainWindow, {
                filters: [
                    {
                        name: "Fluent Reader Data",
                        extensions: ["frdata", "json"],
                    },
                ],
                properties: ["openFile"],
            })
            if (result.canceled || !result.filePaths.length) return true
            const confirmed = await dialog.showMessageBox(manager.mainWindow, {
                type: "warning",
                title: texts.title,
                message: texts.title,
                detail: texts.message,
                buttons: [texts.cancel, texts.confirm],
                defaultId: 0,
                cancelId: 0,
            })
            if (confirmed.response !== 1) return true
            const settings = await request("import", result.filePaths[0])
            // Persist settings once, rather than synchronously rewriting for each key.
            clearServiceCredentials()
            store.store = settings
            performUpdate(store)
            nativeTheme.themeSource = store.get("theme", ThemeSettings.Default)
            restart()
            return false
        } catch (err) {
            dialog.showErrorBox("Import Error", String(err))
            return true
        } finally {
            backupBusy = false
        }
    })
}
