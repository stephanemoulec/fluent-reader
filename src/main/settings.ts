import Store from "electron-store"
import {
    SchemaTypes,
    SourceGroup,
    ViewType,
    ThemeSettings,
    SearchEngines,
    LinkTarget,
    SyncService,
    ServiceConfigs,
    ViewConfigs,
    RuleTarget,
    StoredRule,
    getRuleTargetKey,
    ARTICLE_OVERLAY_MIN_WIDTH,
    LIST_VIEW_MIN_WIDTH,
} from "../schema-types"
import { session, nativeTheme, app, safeStorage } from "electron"
import { WindowManager } from "./window"
import { handleIpc, onIpc } from "./ipc"
import { transformLovefieldRules } from "./utils"

export const store = new Store<SchemaTypes>({ cache: true })

const GROUPS_STORE_KEY = "sourceGroups"
function nextGroupId(): number {
    const ids = store.get(GROUPS_STORE_KEY, []).map(group => group.gid)
    for (const key of Object.keys(store.get("sourceRules", {}))) {
        if (key.startsWith("group:")) ids.push(Number(key.slice(6)))
    }
    return Math.max(
        store.get("nextGroupId", 0),
        ...ids
            .filter(id => Number.isSafeInteger(id) && id >= 0)
            .map(id => id + 1)
    )
}

function allocateGroupId(): number {
    const gid = nextGroupId()
    store.set("nextGroupId", gid + 1)
    return gid
}

onIpc("allocate-group-id", event => {
    event.returnValue = allocateGroupId()
})
handleIpc("set-groups", (_, groups: SourceGroup[]) => {
    store.set(GROUPS_STORE_KEY, groups)
})
onIpc("get-groups", event => {
    const nextId = nextGroupId()
    if (store.get("nextGroupId", 0) < nextId) store.set("nextGroupId", nextId)
    const groups = store.get(GROUPS_STORE_KEY, []).map(group => ({ ...group }))
    const ids = new Set<number>()
    let changed = false
    for (const group of groups) {
        if (
            !Number.isSafeInteger(group.gid) ||
            group.gid < 0 ||
            ids.has(group.gid)
        ) {
            group.gid = allocateGroupId()
            changed = true
        }
        // Older renderers persisted the transient display index on some groups.
        if ("index" in group) {
            delete group.index
            changed = true
        }
        ids.add(group.gid)
    }
    if (changed) store.set(GROUPS_STORE_KEY, groups)
    event.returnValue = groups
})

const MENU_STORE_KEY = "menuOn"
onIpc("get-menu", event => {
    event.returnValue = store.get(MENU_STORE_KEY, true)
})
handleIpc("set-menu", (_, state: boolean) => {
    store.set(MENU_STORE_KEY, state)
})

const PAC_STORE_KEY = "pac"
const PAC_STATUS_KEY = "pacOn"
function getProxyStatus() {
    return store.get(PAC_STATUS_KEY, false)
}
function toggleProxyStatus() {
    store.set(PAC_STATUS_KEY, !getProxyStatus())
    setProxy()
}
function getProxy() {
    return store.get(PAC_STORE_KEY, "")
}
function setProxy(address = null) {
    if (!address) {
        address = getProxy()
    } else {
        store.set(PAC_STORE_KEY, address)
    }
    if (getProxyStatus()) {
        let rules = { pacScript: address }
        session.defaultSession.setProxy(rules)
        session.fromPartition("sandbox").setProxy(rules)
    }
}
onIpc("get-proxy-status", event => {
    event.returnValue = getProxyStatus()
})
onIpc("toggle-proxy-status", () => {
    toggleProxyStatus()
})
onIpc("get-proxy", event => {
    event.returnValue = getProxy()
})
handleIpc("set-proxy", (_, address = null) => {
    setProxy(address)
})

const VIEW_STORE_KEY = "view"
onIpc("get-view", event => {
    event.returnValue = store.get(VIEW_STORE_KEY, ViewType.List)
})
handleIpc("set-view", (_, viewType: ViewType) => {
    store.set(VIEW_STORE_KEY, viewType)
})

const THEME_STORE_KEY = "theme"
onIpc("get-theme", event => {
    event.returnValue = store.get(THEME_STORE_KEY, ThemeSettings.Default)
})
handleIpc("set-theme", (_, theme: ThemeSettings) => {
    store.set(THEME_STORE_KEY, theme)
    nativeTheme.themeSource = theme
})
onIpc("get-theme-dark-color", event => {
    event.returnValue = nativeTheme.shouldUseDarkColors
})
export function setThemeListener(manager: WindowManager) {
    nativeTheme.removeAllListeners()
    nativeTheme.on("updated", () => {
        if (manager.hasWindow()) {
            let contents = manager.mainWindow.webContents
            if (!contents.isDestroyed()) {
                contents.send("theme-updated", nativeTheme.shouldUseDarkColors)
            }
        }
    })
}

const LOCALE_STORE_KEY = "locale"
handleIpc("set-locale", (_, option: string) => {
    store.set(LOCALE_STORE_KEY, option)
})
function getLocaleSettings() {
    return store.get(LOCALE_STORE_KEY, "default")
}
onIpc("get-locale-settings", event => {
    event.returnValue = getLocaleSettings()
})
onIpc("get-locale", event => {
    let setting = getLocaleSettings()
    let locale = setting === "default" ? app.getLocale() : setting
    event.returnValue = locale
})

const FONT_SIZE_STORE_KEY = "fontSize"
onIpc("get-font-size", event => {
    event.returnValue = store.get(FONT_SIZE_STORE_KEY, 16)
})
handleIpc("set-font-size", (_, size: number) => {
    store.set(FONT_SIZE_STORE_KEY, size)
})

const FONT_STORE_KEY = "fontFamily"
onIpc("get-font", event => {
    event.returnValue = store.get(FONT_STORE_KEY, "")
})
handleIpc("set-font", (_, font: string) => {
    store.set(FONT_STORE_KEY, font)
})

for (const [key, channel, minimum] of [
    ["articleOverlayWidth", "article-overlay-width", ARTICLE_OVERLAY_MIN_WIDTH],
    ["listViewWidth", "list-view-width", LIST_VIEW_MIN_WIDTH],
] as const) {
    onIpc(`get-${channel}`, event => {
        const width = store.get(key, minimum)
        event.returnValue = Number.isFinite(width)
            ? Math.max(minimum, Math.round(width))
            : minimum
    })
    handleIpc(`set-${channel}`, (_, width: number) => {
        if (Number.isFinite(width) && width >= minimum) {
            store.set(key, Math.round(width))
        }
    })
}

const FETCH_INTEVAL_STORE_KEY = "fetchInterval"
onIpc("get-fetch-interval", event => {
    event.returnValue = store.get(FETCH_INTEVAL_STORE_KEY, 0)
})
handleIpc("set-fetch-interval", (_, interval: number) => {
    store.set(FETCH_INTEVAL_STORE_KEY, interval)
})

const SEARCH_ENGINE_STORE_KEY = "searchEngine"
onIpc("get-search-engine", event => {
    event.returnValue = store.get(SEARCH_ENGINE_STORE_KEY, SearchEngines.Google)
})
handleIpc("set-search-engine", (_, engine: SearchEngines) => {
    store.set(SEARCH_ENGINE_STORE_KEY, engine)
})

const LINK_TARGET_STORE_KEY = "linkTarget"
export function getLinkTarget() {
    return store.get(LINK_TARGET_STORE_KEY, LinkTarget.Normal)
}
onIpc("get-link-target", event => {
    event.returnValue = getLinkTarget()
})
handleIpc("set-link-target", (_, target: LinkTarget) => {
    store.set(LINK_TARGET_STORE_KEY, target)
})

const SERVICE_CONFIGS_STORE_KEY = "serviceConfigs"
const ENCRYPTED_CONFIGS_STORE_KEY = "serviceConfigsEncrypted"
const SERVICE_SECRET_FIELDS = [
    "password",
    "apiKey",
    "authKey",
    "auth",
    "inoreaderKey",
]

function canEncryptConfigs() {
    return (
        safeStorage.isEncryptionAvailable() &&
        // Linux falls back to a hardcoded key without a system keyring.
        (process.platform !== "linux" ||
            safeStorage.getSelectedStorageBackend() !== "basic_text")
    )
}

export function setServiceConfigs(configs: ServiceConfigs) {
    if (canEncryptConfigs()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(configs))
        store.set(ENCRYPTED_CONFIGS_STORE_KEY, encrypted.toString("base64"))
        store.delete(SERVICE_CONFIGS_STORE_KEY)
    } else {
        store.set(SERVICE_CONFIGS_STORE_KEY, configs)
        store.delete(ENCRYPTED_CONFIGS_STORE_KEY)
    }
}

export function getServiceConfigs(): ServiceConfigs {
    const encrypted = store.get(ENCRYPTED_CONFIGS_STORE_KEY)
    if (encrypted) {
        try {
            return JSON.parse(
                safeStorage.decryptString(Buffer.from(encrypted, "base64"))
            )
        } catch (err) {
            // Keep the blob: the keyring may only be temporarily unavailable.
            console.error("Failed to decrypt service configs:", err)
            return { type: SyncService.None }
        }
    }
    const configs = store.get(SERVICE_CONFIGS_STORE_KEY, {
        type: SyncService.None,
    })
    // Upgrades and restored backups arrive here as plain text.
    if (configs.type !== SyncService.None) setServiceConfigs(configs)
    return configs
}

export function stripServiceSecrets(configs: ServiceConfigs): ServiceConfigs {
    const stripped = { ...configs }
    for (const field of SERVICE_SECRET_FIELDS) delete stripped[field]
    return stripped
}

onIpc("get-service-configs", event => {
    event.returnValue = getServiceConfigs()
})
handleIpc("set-service-configs", (_, configs: ServiceConfigs) => {
    setServiceConfigs(configs)
})

const FILTER_TYPE_STORE_KEY = "filterType"
onIpc("get-filter-type", event => {
    event.returnValue = store.get(FILTER_TYPE_STORE_KEY, null)
})
handleIpc("set-filter-type", (_, filterType: number) => {
    store.set(FILTER_TYPE_STORE_KEY, filterType)
})

const LIST_CONFIGS_STORE_KEY = "listViewConfigs"
onIpc("get-view-configs", (event, view: ViewType) => {
    switch (view) {
        case ViewType.List:
            event.returnValue = store.get(
                LIST_CONFIGS_STORE_KEY,
                ViewConfigs.ShowCover
            )
            break
        default:
            event.returnValue = undefined
            break
    }
})
handleIpc("set-view-configs", (_, view: ViewType, configs: ViewConfigs) => {
    switch (view) {
        case ViewType.List:
            store.set(LIST_CONFIGS_STORE_KEY, configs)
            break
    }
})

const SOURCE_RULES_STORE_KEY = "sourceRules"

onIpc("get-all-rules", event => {
    event.returnValue = store.get(SOURCE_RULES_STORE_KEY, {})
})
handleIpc(
    "set-rules-for-target",
    (_, target: RuleTarget, rules: StoredRule[]) => {
        const key = getRuleTargetKey(target)
        // Keep the read and write together in main so independent targets cannot
        // overwrite each other using stale renderer snapshots.
        const allRules = { ...store.get(SOURCE_RULES_STORE_KEY, {}) }
        if (rules.length > 0) allRules[key] = rules
        else delete allRules[key]
        store.set(SOURCE_RULES_STORE_KEY, allRules)
    }
)
handleIpc(
    "migrate-lovefield-rules",
    (_, sources: Record<string, unknown>[]) => {
        store.set(SOURCE_RULES_STORE_KEY, transformLovefieldRules(sources))
    }
)

const DB_VERSION_STORE_KEY = "dbVersion"
onIpc("get-db-version", event => {
    event.returnValue = store.get(
        DB_VERSION_STORE_KEY as keyof SchemaTypes,
        null
    )
})
handleIpc("set-db-version", (_, version: string) => {
    store.set(DB_VERSION_STORE_KEY as keyof SchemaTypes, version)
})

const UNREAD_SOURCES_ONLY_STORE_KEY = "menuUnreadSourcesOnly"
onIpc("get-unread-sources-only", event => {
    event.returnValue = store.get(UNREAD_SOURCES_ONLY_STORE_KEY, false)
})
handleIpc("set-unread-sources-only", (_, flag: boolean) => {
    store.set(UNREAD_SOURCES_ONLY_STORE_KEY, flag)
})
