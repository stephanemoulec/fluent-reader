import * as React from "react"
import { validateRegex } from "../../scripts/utils"
import { FeedFilter, FilterType } from "../../scripts/models/feed"
import { SourceTextDirection } from "../../scripts/models/source"

type HighlightsProps = {
    text: string
    filter: FeedFilter
    title?: boolean
}

const Highlights: React.FunctionComponent<HighlightsProps> = props => {
    const spans: [string, boolean][] = new Array()
    const flags = props.filter.type & FilterType.CaseInsensitive ? "i" : ""
    const regex = validateRegex(props.filter.search, flags)
    const text = props.text || ""
    if (!props.filter.search || !regex) {
        spans.push([props.title ? text : text.slice(0, 325), false])
    } else {
        const matcher = regex.matcher(text)
        let cursor = 0
        while (matcher.find()) {
            const start = matcher.start()
            const end = matcher.end()
            // Empty matches have no visible highlight. Matcher.find advances
            // after them, avoiding an infinite loop for patterns such as ^ or a*.
            if (start === end) continue
            const from = props.title ? cursor : Math.max(0, start - 25)
            spans.push(
                [text.slice(from, start), false],
                [text.slice(start, end), true]
            )
            cursor = end
            if (!props.title) break
        }
        spans.push([
            props.title
                ? text.slice(cursor)
                : text.slice(cursor, cursor + (cursor ? 300 : 325)),
            false,
        ])
    }

    return (
        <>
            {spans.map(([text, flag]) =>
                flag ? <span className="h">{text}</span> : text
            )}
        </>
    )
}

export default Highlights
