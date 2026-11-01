import type { StoredRules } from "./schema-types"

export function transformLovefieldRules(
    sources: Record<string, unknown>[]
): StoredRules {
    const storedRules: StoredRules = {}
    for (const source of sources) {
        const rules = source.rules as Record<string, unknown>[] | undefined
        if (!Array.isArray(rules) || rules.length === 0) continue
        storedRules[`source:${source.sid as number}`] = rules.map(rule => {
            const filter = rule.filter as Record<string, unknown>
            const actions = rule.actions as Record<string, boolean>
            return {
                filter: (filter?.type as number) ?? 0,
                search: (filter?.search as string) ?? "",
                match: rule.match as boolean,
                actions: Object.entries(actions || {}).map(
                    ([type, flag]) => `${type}-${flag}`
                ),
            }
        })
    }
    return storedRules
}
