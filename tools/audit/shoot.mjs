// Usage: node shoot.mjs <prefix> [mode] [arg] [arg2]
// modes: board [n gen] | close <idx> | arena <idx> <states,comma>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const [,, prefix = 'x', mode = 'board', arg = '0', arg2 = ''] = process.argv
const OUT = '/tmp/claude-0/-home-user-woolgatherer/f4102224-be96-5acf-8a3b-e16b299294c9/scratchpad/shots/'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: +(process.env.VW || 900), height: +(process.env.VH || 640) } })
page.setDefaultTimeout(240000)
const logs = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()) })
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
await page.goto('http://127.0.0.1:5184/', { waitUntil: 'load' })
await page.waitForSelector('button.choose', { timeout: 240000 })
const wait = (ms) => page.waitForTimeout(ms)
await wait(8000)
const calls = async () =>
  page.evaluate(() => {
    const gl = window.__gl
    gl.info.autoReset = false
    gl.info.reset()
    return new Promise((r) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const c = gl.info.render.calls
          gl.info.autoReset = true
          r(c)
        }),
      ),
    )
  })
if (mode === 'board') {
  for (let i = 0; i < +arg; i++) {
    await page.click('#generate')
    await wait(10000)
  }
  await wait(4000)
  await page.screenshot({ path: OUT + prefix + '-board.png' })
  console.log('names', await page.$$eval('.label .name', (e) => e.map((x) => x.textContent)))
  console.log('calls board', await calls())
} else if (mode === 'close') {
  const idxs = arg.split(',')
  for (const idx of idxs) {
    const btns = await page.$$('button.choose')
    await btns[+idx].click()
    await wait(8000)
    console.log('calls presentation', await calls())
    await page.evaluate(([d, py]) => {
      const t = window.__turntable
      t.idle = false
      t.vYaw = 0
      t.yaw = 0
      t.pitch = 0.02
      t.distance = d
      t.panY = py
    }, [+(process.env.DIST || 1.9), +(process.env.PANY || 0.45)])
    await wait(5000)
    await page.screenshot({ path: OUT + prefix + idx + '-front.png' })
    await page.evaluate(() => {
      const t = window.__turntable
      t.yaw = 0.6
      t.vYaw = 0
    })
    await wait(5000)
    await page.screenshot({ path: OUT + prefix + idx + '-3q.png' })
    if (arg2 === 'side') {
      await page.evaluate(() => {
        const t = window.__turntable
        t.yaw = 1.35
        t.vYaw = 0
      })
      await wait(5000)
      await page.screenshot({ path: OUT + prefix + idx + '-side.png' })
    }
    await page.keyboard.press('Escape')
    await page.waitForSelector('button.choose', { timeout: 240000 })
    await wait(6000)
  }
} else if (mode === 'arena') {
  const btns = await page.$$('button.choose')
  await btns[+arg].click()
  await wait(6000)
  await page.click('#play')
  await wait(8000)
  console.log('calls arena', await calls())
  await page.evaluate(([d, pt]) => {
    const t = window.__turntable
    t.distance = d
    t.pitch = pt
    t.yaw = 0
  }, [+(process.env.ADIST || 4.4), +(process.env.APITCH || 0.05)])
  await wait(3000)
  // Temps de jeu : `time` est privé en TypeScript seulement.
  const advance = async (T) => {
    await page.evaluate(() => {
      window.__t0 = window.__fighter.time
      window.__fighter.speed = 1
    })
    await page.waitForFunction((T) => window.__fighter.time - window.__t0 >= T, T, { polling: 50, timeout: 600000 })
    await page.evaluate(() => {
      window.__fighter.speed = 0
    })
  }
  const steps = (arg2 || 'idle@0.3').split(',')
  let k = 0
  for (const st of steps) {
    const [name, T = '0.3'] = st.split('@')
    const presses = name === 'combo' ? ['attack', 'attack', 'attack'] : name === 'idle' || name === 'wait' ? [] : [name]
    for (let i = 0; i < presses.length; i++) {
      await page.evaluate((p) => window.__fighter.press(p), presses[i])
      if (i < presses.length - 1) await advance(0.22)
    }
    await advance(+T)
    if (name === 'wait') continue
    await wait(2500)
    console.log(name, await page.evaluate(() => window.__fighter.current))
    await page.screenshot({ path: OUT + prefix + '-arena-' + k++ + '-' + name + '.png' })
  }
}
console.log(logs.slice(0, 10).join('\n'))
await browser.close()
