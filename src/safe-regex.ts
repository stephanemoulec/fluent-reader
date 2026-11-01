import { RE2JS } from "re2js"

// Share one engine across SQL, rules, validation and highlighting. Never fall back
// to JavaScript's backtracking engine for unsupported expressions.
const cache = new Map<string, RE2JS>()
export function compileRegex(pattern: string, flags = "") {
    if (pattern.length > 4096) throw new Error("Regular expression is too long")
    if (/[^ig]/.test(flags))
        throw new Error("Unsupported regular expression flag")
    const key = JSON.stringify([pattern, flags.includes("i")])
    let compiled = cache.get(key)
    if (!compiled) {
        compiled = RE2JS.compile(
            RE2JS.translateRegExp(pattern),
            flags.includes("i") ? RE2JS.CASE_INSENSITIVE : 0
        )
        if (cache.size >= 64) cache.delete(cache.keys().next().value)
        cache.set(key, compiled)
    }
    return {
        test: (text: string) => compiled.matcher(text).find(),
        matcher: (text: string) => compiled.matcher(text),
    }
}
