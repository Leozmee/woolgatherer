// Temps de génération des cartes (console.info [knit]) : planche puis présentation de l'écharpe.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import fs from 'node:fs'
const OUT = '/tmp/claude-0/-home-user-woolgatherer/f4102224-be96-5acf-8a3b-e16b299294c9/scratchpad/perf'
const APP = OUT + '/app'
const log = (...a) => { const l = [new Date().toISOString().slice(11, 19), ...a].join(' '); console.log(l); fs.appendFileSync(OUT + '/probe2.log', l + '\n') }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.route('http://audit.local/**', (route) => {
  const u = new URL(route.request().url()); const f = u.pathname === '/' ? '/index.html' : u.pathname
  const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' }
  try { route.fulfill({ status: 200, contentType: types[f.split('.').pop()] ?? 'application/octet-stream', body: fs.readFileSync(APP + f) }) } catch { route.fulfill({ status: 404, body: '' }) }
})
let phase = 'planche'
page.on('console', (m) => { const t = m.text(); if (t.includes('[knit]') || t.includes('[coiffure]') || m.type() === 'error') log(phase, t.slice(0, 200)) })
await page.goto('http://audit.local/')
await page.waitForFunction(() => window.__gl && document.querySelectorAll('button.choose').length === 6, null, { timeout: 300000 })
await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r)) })
phase = 'présentation écharpe'
await page.locator('button.choose').nth(1).click()
await page.waitForSelector('#play', { timeout: 300000 })
await page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r)) })
log('fin')
await browser.close()
