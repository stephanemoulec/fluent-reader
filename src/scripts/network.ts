// Keep the deadline active until the response body has been consumed.
export const FEED_TIMEOUT_MS = 30_000
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024

export async function fetchWithDeadline<T>(
    url: string,
    consume: (response: Response) => Promise<T>,
    options: RequestInit = {},
    timeout = FEED_TIMEOUT_MS
): Promise<T> {
    const controller = new AbortController()
    const abort = () => controller.abort(options.signal?.reason)
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener("abort", abort, { once: true })
    const timer = setTimeout(
        () => controller.abort(new Error("Request timed out")),
        timeout
    )
    try {
        return await consume(
            await fetch(url, { ...options, signal: controller.signal })
        )
    } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener("abort", abort)
        controller.abort()
    }
}

export async function readBoundedResponse(
    response: Response,
    maxBytes = MAX_RESPONSE_BYTES
): Promise<ArrayBuffer> {
    const reader = response.body?.getReader()
    if (!reader) return new ArrayBuffer(0)
    try {
        if (Number(response.headers.get("content-length")) > maxBytes)
            throw new Error("Response exceeds the size limit")
        const chunks: Uint8Array[] = []
        let size = 0
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > maxBytes)
                throw new Error("Response exceeds the size limit")
            chunks.push(value)
        }
        const result = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
            result.set(chunk, offset)
            offset += chunk.byteLength
        }
        return result.buffer
    } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
    }
}

export async function forEachConcurrent<T>(
    values: T[],
    concurrency: number,
    run: (value: T) => Promise<void>
) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new Error("Invalid concurrency")
    let next = 0
    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, values.length) },
            async () => {
                while (next < values.length) await run(values[next++])
            }
        )
    )
}
