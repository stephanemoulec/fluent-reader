import { app } from "electron"
import { execFile, spawn } from "node:child_process"
import * as path from "node:path"
import { promisify } from "node:util"

type PrivateBrowser = {
    pattern: RegExp
    flag: string
    // The program to run on Linux, where only the desktop entry name is known.
    linuxCommand: string
}

export type DefaultBrowser = {
    name: string
    command: string
    args: (url: string) => string[]
}

const PRIVATE_BROWSERS: PrivateBrowser[] = [
    { pattern: /brave/i, flag: "--incognito", linuxCommand: "brave-browser" },
    { pattern: /chrome/i, flag: "--incognito", linuxCommand: "google-chrome" },
    { pattern: /chromium/i, flag: "--incognito", linuxCommand: "chromium" },
    { pattern: /edge/i, flag: "--inprivate", linuxCommand: "microsoft-edge" },
    { pattern: /vivaldi/i, flag: "--incognito", linuxCommand: "vivaldi" },
    { pattern: /firefox/i, flag: "--private-window", linuxCommand: "firefox" },
    { pattern: /opera/i, flag: "--private", linuxCommand: "opera" },
]

function findPrivateBrowser(program: string) {
    return PRIVATE_BROWSERS.find(browser => browser.pattern.test(program))
}

export async function getDefaultBrowser(): Promise<DefaultBrowser | null> {
    // The Mac App Store sandbox doesn't allow passing arguments to other apps.
    if (process.mas) return null
    try {
        if (process.platform === "linux") {
            const { stdout } = await promisify(execFile)("xdg-settings", [
                "get",
                "default-web-browser",
            ])
            const entry = stdout.trim()
            const browser = findPrivateBrowser(entry)
            if (!browser) return null
            return {
                name: browser.linuxCommand,
                command: browser.linuxCommand,
                args: url => [browser.flag, url],
            }
        }
        const info = await app.getApplicationInfoForProtocol("https://")
        const browser = findPrivateBrowser(path.basename(info.path))
        if (!browser) return null
        return process.platform === "darwin"
            ? {
                  name: info.name,
                  command: "open",
                  args: url => ["-na", info.path, "--args", browser.flag, url],
              }
            : {
                  name: info.name,
                  command: info.path,
                  args: url => [browser.flag, url],
              }
    } catch (err) {
        console.log(err)
        return null
    }
}

// Throws rather than falling back, so a link never lands in a normal window's
// history after private windows were asked for.
export async function openInPrivateWindow(url: string) {
    const browser = await getDefaultBrowser()
    if (!browser) throw new Error("No supported default browser")
    await new Promise<void>((resolve, reject) => {
        const child = spawn(browser.command, browser.args(url), {
            detached: true,
            stdio: "ignore",
        })
        child.once("error", reject)
        child.once("spawn", () => {
            child.unref()
            resolve()
        })
    })
}
