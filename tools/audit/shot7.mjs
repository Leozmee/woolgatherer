import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const pg = await b.newPage({ viewport: { width: 440, height: 520 } })
pg.on('pageerror', e => console.log('PAGEERR', e.message))
await pg.goto('http://127.0.0.1:5173/')
await pg.waitForSelector('button.choose', { timeout: 90000 })
const names = await pg.$$eval('.label .name', els => els.map(e => e.textContent))
for (const [want, yaw] of [['ÉCHARPE', 2.6], ['COLLIER', 0.3]]) {
  await pg.locator('button.choose').nth(names.indexOf(want)).click({ timeout: 60000 })
  await pg.waitForTimeout(6000)
  await pg.evaluate((y) => { window.__turntable.yaw = y }, yaw)
  await pg.waitForTimeout(5000)
  await pg.screenshot({ path: `f_${want}.png`, timeout: 120000 })
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(3000)
}
await b.close()
