import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const pg = await b.newPage({ viewport: { width: 440, height: 520 } })
pg.on('pageerror', e => console.log('PAGEERR', e.message))
await pg.goto('http://127.0.0.1:5173/')
await pg.waitForSelector('button.choose', { timeout: 120000 })
const names = await pg.$$eval('.label .name', els => els.map(e => e.textContent + ''))
const subs = await pg.$$eval('.label .sub', els => els.map(e => e.textContent + ''))
console.log(names.map((n, i) => n + ' / ' + subs[i]).join('\n'))
for (const i of [0, 3]) {
  await pg.evaluate((i) => document.querySelectorAll('button.choose')[i].click(), i)
  await pg.waitForTimeout(7000)
  await pg.evaluate(() => { window.__turntable.yaw = Math.PI; window.__turntable.pitch = 0.15 })
  await pg.waitForTimeout(6000)
  await pg.screenshot({ path: `z_${i}.png`, timeout: 180000 })
  console.log(i, await pg.evaluate(() => [window.__err?.message, window.__cap]))
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(4000)
}
await b.close()
