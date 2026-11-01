import type { ThumbnailRequest, ThumbnailResponse } from "./thumbnail-worker"

type RequestBody =
    | { type: "get"; url: string }
    | { type: "size" }
    | { type: "clear" }

type Entry = { refs: number; image: Promise<string> }

const entries = new Map<string, Entry>()
const pending = new Map<
    number,
    { resolve: (result: Blob | number) => void; reject: () => void }
>()
let worker: Worker = null
let workerFailed = false
let nextId = 0

function getWorker() {
    if (!worker) {
        worker = new Worker(new URL("./thumbnail-worker.ts", import.meta.url))
        worker.onmessage = (event: MessageEvent<ThumbnailResponse>) => {
            const { id, result, failed } = event.data
            const request = pending.get(id)
            pending.delete(id)
            if (failed) request?.reject()
            else request?.resolve(result)
        }
        worker.onerror = () => {
            workerFailed = true
            for (const request of pending.values()) request.reject()
            pending.clear()
        }
    }
    return worker
}

function request(body: RequestBody) {
    return new Promise<Blob | number>((resolve, reject) => {
        if (workerFailed) return reject()
        const id = nextId++
        pending.set(id, { resolve, reject })
        getWorker().postMessage({ id, ...body } as ThumbnailRequest)
    })
}

// Resolves to a small copy of the image, or the original if it can't be made.
export function acquireThumbnail(src: string) {
    let entry = entries.get(src)
    if (!entry) {
        entry = {
            refs: 0,
            image: request({ type: "get", url: src }).then(
                blob => URL.createObjectURL(blob as Blob),
                () => src
            ),
        }
        entries.set(src, entry)
    }
    entry.refs += 1
    return entry.image
}

export function releaseThumbnail(src: string) {
    const entry = entries.get(src)
    if (!entry || --entry.refs > 0) return
    entries.delete(src)
    entry.image.then(image => {
        if (image !== src) URL.revokeObjectURL(image)
    })
}

export function getThumbnailCacheSize() {
    return request({ type: "size" }).then(
        size => size as number,
        () => 0
    )
}

export function clearThumbnailCache() {
    return request({ type: "clear" }).catch(() => {})
}
