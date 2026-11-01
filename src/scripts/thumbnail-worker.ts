// Downloads and shrinks card images off the main thread, and keeps the results.
const DB_NAME = "thumbnails"
const STORE = "images"
const TIME_INDEX = "time"
const MAX_ENTRIES = 3000
const EVICT_COUNT = 300
// Enough for the largest card image, a 144px high cover on a 2x display.
const SHORT_SIDE = 320
const WEBP_QUALITY = 0.8
const MAX_DOWNLOADS = 4
const DOWNLOAD_TIMEOUT = 30000

export type ThumbnailRequest =
    | { id: number; type: "get"; url: string }
    | { id: number; type: "size" }
    | { id: number; type: "clear" }

export type ThumbnailResponse = {
    id: number
    result?: Blob | number
    failed?: boolean
}

type StoredThumbnail = { url: string; blob: Blob; time: number }

let dbPromise: Promise<IDBDatabase> = null

function openDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1)
            request.onupgradeneeded = () => {
                request.result
                    .createObjectStore(STORE, { keyPath: "url" })
                    .createIndex(TIME_INDEX, "time")
            }
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }
    return dbPromise
}

function asPromise<T>(request: IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function imageStore(mode: IDBTransactionMode) {
    const db = await openDB()
    return db.transaction(STORE, mode).objectStore(STORE)
}

async function readThumbnail(url: string) {
    const store = await imageStore("readonly")
    const stored: StoredThumbnail = await asPromise(store.get(url))
    return stored?.blob
}

async function writeThumbnail(url: string, blob: Blob) {
    const store = await imageStore("readwrite")
    await asPromise(store.put({ url, blob, time: Date.now() }))
    const count = await asPromise(store.count())
    if (count <= MAX_ENTRIES) return
    let evicted = 0
    const cursors = store.index(TIME_INDEX).openKeyCursor()
    cursors.onsuccess = () => {
        if (cursors.result && evicted++ < EVICT_COUNT) {
            store.delete(cursors.result.primaryKey)
            cursors.result.continue()
        }
    }
}

async function totalSize() {
    const store = await imageStore("readonly")
    return await new Promise<number>((resolve, reject) => {
        let size = 0
        const cursors = store.openCursor()
        cursors.onsuccess = () => {
            if (cursors.result) {
                size += (cursors.result.value as StoredThumbnail).blob.size
                cursors.result.continue()
            } else {
                resolve(size)
            }
        }
        cursors.onerror = () => reject(cursors.error)
    })
}

async function clearThumbnails() {
    const store = await imageStore("readwrite")
    await asPromise(store.clear())
}

async function createThumbnail(url: string) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Unsupported URL")
    const response = await fetch(url, {
        credentials: "omit",
        // The thumbnail replaces the original, so don't keep both on disk.
        cache: "no-store",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
    })
    if (!response.ok) throw new Error(`Status ${response.status}`)
    const original = await response.blob()
    const bitmap = await createImageBitmap(original)
    try {
        const { width, height } = bitmap
        const scale = SHORT_SIDE / Math.min(width, height)
        if (scale >= 1) return original
        const canvas = new OffscreenCanvas(
            Math.max(1, Math.round(width * scale)),
            Math.max(1, Math.round(height * scale))
        )
        const context = canvas.getContext("2d")
        context.imageSmoothingQuality = "high"
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        return await canvas.convertToBlob({
            type: "image/webp",
            quality: WEBP_QUALITY,
        })
    } finally {
        bitmap.close()
    }
}

type Download = {
    url: string
    resolve: (blob: Blob) => void
    reject: (reason: unknown) => void
}

const downloads: Download[] = []
let activeDownloads = 0

function pumpDownloads() {
    while (activeDownloads < MAX_DOWNLOADS && downloads.length > 0) {
        // The newest request is the card the user is looking at now.
        const { url, resolve, reject } = downloads.pop()
        activeDownloads += 1
        createThumbnail(url)
            .then(resolve, reject)
            .finally(() => {
                activeDownloads -= 1
                pumpDownloads()
            })
    }
}

async function getThumbnail(url: string) {
    const stored = await readThumbnail(url).catch((): Blob => undefined)
    if (stored) return stored
    const blob = await new Promise<Blob>((resolve, reject) => {
        downloads.push({ url, resolve, reject })
        pumpDownloads()
    })
    writeThumbnail(url, blob).catch(err => console.log(err))
    return blob
}

function handleRequest(request: ThumbnailRequest): Promise<Blob | number> {
    switch (request.type) {
        case "get":
            return getThumbnail(request.url)
        case "size":
            return totalSize()
        case "clear":
            return clearThumbnails().then(() => 0)
    }
}

self.onmessage = async (event: MessageEvent<ThumbnailRequest>) => {
    const { id } = event.data
    let response: ThumbnailResponse
    try {
        response = { id, result: await handleRequest(event.data) }
    } catch {
        response = { id, failed: true }
    }
    self.postMessage(response)
}
