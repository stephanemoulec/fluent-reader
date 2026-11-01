import {
    BrandVariants,
    ButtonState,
    createDarkTheme,
    createLightTheme,
    FieldState,
    LabelState,
    makeStyles,
    mergeClasses,
    MessageBarState,
    OptionState,
    Theme,
    tokens,
    TreeItemLayoutState,
} from "@fluentui/react-components"
import { createV8Theme } from "@fluentui/react-migration-v8-v9"
import { ITheme } from "@fluentui/react"
import { CustomStyleHooksContextValue_unstable } from "@fluentui/react-shared-contexts"

const brand: BrandVariants = {
    10: "#02161a",
    20: "#052329",
    30: "#083038",
    40: "#0b3d46",
    50: "#0e4a55",
    60: "#115763",
    70: "#136170",
    80: "#156b78",
    90: "#2a7a87",
    100: "#438996",
    110: "#5f99a5",
    120: "#7ca9b4",
    130: "#99bac3",
    140: "#b6ccd3",
    150: "#d2e0e4",
    160: "#edf3f5",
}

const READER_LIGHT = "#fbfaf7"
const READER_DARK = "#262421"

export const customLightTheme: Theme = {
    ...createLightTheme(brand),
    colorNeutralBackground1: READER_LIGHT,
    colorSubtleBackgroundLightAlphaHover: "#0001",
    colorSubtleBackgroundLightAlphaPressed: "#0002",
}

export const customDarkTheme: Theme = {
    ...createDarkTheme(brand),
    colorNeutralBackground1: READER_DARK,
    colorSubtleBackgroundLightAlphaHover: "#fff1",
    colorSubtleBackgroundLightAlphaPressed: "#fff1",
}

export type AppThemeBundle = {
    v8Theme: ITheme
    v9Theme: Theme
}

export function createAppTheme(
    isDarkTheme: boolean,
    fontFamily: string
): AppThemeBundle {
    const baseTheme = isDarkTheme ? customDarkTheme : customLightTheme
    const v9Theme: Theme = {
        ...baseTheme,
        fontFamilyBase: fontFamily,
    }
    const baseV8Theme = createV8Theme(brand, v9Theme, isDarkTheme)
    const v8Theme: ITheme = {
        ...baseV8Theme,
        palette: {
            ...baseV8Theme.palette,
            white: isDarkTheme ? READER_DARK : READER_LIGHT,
            ...(isDarkTheme ? { black: "#f5f2ec" } : {}),
        },
    }
    return {
        v8Theme,
        v9Theme,
    }
}

const useTreeItemLayoutStyles = makeStyles({
    root: {
        cursor: "default",
    },
    iconBefore: {
        paddingRight: tokens.spacingHorizontalS,
    },
})
const useButtonStyles = makeStyles({
    root: {
        "cursor": "default",
        // Fluent injects its hover styles after our extracted stylesheet.
        "&.fui-Button, &.fui-ToggleButton": {
            ":hover": {
                cursor: "default",
            },
            ":hover:active": {
                cursor: "default",
            },
            ":active:focus-visible": {
                cursor: "default",
            },
        },
    },
})
const useMessageBarStyles = makeStyles({
    root: {
        userSelect: "none",
    },
})
const useOptionStyles = makeStyles({
    root: { cursor: "default" },
})
const useLabelStyles = makeStyles({
    root: {
        userSelect: "none",
    },
})
const useFieldStyles = makeStyles({
    label: {
        fontWeight: tokens.fontWeightSemibold,
    },
})

function useButtonStylesOverride(state: ButtonState) {
    const styles = useButtonStyles()
    state.root.className = mergeClasses(state.root.className, styles.root)
}

export const CUSTOM_STYLE_HOOKS: CustomStyleHooksContextValue_unstable = {
    useButtonStyles_unstable: useButtonStylesOverride,
    useToggleButtonStyles_unstable: useButtonStylesOverride,
    useOptionStyles_unstable: (state: OptionState) => {
        const styles = useOptionStyles()
        state.root.className = mergeClasses(state.root.className, styles.root)
    },
    useMessageBarStyles_unstable: (state: MessageBarState) => {
        const styles = useMessageBarStyles()
        state.root.className = mergeClasses(state.root.className, styles.root)
    },
    useTreeItemLayoutStyles_unstable: (state: TreeItemLayoutState) => {
        const styles = useTreeItemLayoutStyles()
        state.root.className = mergeClasses(state.root.className, styles.root)
        if (state.iconBefore != null) {
            state.iconBefore.className = mergeClasses(
                state.iconBefore.className,
                styles.iconBefore
            )
        }
    },
    useLabelStyles_unstable: (state: LabelState) => {
        const styles = useLabelStyles()
        state.root.className = mergeClasses(state.root.className, styles.root)
    },
    useFieldStyles_unstable: (state: FieldState) => {
        const styles = useFieldStyles()
        if (state.label != null) {
            state.label.className = mergeClasses(
                state.label.className,
                styles.label
            )
        }
    },
}
