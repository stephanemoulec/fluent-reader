function get(name) {
    if (name = (new RegExp('[?&]' + encodeURIComponent(name) + '=([^&]*)')).exec(location.search))
        return decodeURIComponent(name[1]);
}
let dir = get("d")
if (dir === "1") {
    document.body.classList.add("rtl")
} else if (dir === "2") {
    document.body.classList.add("vertical")
    document.body.addEventListener("wheel", (evt) => {
        document.scrollingElement.scrollLeft -= evt.deltaY;
    });
}
async function getArticle(url) {
    let article = get("a")
    if (get("m") === "1") {
        return (await Mercury.parse(url, {html: article})).content || ""
    } else {
        return article
    }
}
document.documentElement.style.fontSize = get("s") + "px"
let font = get("f")
if (font) document.body.style.fontFamily = `"${font}"`
let url = get("u")
getArticle(url).then(article => {
    let domParser = new DOMParser()
    let dom = domParser.parseFromString(get("h"), "text/html")
    dom.getElementsByTagName("article")[0].innerHTML = article
    let baseEl = dom.createElement('base')
    baseEl.setAttribute('href', url.split("/").slice(0, 3).join("/"))
    dom.head.append(baseEl)
    // Feed content is untrusted. <meta> refreshes would navigate without a click,
    // and the CSP cannot block them.
    for (let e of dom.body.querySelectorAll("script, noscript, meta, base, link")) {
        e.remove()
    }
    // Omitting allow-popups and allow-top-navigation keeps embeds from opening
    // the external browser. srcdoc would run same-origin under allow-same-origin.
    for (let e of dom.querySelectorAll("iframe")) {
        e.removeAttribute("srcdoc")
        e.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation")
        e.setAttribute("allow", "fullscreen")
    }
    for (let e of dom.querySelectorAll("*[src]")) {
        e.src = e.src
    }
    for (let e of dom.querySelectorAll("*[href]")) {
        e.href = e.href
    }
    let main = document.getElementById("main")
    // Move the sanitized nodes. Serializing and reparsing them could revive markup.
    main.replaceChildren(...dom.body.childNodes)
    main.classList.add("show")
})
