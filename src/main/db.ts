import { app, dialog, nativeTheme } from "electron"
import { Worker } from "node:worker_threads"
import * as path from "node:path"
import type Store from "electron-store"
import type { SchemaTypes } from "../schema-types"
import { SyncService, ThemeSettings } from "../schema-types"
import { WindowManager } from "./window"
import { handleIpc } from "./ipc"
import { getServiceConfigs, stripServiceSecrets } from "./settings"
import performUpdate from "./update-scripts"
import type {
    DatabaseQuery,
    ExportDialogTexts,
    RestoreDialogTexts,
} from "../bridges/db"

const CLOSE_TIMEOUT = 5000

export function initDB(
    store: Store<SchemaTypes>,
    manager: WindowManager,
    restart: () => void
): void {
    // Migration and query failures reach the renderer as rejected requests, which
    // already reports them during startup.
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
        // Exiting follows a startup error, and the first one has the real cause.
        workerError = workerError || error
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
            worker.postMessage({ id, operation, args })
        })
    }

    // Queue the close behind committed writes, but don't let a long export hold up quitting.
    app.on("before-quit", event => {
        if (closing) return
        event.preventDefault()
        closing = true
        Promise.race([
            request("close").catch(console.error),
            new Promise(resolve => setTimeout(resolve, CLOSE_TIMEOUT)),
        ]).finally(() => {
            // Terminating waits for a running query, so it can't come first.
            worker.terminate()
            app.quit()
        })
    })

    handleIpc(
        "db:execute",
        (_, sql: string, params: unknown[], method: DatabaseQuery["method"]) =>
            request("execute", { sql, params, method })
    )
    handleIpc("db:batch", (_, queries: DatabaseQuery[]) =>
        request("batch", queries)
    )

    handleIpc("db-export-all", async (_, texts: ExportDialogTexts) => {
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
            let serviceConfigs = getServiceConfigs()
            if (serviceConfigs.type !== SyncService.None) {
                const { response } = await dialog.showMessageBox(
                    manager.mainWindow,
                    {
                        type: "warning",
                        title: texts.title,
                        message: texts.title,
                        detail: texts.message,
                        buttons: [texts.exclude, texts.include],
                        defaultId: 0,
                        cancelId: 0,
                    }
                )
                if (response !== 1)
                    serviceConfigs = stripServiceSecrets(serviceConfigs)
            }
            // The encrypted form only opens on this machine, so backups never carry it.
            const { serviceConfigsEncrypted: _encrypted, ...settings } =
                store.store
            await request("export", result.filePath, {
                ...settings,
                serviceConfigs,
            })
        } catch (err) {
            dialog.showErrorBox("Export Error", String(err))
        } finally {
            backupBusy = false
        }
    })

    handleIpc("db-import-all", async (_, texts: RestoreDialogTexts) => {
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
            if (result.canceled || result.filePaths.length === 0) return true
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
            // Persist settings once, rather than synchronously rewriting for each key.
            store.store = await request("import", result.filePaths[0])
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
