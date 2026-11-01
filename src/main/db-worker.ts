import { gt } from "drizzle-orm"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { parentPort, workerData } from "node:worker_threads"
import * as fs from "node:fs"
import * as path from "node:path"
import { randomUUID } from "node:crypto"
import { sourcesTable, itemsTable } from "../db/schema"
import * as schema from "../db/schema"
import type { StoredRules } from "../schema-types"
import { getValidDate } from "../scripts/date"
import { transformLovefieldRules } from "../rules-migration"
import { compileRegex } from "../safe-regex"
import type { DatabaseQuery, DatabaseResult } from "../bridges/db"

const sqlite = new Database(workerData.dbPath)
const db = drizzle(sqlite, { schema })
function optimizeDB() {
    try {
        sqlite.pragma("optimize")
    } catch (err) {
        console.warn("SQLite optimize error:", err)
    }
}
for (const [name, flags] of [
    ["regexp", ""],
    ["regexpi", "i"],
]) {
    sqlite.function(
        name,
        { deterministic: true },
        (pattern: string, value: string) => {
            try {
                return Number(compileRegex(pattern, flags).test(value ?? ""))
            } catch {
                return 0
            }
        }
    )
}
migrate(db, { migrationsFolder: path.join(__dirname, "drizzle") })
try {
    sqlite.pragma("optimize=0x10002")
} catch (err) {
    console.warn("SQLite optimize error:", err)
}
const optimizeTimer = setInterval(optimizeDB, 24 * 60 * 60 * 1000)
optimizeTimer.unref()

function executeQuery({ sql, params, method }: DatabaseQuery): DatabaseResult {
    const stmt = sqlite.prepare(sql)
    if (method === "run") {
        const result = stmt.run(params)
        return [result.changes, Number(result.lastInsertRowid)]
    }
    const convert = (row: unknown[]) =>
        row?.map(value => (typeof value === "bigint" ? Number(value) : value))
    stmt.raw()
    if (method === "get") return convert(stmt.get(params) as unknown[])
    return (stmt.all(params) as unknown[][]).map(convert)
}
const executeBatch = sqlite.transaction((queries: DatabaseQuery[]) =>
    queries.map(executeQuery)
)

// Write rows incrementally to a private temporary file, then replace the destination.
function exportAll(filePath: string, settings: Record<string, unknown>) {
    const tempPath = path.join(
        path.dirname(filePath),
        `.fluent-reader-${randomUUID()}.tmp`
    )
    let fd: number
    try {
        fd = fs.openSync(tempPath, "wx", 0o600)
        const write = (text: string) => fs.writeFileSync(fd, text)
        sqlite.transaction(() => {
            const {
                serviceConfigs,
                encryptedServiceConfigs,
                ...portableSettings
            } = settings
            write(
                JSON.stringify(portableSettings).slice(0, -1) +
                    (Object.keys(portableSettings).length ? "," : "") +
                    '"sqlite":{"sources":['
            )
            let separator = ""
            let lastSource: number
            while (true) {
                const rows = db
                    .select()
                    .from(sourcesTable)
                    .where(
                        lastSource === undefined
                            ? undefined
                            : gt(sourcesTable.sid, lastSource)
                    )
                    .orderBy(sourcesTable.sid)
                    .limit(100)
                    .all()
                if (!rows.length) break
                for (const row of rows) {
                    write(separator + JSON.stringify(row))
                    separator = ","
                }
                lastSource = rows[rows.length - 1].sid
            }
            write('],"items":[')
            separator = ""
            let lastItem: number
            while (true) {
                const rows = db
                    .select()
                    .from(itemsTable)
                    .where(
                        lastItem === undefined
                            ? undefined
                            : gt(itemsTable._id, lastItem)
                    )
                    .orderBy(itemsTable._id)
                    .limit(100)
                    .all()
                if (!rows.length) break
                for (const row of rows) {
                    write(separator + JSON.stringify(row))
                    separator = ","
                }
                lastItem = rows[rows.length - 1]._id
            }
            write("]}}")
        })()
        fs.closeSync(fd)
        fd = undefined
        fs.renameSync(tempPath, filePath)
    } finally {
        if (fd !== undefined) fs.closeSync(fd)
        fs.rmSync(tempPath, { force: true })
    }
}

function importAll(filePath: string) {
    const configs = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    if (!configs || typeof configs !== "object" || Array.isArray(configs))
        throw new Error("Unrecognized backup format.")
    type InsertSource = typeof sourcesTable.$inferInsert
    type InsertItem = typeof itemsTable.$inferInsert

    let rawSources: Record<string, unknown>[] = []
    let rawItems: Record<string, unknown>[] = []
    let storedRules: StoredRules = {}
    const restoreDate = new Date()

    const mapSource = (s: Record<string, unknown>): InsertSource => ({
        sid: s.sid as number,
        url: s.url as string,
        iconurl: (s.iconurl as string) || null,
        name: s.name as string,
        openTarget: (s.openTarget as number) || 0,
        lastFetched: getValidDate(s.lastFetched, new Date(0)),
        serviceRef: (s.serviceRef as string) || null,
        fetchFrequency: (s.fetchFrequency as number) || 0,
        textDir: (s.textDir as number) || 0,
        hidden: Boolean(s.hidden),
    })

    const mapItem = (i: Record<string, unknown>): InsertItem => {
        const fetchedDate = getValidDate(i.fetchedDate, i.date, restoreDate)
        return {
            _id: i._id as number,
            source: i.source as number,
            guid: typeof i.guid === "string" && i.guid.trim() ? i.guid : null,
            title: (i.title as string) || "",
            link: (i.link as string) || "",
            date: getValidDate(i.date, fetchedDate),
            fetchedDate,
            thumb: (i.thumb as string) || null,
            content: (i.content as string) || "",
            snippet: (i.snippet as string) || "",
            creator: (i.creator as string) || null,
            hasRead: Boolean(i.hasRead),
            starred: Boolean(i.starred),
            hidden: Boolean(i.hidden),
            notify: Boolean(i.notify),
            serviceRef: (i.serviceRef as string) || null,
        }
    }

    if (configs.sqlite) {
        const sqliteData = configs.sqlite as {
            sources?: Record<string, unknown>[]
            items?: Record<string, unknown>[]
        }
        rawSources = sqliteData.sources || []
        rawItems = sqliteData.items || []
        storedRules = (configs.sourceRules as StoredRules) || {}
    } else if (configs.lovefield) {
        const lfData = configs.lovefield as {
            sources?: Record<string, unknown>[]
            items?: Record<string, unknown>[]
        }
        rawSources = lfData.sources || []
        rawItems = lfData.items || []

        storedRules = transformLovefieldRules(rawSources)
    } else {
        throw new Error("Unrecognized backup format.")
    }

    db.transaction(tx => {
        tx.delete(itemsTable).run()
        tx.delete(sourcesTable).run()
        for (let i = 0; i < rawSources.length; i += 50) {
            tx.insert(sourcesTable)
                .values(rawSources.slice(i, i + 50).map(mapSource))
                .run()
        }
        for (let i = 0; i < rawItems.length; i += 50) {
            tx.insert(itemsTable)
                .values(rawItems.slice(i, i + 50).map(mapItem))
                .run()
        }
    })
    optimizeDB()

    const {
        sqlite: ignoredSQLite,
        lovefield,
        nedb,
        useNeDB,
        serviceConfigs,
        encryptedServiceConfigs,
        ...settings
    } = configs
    return { ...settings, sourceRules: storedRules, dbVersion: "sqlite" }
}

parentPort.on("message", ({ id, operation, args }) => {
    try {
        let result: unknown
        switch (operation) {
            case "execute":
                result = executeQuery(args[0])
                break
            case "batch":
                result = executeBatch(args[0])
                optimizeDB()
                break
            case "export":
                exportAll(args[0], args[1])
                break
            case "import":
                result = importAll(args[0])
                break
            case "close":
                optimizeDB()
                sqlite.close()
                clearInterval(optimizeTimer)
                break
            default:
                throw new Error("Unknown database operation")
        }
        parentPort.postMessage({ id, result })
    } catch (err) {
        parentPort.postMessage({ id, error: String(err) })
    }
})
