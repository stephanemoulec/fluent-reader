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
    const text = props.text || ""
    const regex =
        props.filter.search === ""
            ? null
            : validateRegex(props.filter.search, flags)
    if (!regex) {
        spans.push([props.title ? text : text.slice(0, 325), false])
    } else {
        const matcher = regex.matcher(text)
        let cursor = 0
        while (matcher.find()) {
            const start = matcher.start()
            const end = matcher.end()
            // Empty matches, from patterns like ^ or a*, have nothing to highlight.
            if (start === end) continue
            if (props.title) {
                if (cursor != start)
                    spans.push([text.substring(cursor, start), false])
            } else if (start != 0) {
                const from = Math.max(
                    start - 25,
                    text.lastIndexOf(" ", Math.max(start - 10, 0))
                )
                spans.push([text.substring(Math.max(0, from), start), false])
            }
            spans.push([text.substring(start, end), true])
            cursor = end
            if (!props.title) break
        }
        if (props.title) {
            if (cursor < text.length) spans.push([text.slice(cursor), false])
        } else if (cursor < text.length) {
            spans.push([
                text.slice(cursor, cursor + (cursor ? 300 : 325)),
                false,
            ])
        }
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
