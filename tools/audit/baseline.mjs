import { open, shot, calls, render, log, OUT } from './harness.mjs'
import fs from 'node:fs'
fs.mkdirSync(OUT, { recursive: true })
const tag = process.argv[2] ?? 'base'
const only = process.argv[3] // index de la poupée à choisir (optionnel)
const skipBoard = process.argv[4] === 'noboard'

const { browser, page } = await open({ w: 900, h: 640 })
log('ouvert')
if (!skipBoard) {
  await shot(page, `${tag}-board`, 240)
  log('board', JSON.stringify(await calls(page)))
}

if (only !== undefined) {
  await page.setViewportSize({ width: 500, height: 450 })
  const btns = await page.$$('button.choose')
  await btns[+only].click()
  // Nouvelle poupée en qualité pleine : attendre son montage.
  await page.waitForFunction(() => !document.querySelector('.label'), null, { timeout: 120000, polling: 1000 })
  await page.waitForTimeout(2000)
  await page.evaluate(() => window.__pump(5))
  await render(page)
  log('présentation montée')
  await shot(page, `${tag}-pres-front`, 300)
  log('pres', JSON.stringify(await calls(page)))
  for (const [yaw, nm] of [[Math.PI, 'back'], [Math.PI / 2, 'side'], [-Math.PI / 2, 'side2'], [Math.PI * 0.75, 'back34']]) {
    await page.evaluate((y) => { window.__turntable.yaw = y; window.__turntable.vYaw = 0 }, yaw)
    await shot(page, `${tag}-pres-${nm}`, 240)
  }
}
await browser.close()
