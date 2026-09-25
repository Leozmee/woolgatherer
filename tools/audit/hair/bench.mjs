// Poupée seule, coiffure imposée, captures de près sous plusieurs angles.
// node bench.mjs <style> <seed> <prefix> [yaw,yaw,...] [dist] [panY]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const STYLES = ['auto', 'locks', 'boucles', 'meches', 'chignon', 'houppette', 'epars', 'couettes', 'queue', 'nattes', 'frange']
const style = process.argv[2] || 'meches'
const seed = process.argv[3] || '4413'
const prefix = process.argv[4] || 'bench'
const yaws = (process.argv[5] || '0,1.2,3.14').split(',').map(Number)
const dist = Number(process.argv[6] || 1.6)
const panY = Number(process.argv[7] || 0.55)
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 420, height: 420 } })
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('willReadFrequently')) console.log('console:', m.type(), m.text().slice(0, 300))
})
await page.goto('http://127.0.0.1:5183/', { timeout: 120000 })
await page.waitForSelector('canvas', { timeout: 120000 })
await page.keyboard.press('p')
await page.waitForTimeout(3000)
await page.evaluate(() => { const c = document.getElementById('Planche.gallery'); if (c.checked) c.click() })
await page.waitForTimeout(3000)
await page.fill('#Graine\\.seed', String(seed), { timeout: 240000 })
await page.press('#Graine\\.seed', 'Enter', { timeout: 240000 })
await page.selectOption('#Planche\\.hairStyle', String(STYLES.indexOf(style)), { timeout: 240000 })
await page.waitForTimeout(1500)
await page.keyboard.press('p')
await page.waitForFunction(() => window.__hairs && Object.keys(window.__hairs).length > 0, null, { timeout: 180000 }).catch(() => {})
const info = await page.evaluate(() => {
  const h = Object.values(window.__hairs || {})[0]
  if (!h) return null
  const b = h.built
  const tri = (g) => (g ? (g.index ? g.index.count / 3 : g.attributes.position.count / 3) : 0)
  return { key: Object.keys(window.__hairs)[0], movers: b.movers.length, tris: { yarn: tri(b.yarn), braid: tri(b.braid), ribbon: tri(b.ribbon) } }
})
console.log('hair', JSON.stringify(info))
for (const yaw of yaws) {
  await page.evaluate(([yaw, dist, panY]) => {
    const t = window.__turntable
    t.idle = false; t.vYaw = 0; t.vPitch = 0; t.yaw = yaw; t.pitch = 0.08; t.distance = dist; t.panY = panY; t.panX = 0
  }, [yaw, dist, panY])
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${prefix}_${yaw}.png`, timeout: 600000 })
}
await browser.close()
