import { open, shot, render, calls, log } from './harness.mjs'
const tag = process.argv[2] ?? 'a'
const idx = +(process.argv[3] ?? 1)
const { browser, page } = await open({ w: 500, h: 450 })
log('ouvert')
const btns = await page.$$('button.choose')
await btns[idx].click()
await page.waitForFunction(() => !document.querySelector('.label'), null, { timeout: 120000, polling: 1000 })
await page.waitForTimeout(1500)
await page.evaluate(() => window.__pump(3))
await render(page)
await page.click('#play')
await page.waitForFunction(() => document.querySelector('#legend'), null, { timeout: 120000, polling: 1000 })
await page.waitForTimeout(1500)
await page.evaluate(() => window.__pump(3))
await render(page)
log('arène')
// Repos : la traîne se pose.
await page.evaluate(() => window.__pump(180))
log('calls repos', JSON.stringify(await calls(page)))
// Sprint vers la gauche de l'écran (profil), puis capture en pleine course.
await page.keyboard.down('q')
await page.keyboard.down('Shift')
await shot(page, `${tag}-sprint`, 70)
await page.keyboard.up('Shift')
await page.keyboard.up('q')
// Combo : trois attaques, capture pendant la troisième.
await page.evaluate(() => window.__pump(40))
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('j')
  await page.evaluate(() => window.__pump(16))
}
await shot(page, `${tag}-attaque`, 4)
await browser.close()
