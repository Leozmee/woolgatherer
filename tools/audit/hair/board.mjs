import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const out = process.argv[2] || 'board.png'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('willReadFrequently')) console.log('console:', m.type(), m.text().slice(0, 200))
})
const t0 = Date.now()
await page.goto('http://127.0.0.1:5183/', { timeout: 120000 })
await page.waitForSelector('canvas', { timeout: 120000 })
await page.waitForFunction(() => document.querySelectorAll('.label .name').length >= 6, null, { timeout: 180000 })
await page.waitForTimeout(8000)
console.log('names', await page.$$eval('.label', (els) => els.map((e) => e.textContent)))
await page.screenshot({ path: out, timeout: 180000 })
console.log('info', await page.evaluate(() => { const i = window.__gl.info; return { calls: i.render.calls, tris: i.render.triangles } }))
console.log('ms', Date.now() - t0)
await browser.close()
