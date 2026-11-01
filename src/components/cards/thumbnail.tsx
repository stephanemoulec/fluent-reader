import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { acquireThumbnail, releaseThumbnail } from "../../scripts/thumbnails"

// Start a little early so images are ready by the time they scroll into view.
const LOAD_MARGIN = "400px"

type ThumbnailProps = {
    src: string
    className?: string
}

const Thumbnail: React.FunctionComponent<ThumbnailProps> = ({
    src,
    className,
}) => {
    const imageRef = useRef<HTMLImageElement>(null)
    const [loaded, setLoaded] = useState<{ src: string; image: string }>(null)

    useEffect(() => {
        let active = true
        let acquired = false
        const observer = new IntersectionObserver(
            entries => {
                if (!entries.some(entry => entry.isIntersecting)) return
                observer.disconnect()
                acquired = true
                acquireThumbnail(src).then(image => {
                    if (active) setLoaded({ src, image })
                })
            },
            // The card lists scroll inside their own panes, not the viewport.
            { scrollMargin: LOAD_MARGIN } as IntersectionObserverInit
        )
        observer.observe(imageRef.current)
        return () => {
            active = false
            observer.disconnect()
            if (acquired) releaseThumbnail(src)
        }
    }, [src])

    return (
        <img
            ref={imageRef}
            className={className}
            src={loaded?.src === src ? loaded.image : undefined}
            loading="lazy"
            decoding="async"
        />
    )
}

export default Thumbnail
