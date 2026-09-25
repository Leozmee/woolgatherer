import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })
const pg = await b.newPage({ viewport: { width: 300, height: 300 } })
await pg.goto('http://127.0.0.1:5173/')
await pg.waitForSelector('button.choose', { timeout: 90000 })
const names = await pg.$$eval('.label .name', els => els.map(e => e.textContent))
await pg.locator('button.choose').nth(names.indexOf('ÉCHARPE')).click({ timeout: 60000 })
await pg.waitForTimeout(8000)
const r = await pg.evaluate(() => {
  const out = []
  window.__scene.traverse((o) => {
    const g = o.geometry
    if (!o.isMesh || !g?.attributes?.position) return
    if (g.attributes.position.count !== 74 * 57) return
    const pos = g.attributes.position
    const rows = []
    for (const i of [0, 17, 18, 43, 44, 50, 60, 73]) {
      const k = i * 57 + 28
      const v = { x: pos.getX(k), y: pos.getY(k), z: pos.getZ(k) }
      rows.push(`${i}:(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`)
    }
    out.push(o.parent?.position?.y?.toFixed(2) + ' ' + rows.join(' '))
  })
  return out
})
console.log(r.join('\n'))
await b.close()
