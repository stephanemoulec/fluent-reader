import * as React from "react"
import intl from "react-intl-universal"
import {
    Button,
    Dialog,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    makeStyles,
    Text,
    tokens,
} from "@fluentui/react-components"
import { Icon } from "@fluentui/react/lib/Icon"

type ShortcutGroup = {
    title: string
    // Each key list holds alternatives. A space is a chord and + a combination.
    shortcuts: { keys: string[]; label: string }[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        title: "shortcuts.move",
        shortcuts: [
            { keys: ["J", "K"], label: "shortcuts.next" },
            { keys: ["N", "P"], label: "shortcuts.focus" },
            { keys: ["O"], label: "shortcuts.open" },
            { keys: ["←", "→"], label: "shortcuts.arrows" },
            { keys: ["Esc"], label: "shortcuts.close" },
        ],
    },
    {
        title: "shortcuts.go",
        shortcuts: [
            { keys: ["G A"], label: "shortcuts.all" },
            { keys: ["G F"], label: "shortcuts.starred" },
            { keys: ["/"], label: "shortcuts.search" },
            { keys: ["D"], label: "shortcuts.sidebar" },
            { keys: ["R"], label: "shortcuts.refresh" },
        ],
    },
    {
        title: "shortcuts.article",
        shortcuts: [
            { keys: ["M"], label: "shortcuts.read" },
            { keys: ["S", "F"], label: "shortcuts.star" },
            { keys: ["B"], label: "shortcuts.browser" },
            { keys: ["H"], label: "shortcuts.hide" },
            { keys: ["Shift+A"], label: "shortcuts.markAll" },
            { keys: ["Shift+M"], label: "shortcuts.markBelow" },
            { keys: ["Ctrl+M"], label: "shortcuts.markAbove" },
        ],
    },
    {
        title: "shortcuts.reader",
        shortcuts: [
            { keys: ["L"], label: "shortcuts.webpage" },
            { keys: ["W"], label: "shortcuts.full" },
            { keys: ["=", "-"], label: "shortcuts.fontSize" },
            { keys: ["0"], label: "shortcuts.fontReset" },
        ],
    },
    {
        title: "shortcuts.view",
        shortcuts: [
            { keys: ["1"], label: "shortcuts.compact" },
            { keys: ["3"], label: "shortcuts.list" },
            { keys: ["4"], label: "shortcuts.cards" },
            { keys: ["5"], label: "shortcuts.magazine" },
            { keys: ["Shift+1"], label: "shortcuts.unread" },
            { keys: ["Shift+2"], label: "shortcuts.showAll" },
            { keys: ["F7"], label: "shortcuts.notifications" },
            { keys: ["F8"], label: "shortcuts.viewMenu" },
            { keys: ["Alt+P"], label: "shortcuts.settings" },
            { keys: ["?"], label: "shortcuts.help" },
        ],
    },
]

const useClasses = makeStyles({
    surface: { maxWidth: "780px", width: "calc(100% - 64px)" },
    columns: { columnCount: 2, columnGap: "32px" },
    group: { breakInside: "avoid", paddingBottom: "16px" },
    groupTitle: {
        display: "block",
        paddingBottom: "4px",
        color: tokens.colorNeutralForeground3,
    },
    row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        minHeight: "26px",
    },
    keys: {
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        gap: "3px",
    },
    key: {
        minWidth: "12px",
        padding: "0 5px",
        borderRadius: "4px",
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        backgroundColor: tokens.colorNeutralBackground3,
        fontFamily: "inherit",
        fontSize: tokens.fontSizeBase200,
        lineHeight: "18px",
        textAlign: "center",
    },
    separator: { color: tokens.colorNeutralForeground3 },
})

const ShortcutKeys: React.FC<{ keys: string[] }> = ({ keys }) => {
    const classes = useClasses()
    return (
        <span className={classes.keys}>
            {keys.map((alternative, index) => (
                <React.Fragment key={alternative}>
                    {index > 0 && <span className={classes.separator}>/</span>}
                    {alternative.split(/[ +]/).map(key => (
                        <kbd key={key} className={classes.key}>
                            {key}
                        </kbd>
                    ))}
                </React.Fragment>
            ))}
        </span>
    )
}

type ShortcutsDialogProps = {
    open: boolean
    onClose: () => void
}

const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({ open, onClose }) => {
    const classes = useClasses()
    return (
        <Dialog
            open={open}
            onOpenChange={(_, data) => {
                if (!data.open) onClose()
            }}>
            <DialogSurface
                className={classes.surface}
                onKeyDown={event => {
                    if (event.key === "?") onClose()
                }}>
                <DialogBody>
                    <DialogTitle
                        action={
                            <Button
                                appearance="subtle"
                                aria-label={intl.get("close")}
                                icon={<Icon iconName="Cancel" />}
                                onClick={onClose}
                            />
                        }>
                        {intl.get("shortcuts.title")}
                    </DialogTitle>
                    <DialogContent className={classes.columns}>
                        {SHORTCUT_GROUPS.map(group => (
                            <div key={group.title} className={classes.group}>
                                <Text
                                    size={200}
                                    weight="semibold"
                                    className={classes.groupTitle}>
                                    {intl.get(group.title)}
                                </Text>
                                {group.shortcuts.map(shortcut => (
                                    <div
                                        key={shortcut.label}
                                        className={classes.row}>
                                        <Text size={300}>
                                            {intl.get(shortcut.label)}
                                        </Text>
                                        <ShortcutKeys keys={shortcut.keys} />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </DialogContent>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    )
}

export default ShortcutsDialog
