// Usage: node crop.mjs in.png out.png x y w h scale
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
const [,, input, output, x, y, w, h, scale = '3'] = process.argv
const b64 = readFileSync(input).toString('base64')
const browser = await chromium.launch()
const s = +scale
const page = await browser.newPage({ viewport: { width: +w * s, height: +h * s } })
await page.setContent(`<html><body style="margin:0;overflow:hidden"><img id="i" src="data:image/png;base64,${b64}" style="position:absolute;left:${-x * s}px;top:${-y * s}px;transform-origin:0 0;transform:scale(${s});image-rendering:auto"></body></html>`)
await page.waitForFunction(() => document.getElementById('i').complete)
await page.screenshot({ path: output })
await browser.close()
