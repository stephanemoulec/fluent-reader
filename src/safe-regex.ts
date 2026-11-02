import { RE2JS } from "re2js"

// Search patterns and rules can come from anywhere, including imported backups. Share
// one linear-time engine across SQL, rules, validation and highlighting, and never
// fall back to JavaScript's backtracking engine for unsupported expressions.
const MAX_PATTERN_LENGTH = 4096
const MAX_CACHED = 64
const cache = new Map<string, RE2JS>()

export function compileRegex(pattern: string, flags: "" | "i" = "") {
    if (pattern.length > MAX_PATTERN_LENGTH)
        throw new Error("Regular expression is too long")
    const key = flags + pattern
    let compiled = cache.get(key)
    if (!compiled) {
        compiled = RE2JS.compile(
            RE2JS.translateRegExp(pattern),
            flags === "i" ? RE2JS.CASE_INSENSITIVE : 0
        )
        if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value)
        cache.set(key, compiled)
    }
    return {
        test: (text: string) => compiled.matcher(text ?? "").find(),
        matcher: (text: string) => compiled.matcher(text ?? ""),
    }
}
