import * as React from "react"
import { useEffect, useRef, useCallback, useState } from "react"
import intl from "react-intl-universal"
import { Icon } from "@fluentui/react/lib/Icon"
import { AnimationClassNames } from "@fluentui/react/lib/Styling"
import AboutTab from "./settings/about"
import { FocusTrapZone } from "@fluentui/react"
import SourcesTabContainer from "../containers/settings/sources-container"
import GroupsTab from "./settings/groups"
import AppTabContainer from "../containers/settings/app-container"
import RulesTab from "./settings/rules"
import ServiceTabContainer from "../containers/settings/service-container"
import { initTouchBarWithTexts } from "../scripts/utils"
import { useAppSelector, useAppDispatch } from "../scripts/reducer"
import { exitSettings } from "../scripts/models/app"
import {
    makeStyles,
    Spinner,
    Tab,
    TabList,
    Text,
    tokens,
} from "@fluentui/react-components"
import { FlatButton } from "./utils/FlatButton"
import { FlatButtonGroup } from "./utils/FlatButtonGroup"

const TABS = [
    {
        value: "sources",
        label: "settings.sources",
        icon: "Source",
        content: SourcesTabContainer,
    },
    {
        value: "groups",
        label: "settings.grouping",
        icon: "GroupList",
        content: GroupsTab,
    },
    {
        value: "rules",
        label: "settings.rules",
        icon: "FilterSettings",
        content: RulesTab,
    },
    {
        value: "service",
        label: "settings.service",
        icon: "CloudImportExport",
        content: ServiceTabContainer,
    },
    {
        value: "app",
        label: "settings.app",
        icon: "Settings",
        content: AppTabContainer,
    },
    {
        value: "about",
        label: "settings.about",
        icon: "Info",
        content: AboutTab,
    },
]

const useSettingsClasses = makeStyles({
    rail: {
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        gap: "12px",
        width: "190px",
        padding: "20px 8px",
        boxSizing: "border-box",
        backgroundColor: "var(--paneSidebar)",
        borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    },
    railTitle: { margin: 0, padding: "0 12px" },
    title: { margin: 0 },
    main: {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minWidth: 0,
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        padding: "10px 12px 10px 24px",
    },
    content: {
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
        position: "relative",
        padding: "0 24px 12px",
    },
})

const Settings: React.FC = () => {
    const dispatch = useAppDispatch()
    const settingsClasses = useSettingsClasses()
    const [selectedTab, setSelectedTab] = useState(TABS[0].value)

    const display = useAppSelector(s => s.app.settings.display)
    const blocked = useAppSelector(
        s =>
            !s.app.sourceInit ||
            s.app.syncing ||
            s.app.fetchingItems ||
            s.app.settings.saving
    )
    const exitting = useAppSelector(s => s.app.settings.saving)

    const exittingRef = useRef(exitting)
    exittingRef.current = exitting

    const close = useCallback(() => dispatch(exitSettings()), [])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // A dialog opened from a settings tab closes on its own.
            if (
                event.key === "Escape" &&
                !exittingRef.current &&
                !(event.target as Element).closest?.(".fui-DialogSurface")
            )
                close()
        }
        if (display) {
            if (globalThis.utils.platform === "darwin")
                globalThis.utils.destroyTouchBar()
            document.body.addEventListener("keydown", onKeyDown)
        } else if (globalThis.utils.platform === "darwin") {
            initTouchBarWithTexts()
        }
        return () => {
            document.body.removeEventListener("keydown", onKeyDown)
        }
    }, [display])

    const activeTab = TABS.find(tab => tab.value === selectedTab)
    const ActiveContent = activeTab.content

    return (
        display && (
            <div
                className="settings-container"
                onClick={event => {
                    if (event.target === event.currentTarget && !exitting)
                        close()
                }}>
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={intl.get("settings.name")}
                    className={"settings " + AnimationClassNames.slideUpIn20}>
                    {blocked && (
                        <FocusTrapZone
                            isClickableOutsideFocusTrap={true}
                            className="loading">
                            <Spinner
                                label={intl.get("settings.fetching")}
                                labelPosition="below"
                                size="tiny"
                                tabIndex={0}
                            />
                        </FocusTrapZone>
                    )}
                    <div className={settingsClasses.rail}>
                        <Text
                            as="h2"
                            size={500}
                            weight="semibold"
                            className={settingsClasses.railTitle}>
                            {intl.get("settings.name")}
                        </Text>
                        <TabList
                            vertical
                            selectedValue={selectedTab}
                            onTabSelect={(_, data) =>
                                setSelectedTab(data.value as string)
                            }>
                            {TABS.map(tab => (
                                <Tab
                                    key={tab.value}
                                    value={tab.value}
                                    icon={<Icon iconName={tab.icon} />}>
                                    {intl.get(tab.label)}
                                </Tab>
                            ))}
                        </TabList>
                    </div>
                    <div className={settingsClasses.main}>
                        <div className={settingsClasses.header}>
                            <Text
                                as="h2"
                                size={400}
                                weight="semibold"
                                className={settingsClasses.title}>
                                {intl.get(activeTab.label)}
                            </Text>
                            <FlatButtonGroup>
                                <FlatButton
                                    disabled={exitting}
                                    title={intl.get("settings.exit")}
                                    ariaLabel={intl.get("settings.exit")}
                                    onClick={close}>
                                    <Icon iconName="Cancel" />
                                </FlatButton>
                            </FlatButtonGroup>
                        </div>
                        <div
                            role="tabpanel"
                            // Fluent's virtualized lists render rows by this scroller.
                            data-is-scrollable="true"
                            aria-label={intl.get(activeTab.label)}
                            className={settingsClasses.content}>
                            <ActiveContent />
                        </div>
                    </div>
                </div>
            </div>
        )
    )
}

export default Settings
