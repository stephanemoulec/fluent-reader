import { useEffect } from "react"
import { IsFocusVisibleClassName } from "@fluentui/react"
import { ViewType } from "../../../schema-types"
import {
    ContextMenuType,
    toggleMenu,
    toggleSettings,
} from "../../../scripts/models/app"
import { ALL, FilterType, initFeeds } from "../../../scripts/models/feed"
import {
    RSSItem,
    fetchItems,
    itemShortcuts,
    markAllRead,
    markRead,
} from "../../../scripts/models/item"
import {
    dismissItem,
    selectAllArticles,
    showItem,
    showOffsetItem,
    switchFilter,
    switchView,
    toggleSearch,
} from "../../../scripts/models/page"
import { useAppDispatch } from "../../../scripts/reducer"
import { AppThunk } from "../../../scripts/utils"
import { requestFullContent } from "./useArticleView"

const CHORD_TIMEOUT = 1500
const REPEATABLE_KEYS = new Set(["j", "k", "n", "p"])
// Matched by physical key, since some layouts need Shift to type digits.
const VIEW_KEYS: Record<string, ViewType> = {
    Digit1: ViewType.Compact,
    Numpad1: ViewType.Compact,
    Digit3: ViewType.List,
    Numpad3: ViewType.List,
    Digit4: ViewType.Cards,
    Numpad4: ViewType.Cards,
    Digit5: ViewType.Magazine,
    Numpad5: ViewType.Magazine,
}

export function canHandleShortcut(e: KeyboardEvent) {
    if (e.metaKey) return false
    return !(
        e.target instanceof Element &&
        e.target.closest(
            'input, textarea, select, [contenteditable], [role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]'
        )
    )
}

export function focusedCardId() {
    const card = document.activeElement?.closest<HTMLElement>("[data-iid]")
    return card ? Number(card.dataset.iid) : null
}

function feedCards() {
    return [...document.querySelectorAll<HTMLElement>("#refocus div[data-iid]")]
}

function moveCardFocus(offset: number, itemId: number) {
    const cards = feedCards()
    const currentId = focusedCardId() ?? itemId
    const current = cards.findIndex(c => Number(c.dataset.iid) === currentId)
    const card = cards[current < 0 ? 0 : current + offset]
    if (!card) return
    if (!card.hasAttribute("tabindex")) card.tabIndex = -1
    // Fluent only shows focus rings after its own navigation keys.
    card.closest("#refocus")?.classList.add(IsFocusVisibleClassName)
    card.focus({ preventScroll: true })
    // @ts-ignore
    card.scrollIntoViewIfNeeded()
}

const openItem =
    (item: RSSItem): AppThunk =>
    (dispatch, getState) => {
        dispatch(markRead(item))
        dispatch(showItem(getState().page.feedId, item))
    }

const stepItem =
    (offset: number): AppThunk =>
    (dispatch, getState) => {
        const { items, feeds, page } = getState()
        const focused = focusedCardId()
        if (focused !== null && focused !== page.itemId) {
            dispatch(openItem(items[focused]))
        } else if (page.itemId !== null) {
            dispatch(showOffsetItem(offset))
        } else if (offset > 0) {
            const first = items[feeds[page.feedId]?.iids[0]]
            if (first) dispatch(openItem(first))
        }
    }

const toggleOpenItem = (): AppThunk => (dispatch, getState) => {
    const { items, feeds, page } = getState()
    const focused = focusedCardId()
    if (focused !== null && focused !== page.itemId) {
        document.activeElement.dispatchEvent(
            new MouseEvent("click", { bubbles: true })
        )
    } else if (page.itemId !== null) {
        dispatch(dismissItem())
    } else {
        const first = items[feeds[page.feedId]?.iids[0]]
        if (first) dispatch(openItem(first))
    }
}

const showAllArticles =
    (filter: FilterType): AppThunk =>
    (dispatch, getState) => {
        dispatch(selectAllArticles(getState().app.menuKey !== ALL))
        dispatch(initFeeds())
        dispatch(switchFilter(filter))
    }

let chordStart = 0

const handleShortcut =
    (e: KeyboardEvent, toggleHelp: () => void): AppThunk =>
    (dispatch, getState) => {
        const { app, items, page } = getState()
        if (
            app.settings.display ||
            !app.sourceInit ||
            app.contextMenu.type !== ContextMenuType.Hidden ||
            !canHandleShortcut(e)
        )
            return

        const key = e.key.toLowerCase()
        if (e.repeat && !REPEATABLE_KEYS.has(key)) return

        const overlayOpen =
            page.itemId !== null && page.viewType !== ViewType.List
        const focused = focusedCardId()
        const targetItem = items[focused ?? page.itemId]
        const otherCardFocused = focused !== null && focused !== page.itemId
        let handled = true

        if (e.altKey) {
            if (e.ctrlKey || e.shiftKey || e.code !== "KeyP" || overlayOpen)
                return
            dispatch(toggleSettings())
        } else if (e.ctrlKey) {
            if (e.shiftKey || key !== "m" || !targetItem) return
            dispatch(markAllRead(null, targetItem.date, false))
        } else if (key === "?") {
            toggleHelp()
        } else if (
            Date.now() - chordStart < CHORD_TIMEOUT &&
            !e.shiftKey &&
            (key === "a" || key === "f")
        ) {
            chordStart = 0
            dispatch(
                showAllArticles(
                    key === "a" ? FilterType.Default : FilterType.StarredOnly
                )
            )
        } else if (e.shiftKey) {
            if (e.code === "Digit1")
                dispatch(switchFilter(FilterType.UnreadOnly))
            else if (e.code === "Digit2")
                dispatch(switchFilter(FilterType.Default))
            else if (key === "a") dispatch(markAllRead())
            else if (key === "m" && targetItem)
                dispatch(markAllRead(null, targetItem.date))
            else if (key === "b" && targetItem)
                dispatch(itemShortcuts(targetItem, e))
            else handled = false
        } else if (e.code in VIEW_KEYS) {
            if (overlayOpen) return
            if (page.viewType !== VIEW_KEYS[e.code])
                dispatch(switchView(VIEW_KEYS[e.code]))
        } else {
            switch (key) {
                case "g":
                    chordStart = Date.now()
                    break
                case "r":
                    if (
                        app.sourceInit &&
                        app.feedInit &&
                        !app.syncing &&
                        !app.fetchingItems
                    )
                        dispatch(fetchItems())
                    break
                case "/":
                    if (overlayOpen) return
                    if (page.searchOn)
                        document
                            .querySelector<HTMLElement>(".fui-SearchBox input")
                            ?.focus()
                    else dispatch(toggleSearch())
                    break
                case "d":
                    dispatch(toggleMenu())
                    break
                case "j":
                    dispatch(stepItem(1))
                    break
                case "k":
                    dispatch(stepItem(-1))
                    break
                case "n":
                case "p":
                    if (overlayOpen) return
                    moveCardFocus(key === "n" ? 1 : -1, page.itemId)
                    break
                case "o":
                    dispatch(toggleOpenItem())
                    break
                case "m":
                case "s":
                case "f":
                case "b":
                    if (targetItem) dispatch(itemShortcuts(targetItem, e))
                    break
                case "h":
                    // The open article handles this key itself.
                    if (
                        otherCardFocused ||
                        (focused !== null && page.itemId === null)
                    )
                        dispatch(itemShortcuts(targetItem, e))
                    else handled = false
                    break
                case "w":
                    // The open article handles this key itself.
                    if (focused === null || focused === page.itemId) {
                        handled = false
                    } else {
                        requestFullContent(focused)
                        dispatch(openItem(targetItem))
                    }
                    break
                default:
                    handled = false
            }
        }
        if (handled) e.preventDefault()
    }

export function useGlobalShortcuts(toggleHelp: () => void) {
    const dispatch = useAppDispatch()

    useEffect(() => {
        const listener = (e: KeyboardEvent) =>
            dispatch(handleShortcut(e, toggleHelp))
        document.addEventListener("keydown", listener)
        return () => document.removeEventListener("keydown", listener)
    }, [dispatch, toggleHelp])
}
