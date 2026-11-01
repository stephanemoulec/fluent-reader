import * as React from "react"
import intl from "react-intl-universal"
import { makeStyles, mergeClasses } from "@griffel/react"
import { FilterType } from "../../scripts/models/feed"
import { switchFilter } from "../../scripts/models/page"
import { useAppDispatch, useAppSelector } from "../../scripts/reducer"
import { FlatButton } from "./FlatButton"

const useStyles = makeStyles({
    root: {
        position: "absolute",
        left: "50%",
        bottom: "12px",
        transform: "translateX(-50%)",
        zIndex: 2,
        display: "flex",
        padding: "3px",
        borderRadius: "16px",
        backgroundColor: "var(--neutralLight)",
        boxShadow: "0 1px 4px #0003",
        whiteSpace: "nowrap",
    },
    button: {
        "width": "auto",
        "height": "24px",
        "lineHeight": "24px",
        "padding": "0 11px",
        "fontSize": "12px",
        "borderRadius": "12px",
        "color": "var(--neutralSecondary)",
        ":hover": {
            backgroundColor: "var(--hover)",
        },
        ":active": {
            backgroundColor: "var(--selection)",
        },
    },
    selected: {
        "fontWeight": 600,
        "color": "var(--neutralDark)",
        "backgroundColor": "var(--selection)",
        ":hover": {
            backgroundColor: "var(--selection)",
        },
    },
})

const FILTERS = [
    { type: FilterType.Default, label: "allArticles" },
    { type: FilterType.UnreadOnly, label: "context.unreadOnly" },
    { type: FilterType.StarredOnly, label: "context.starredOnly" },
]

export function FilterPill() {
    const classes = useStyles()
    const dispatch = useAppDispatch()
    const current = useAppSelector(
        s => s.page.filter.type & ~FilterType.Toggles
    )

    return (
        <div className={classes.root}>
            {FILTERS.map(({ type, label }) => (
                <FlatButton
                    key={type}
                    styleClass={mergeClasses(
                        classes.button,
                        current === type && classes.selected
                    )}
                    onClick={() => dispatch(switchFilter(type))}>
                    {intl.get(label)}
                </FlatButton>
            ))}
        </div>
    )
}
