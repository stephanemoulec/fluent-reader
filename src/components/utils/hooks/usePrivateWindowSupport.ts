import { useEffect, useState } from "react"

// The default browser rarely changes while the app runs, so ask once and let
// menus opened later render the answer immediately.
let cached: boolean
const support = window.utils
    .canOpenPrivateWindow()
    .then(supported => (cached = supported))

export function usePrivateWindowSupport() {
    const [supported, setSupported] = useState(cached ?? false)
    useEffect(() => {
        let active = true
        support.then(value => {
            if (active) setSupported(value)
        })
        return () => {
            active = false
        }
    }, [])
    return supported
}
