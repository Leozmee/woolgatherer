import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const t0 = Date.now()
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1), ...a)
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
log('launched')
const page = await browser.newPage({ viewport: { width: 500, height: 450 } })
page.on('pageerror', (e) => log('PAGEERROR', e.message))
page.on('console', (m) => log('CONSOLE', m.type(), m.text().slice(0, 200)))
await page.goto('http://127.0.0.1:5182/', { waitUntil: 'domcontentloaded', timeout: 120000 })
log('dom loaded')
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => ({ scene: !!window.__scene, gl: !!window.__gl, labels: document.querySelectorAll('.label').length }))
  log(JSON.stringify(s))
  if (s.scene && s.labels >= 6) break
  await page.waitForTimeout(3000)
}
const t = Date.now()
await page.evaluate(() => {
  const st = window.__scene.__r3f.root.getState()
  window.__subs = st.internal.subscribers.map((s) => s.priority)
})
log('subs', await page.evaluate(() => JSON.stringify(window.__subs)))
await page.evaluate(() => window.__advance(performance.now()))
log('advance took', (Date.now() - t) / 1000)
await page.screenshot({ path: '/tmp/claude-0/-home-user-woolgatherer/f4102224-be96-5acf-8a3b-e16b299294c9/scratchpad/shots/probe.png' })
log('shot')
await browser.close()
