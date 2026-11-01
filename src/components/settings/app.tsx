import * as React from "react"
import { useEffect, useId, useState } from "react"
import intl from "react-intl-universal"
import {
    urlTest,
    byteToMB,
    calculateItemSize,
    getSearchEngineName,
} from "../../scripts/utils"
import { ThemeSettings, SearchEngines } from "../../schema-types"
import {
    getThemeSettings,
    setThemeSettings,
    exportAll,
} from "../../scripts/settings"
import {
    clearThumbnailCache,
    getThumbnailCacheSize,
} from "../../scripts/thumbnails"
import {
    Button,
    Dropdown,
    Field,
    Input,
    Option,
    RadioGroup,
    Radio,
    Switch,
    Text,
    tokens,
} from "@fluentui/react-components"
import { makeStyles, mergeClasses } from "@griffel/react"
import { DangerButton } from "../utils/DangerButton"

type AppTabProps = {
    setLanguage: (option: string) => void
    setFetchInterval: (interval: number) => void
    deleteArticles: (days: number) => Promise<void>
    importAll: () => Promise<void>
}

const useStyles = makeStyles({
    root: { display: "flex", flexDirection: "column", gap: "14px" },
    section: { display: "flex", flexDirection: "column", gap: "6px" },
    sectionTitle: { margin: 0, color: tokens.colorNeutralForeground3 },
    rows: {
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${tokens.colorNeutralStroke2}`,
        borderRadius: "10px",
    },
    row: {
        "display": "flex",
        "alignItems": "center",
        "justifyContent": "space-between",
        "gap": "16px",
        "minHeight": "46px",
        "padding": "6px 14px",
        "boxSizing": "border-box",
        "&:not(:first-child)": {
            borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
        },
    },
    rowText: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
    },
    rowControl: { flexShrink: 0 },
    controls: { display: "flex", alignItems: "center", gap: "8px" },
    pacForm: {
        padding: "10px 14px",
        borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    grow: { flex: 1, minWidth: 0 },
    dropdown: { width: "230px", minWidth: 0 },
    cleanup: { width: "270px", minWidth: 0 },
    hint: { color: tokens.colorNeutralForeground3 },
})

type SettingsSectionProps = {
    title: string
    children: React.ReactNode
}

function SettingsSection({ title, children }: SettingsSectionProps) {
    const classes = useStyles()
    return (
        <section className={classes.section}>
            <Text
                as="h3"
                size={200}
                weight="semibold"
                className={classes.sectionTitle}>
                {title}
            </Text>
            <div className={classes.rows}>{children}</div>
        </section>
    )
}

type SettingRowProps = {
    label: string
    hint?: string
    children: React.ReactNode
}

function SettingRow({ label, hint, children }: SettingRowProps) {
    const classes = useStyles()
    const labelId = useId()
    return (
        <div className={classes.row} role="group" aria-labelledby={labelId}>
            <div className={classes.rowText}>
                <Text id={labelId}>{label}</Text>
                {hint && (
                    <Text size={200} className={classes.hint}>
                        {hint}
                    </Text>
                )}
            </div>
            <div className={classes.rowControl}>{children}</div>
        </div>
    )
}

async function totalCacheSize() {
    const [browser, thumbnails] = await Promise.all([
        window.utils.getCacheSize(),
        getThumbnailCacheSize(),
    ])
    return browser + thumbnails
}

function AppTab({
    setLanguage,
    setFetchInterval,
    deleteArticles,
    importAll,
}: AppTabProps) {
    const classes = useStyles()
    const [locale, setLocale] = useState(() =>
        window.settings.getLocaleSettings()
    )
    const [theme, setTheme] = useState(getThemeSettings)
    const [fetchInterval, setSelectedFetchInterval] = useState(() =>
        String(window.settings.getFetchInterval())
    )
    const [searchEngine, setSearchEngine] = useState(() =>
        window.settings.getSearchEngine()
    )
    const [pacStatus, setPacStatus] = useState(() =>
        window.settings.getProxyStatus()
    )
    const [pacUrl, setPacUrl] = useState(() => window.settings.getProxy())
    const [itemSize, setItemSize] = useState<string>(null)
    const [cacheSize, setCacheSize] = useState<string>(null)
    const [deleteIndex, setDeleteIndex] = useState<string>(null)

    useEffect(() => {
        let active = true
        calculateItemSize().then(size => {
            if (active) setItemSize(byteToMB(size))
        })
        totalCacheSize().then(size => {
            if (active) setCacheSize(byteToMB(size))
        })
        return () => {
            active = false
        }
    }, [])

    const languageOptions = [
        { value: "default", text: intl.get("followSystem") },
        { value: "de", text: "Deutsch" },
        { value: "en-US", text: "English" },
        { value: "es", text: "Español" },
        { value: "cs", text: "Čeština" },
        { value: "fr-FR", text: "Français" },
        { value: "it", text: "Italiano" },
        { value: "nl", text: "Nederlands" },
        { value: "pt-BR", text: "Português do Brasil" },
        { value: "pt-PT", text: "Português de Portugal" },
        { value: "sk-SK", text: "Slovenčina" },
        { value: "fi-FI", text: "Suomi" },
        { value: "sv", text: "Svenska" },
        { value: "tr", text: "Türkçe" },
        { value: "uk", text: "Українська" },
        { value: "ru", text: "Русский" },
        { value: "ko", text: "한글" },
        { value: "ja", text: "日本語" },
        { value: "zh-CN", text: "中文（简体）" },
        { value: "zh-TW", text: "中文（繁體）" },
    ]
    const fetchIntervalOptions = [0, 10, 15, 20, 30, 45, 60].map(minutes => ({
        value: String(minutes),
        text:
            minutes === 0
                ? intl.get("app.never")
                : minutes === 60
                ? intl.get("time.hour", { h: 1 })
                : intl.get("time.minute", { m: minutes }),
    }))
    const searchEngineOptions = [
        SearchEngines.Google,
        SearchEngines.Bing,
        SearchEngines.Baidu,
        SearchEngines.DuckDuckGo,
    ]
    const deleteOptions = [7, 14, 21, 28, 0].map(days => ({
        value: String(days),
        text: days
            ? intl.get("app.daysAgo", { days })
            : intl.get("app.deleteAll"),
    }))
    const validPacUrl = urlTest(pacUrl)
    const pacError = pacUrl && !validPacUrl ? intl.get("app.badUrl") : ""

    function toggleProxy() {
        window.settings.toggleProxyStatus()
        setPacStatus(window.settings.getProxyStatus())
        setPacUrl(window.settings.getProxy())
    }

    function setProxy(event: React.FormEvent) {
        event.preventDefault()
        if (validPacUrl) window.settings.setProxy(pacUrl)
    }

    async function confirmDelete() {
        if (itemSize === null || deleteIndex === null) return
        setItemSize(null)
        await deleteArticles(Number(deleteIndex))
        setItemSize(byteToMB(await calculateItemSize()))
    }

    async function clearCache() {
        await Promise.all([window.utils.clearCache(), clearThumbnailCache()])
        setCacheSize(byteToMB(await totalCacheSize()))
    }

    return (
        <div className={mergeClasses("tab-body", classes.root)}>
            <SettingsSection title={intl.get("app.appearance")}>
                <SettingRow label={intl.get("app.language")}>
                    <Dropdown
                        inlinePopup
                        className={classes.dropdown}
                        selectedOptions={[locale]}
                        value={
                            languageOptions.find(
                                option => option.value === locale
                            )?.text || ""
                        }
                        onOptionSelect={(_, data) => {
                            if (!data.optionValue) return
                            setLocale(data.optionValue)
                            setLanguage(data.optionValue)
                        }}>
                        {languageOptions.map(option => (
                            <Option key={option.value} value={option.value}>
                                {option.text}
                            </Option>
                        ))}
                    </Dropdown>
                </SettingRow>
                <SettingRow label={intl.get("app.theme")}>
                    <RadioGroup
                        layout="horizontal"
                        value={theme}
                        onChange={(_, data) => {
                            const value = data.value as ThemeSettings
                            setThemeSettings(value)
                            setTheme(value)
                        }}>
                        <Radio
                            value={ThemeSettings.Default}
                            label={intl.get("followSystem")}
                        />
                        <Radio
                            value={ThemeSettings.Light}
                            label={intl.get("app.lightTheme")}
                        />
                        <Radio
                            value={ThemeSettings.Dark}
                            label={intl.get("app.darkTheme")}
                        />
                    </RadioGroup>
                </SettingRow>
            </SettingsSection>

            <SettingsSection title={intl.get("app.reading")}>
                <SettingRow label={intl.get("app.fetchInterval")}>
                    <Dropdown
                        inlinePopup
                        className={classes.dropdown}
                        selectedOptions={[fetchInterval]}
                        value={
                            fetchIntervalOptions.find(
                                option => option.value === fetchInterval
                            )?.text || ""
                        }
                        onOptionSelect={(_, data) => {
                            if (!data.optionValue) return
                            setSelectedFetchInterval(data.optionValue)
                            setFetchInterval(Number(data.optionValue))
                        }}>
                        {fetchIntervalOptions.map(option => (
                            <Option key={option.value} value={option.value}>
                                {option.text}
                            </Option>
                        ))}
                    </Dropdown>
                </SettingRow>
                <SettingRow label={intl.get("searchEngine.name")}>
                    <Dropdown
                        inlinePopup
                        className={classes.dropdown}
                        selectedOptions={[String(searchEngine)]}
                        value={getSearchEngineName(searchEngine)}
                        onOptionSelect={(_, data) => {
                            if (!data.optionValue) return
                            const value = Number(data.optionValue)
                            setSearchEngine(value)
                            window.settings.setSearchEngine(value)
                        }}>
                        {searchEngineOptions.map(engine => (
                            <Option key={engine} value={String(engine)}>
                                {getSearchEngineName(engine)}
                            </Option>
                        ))}
                    </Dropdown>
                </SettingRow>
            </SettingsSection>

            <SettingsSection title={intl.get("app.network")}>
                <SettingRow label={intl.get("app.enableProxy")}>
                    <Switch checked={pacStatus} onChange={toggleProxy} />
                </SettingRow>
                {pacStatus && (
                    <form className={classes.pacForm} onSubmit={setProxy}>
                        <Field
                            validationState={pacError ? "error" : "none"}
                            validationMessage={pacError}
                            hint={intl.get("app.pacHint")}>
                            <div className={classes.controls}>
                                <Input
                                    required
                                    className={classes.grow}
                                    aria-label={intl.get("app.pac")}
                                    placeholder={intl.get("app.pac")}
                                    name="pacUrl"
                                    value={pacUrl}
                                    onChange={(_, data) =>
                                        setPacUrl(data.value.trim())
                                    }
                                />
                                <Button disabled={!validPacUrl} type="submit">
                                    {intl.get("app.setPac")}
                                </Button>
                            </div>
                        </Field>
                    </form>
                )}
            </SettingsSection>

            <SettingsSection title={intl.get("app.storage")}>
                <SettingRow
                    label={intl.get("app.cleanup")}
                    hint={
                        itemSize
                            ? intl.get("app.itemSize", { size: itemSize })
                            : intl.get("app.calculatingSize")
                    }>
                    <div className={classes.controls}>
                        <Dropdown
                            inlinePopup
                            className={classes.cleanup}
                            placeholder={intl.get("app.deleteChoices")}
                            selectedOptions={
                                deleteIndex === null ? [] : [deleteIndex]
                            }
                            value={
                                deleteOptions.find(
                                    option => option.value === deleteIndex
                                )?.text || ""
                            }
                            onOptionSelect={(_, data) =>
                                setDeleteIndex(data.optionValue ?? null)
                            }>
                            {deleteOptions.map(option => (
                                <Option key={option.value} value={option.value}>
                                    {option.text}
                                </Option>
                            ))}
                        </Dropdown>
                        <DangerButton
                            disabled={itemSize === null || deleteIndex === null}
                            text={intl.get("app.confirmDelete")}
                            onClick={confirmDelete}
                        />
                    </div>
                </SettingRow>
                <SettingRow
                    label={intl.get("app.cache")}
                    hint={
                        cacheSize
                            ? intl.get("app.cacheSize", { size: cacheSize })
                            : intl.get("app.calculatingSize")
                    }>
                    <Button
                        disabled={cacheSize === null || cacheSize === "0MB"}
                        onClick={clearCache}>
                        {intl.get("app.cache")}
                    </Button>
                </SettingRow>
                <SettingRow label={intl.get("app.data")}>
                    <div className={classes.controls}>
                        <Button onClick={exportAll}>
                            {intl.get("app.backup")}
                        </Button>
                        <Button onClick={importAll}>
                            {intl.get("app.restore")}
                        </Button>
                    </div>
                </SettingRow>
            </SettingsSection>
        </div>
    )
}

export default AppTab
