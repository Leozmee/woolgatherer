// Harnais de capture : charge l'app, pompe la simulation, capture.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

export const OUT = '/tmp/claude-0/-home-user-woolgatherer/f4102224-be96-5acf-8a3b-e16b299294c9/scratchpad/shots'

export async function open({ w = 500, h = 450 } = {}) {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  page.setDefaultTimeout(240000)
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300))
  })
  await page.goto('http://127.0.0.1:5182/', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForFunction(() => window.__scene && window.__gl && document.querySelectorAll('.label').length >= 6, null, { timeout: 300000, polling: 2000 })
  await installPump(page)
  await freeze(page)
  return { browser, page }
}

/** Coupe la boucle de rendu : on n'avance plus qu'à la main (`__pump`, `__advance`). */
export async function freeze(page) {
  await page.evaluate(() => window.__scene.__r3f.root.getState().setFrameloop('never'))
}

export const log0 = Date.now()
export const log = (...a) => console.log(((Date.now() - log0) / 1000).toFixed(1).padStart(6), ...a)

export async function installPump(page) {
  await page.evaluate(() => {
    window.__pump = (n, dt = 1 / 60, each) => {
      const st = window.__scene.__r3f.root.getState()
      for (let k = 0; k < n; k++) {
        if (each) each(k)
        const subs = st.internal.subscribers.slice()
        for (const s of subs) if (s.priority <= 0) s.ref.current(s.store.getState(), dt, undefined)
      }
    }
  })
}

/** Pompe n images (sans rendu), puis deux vraies images, puis capture. */
export async function shot(page, name, pump = 0) {
  if (pump) await page.evaluate((n) => window.__pump(n), pump)
  await render(page)
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 })
  log('shot', name)
}

/** Une image rendue, sans faire avancer la simulation (pas de temps nul). */
export async function render(page) {
  await page.evaluate(() => {
    const st = window.__scene.__r3f.root.getState()
    // Horloge recalée : `advance` avancerait sinon de tout le temps écoulé.
    st.clock.elapsedTime = st.clock.elapsedTime
    window.__advance(st.clock.elapsedTime + 1 / 60)
  })
}

export async function calls(page) {
  return page.evaluate(() => {
    const gl = window.__gl
    gl.info.autoReset = false
    gl.info.reset()
    const st = window.__scene.__r3f.root.getState()
    window.__advance(st.clock.elapsedTime + 1 / 60)
    const c = gl.info.render.calls
    const t = gl.info.render.triangles
    gl.info.autoReset = true
    return { calls: c, triangles: t }
  })
}
