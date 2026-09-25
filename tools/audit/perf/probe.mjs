// Mesure GPU/CPU de woolgatherer : planche → présentation → arène, pour chaque poupée.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import fs from 'node:fs'

const OUT = '/tmp/claude-0/-home-user-woolgatherer/f4102224-be96-5acf-8a3b-e16b299294c9/scratchpad/perf'
const URL = 'http://audit.local/'
const APP = OUT + '/app'
const ONLY = process.argv[2] ? process.argv[2].split(',').map(Number) : [0, 1, 2, 3, 4, 5]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LOGF = '/tmp/claude-0/-home-user-woolgatherer/f4102224-be96-5acf-8a3b-e16b299294c9/scratchpad/perf/probe.log'
const log = (...a) => { const l = [new Date().toISOString().slice(11, 19), ...a].join(' '); console.log(l); fs.appendFileSync(LOGF, l + '\n') }

// Instrumentation posée avant tout script de la page.
const INIT = () => {
  const W = window
  W.__lt = []
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) W.__lt.push({ t: e.startTime, d: e.duration })
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
  W.__glc = { link: 0, linkMs: 0, compile: 0, tex: 0, texBytes: 0, texMs: 0, texList: [] }
  for (const C of [W.WebGL2RenderingContext, W.WebGLRenderingContext]) {
    if (!C) continue
    const P = C.prototype
    const link = P.linkProgram
    P.linkProgram = function (p) {
      const t = performance.now()
      const r = link.call(this, p)
      W.__glc.link++
      W.__glc.linkMs += performance.now() - t
      return r
    }
    const comp = P.compileShader
    P.compileShader = function (s) {
      W.__glc.compile++
      return comp.call(this, s)
    }
    const gpp = P.getProgramParameter
    P.getProgramParameter = function (p, n) {
      const t = performance.now()
      const r = gpp.call(this, p, n)
      W.__glc.linkMs += performance.now() - t
      return r
    }
    for (const fn of ['texSubImage2D', 'texStorage2D', 'compressedTexImage2D']) {
      const o = P[fn]
      if (!o) continue
      P[fn] = function (...a) {
        const t = performance.now()
        const r = o.apply(this, a)
        const dt = performance.now() - t
        let w = 0, h = 0
        if (fn === 'texStorage2D') { w = a[3]; h = a[4] }
        else { const src = a[a.length - 1]; if (src && typeof src === 'object' && 'width' in src && !ArrayBuffer.isView(src)) { w = src.width; h = src.height } else { w = a[4]; h = a[5] } }
        if (fn !== 'texStorage2D') { W.__glc.tex++; W.__glc.texBytes += w * h * 4; W.__glc.texMs += dt }
        if (fn !== 'texStorage2D' && w * h >= 256 * 256) W.__glc.texList.push(`${fn}:${w}x${h}:${dt.toFixed(1)}ms`)
        return r
      }
    }
    const tex = P.texImage2D
    P.texImage2D = function (...a) {
      const t = performance.now()
      const r = tex.apply(this, a)
      const dt = performance.now() - t
      const src = a[a.length - 1]
      let w = 0, h = 0
      if (src && typeof src === 'object' && 'width' in src && 'height' in src && !(ArrayBuffer.isView(src))) {
        w = src.width; h = src.height
      } else if (a.length >= 9) { w = a[3]; h = a[4] }
      W.__glc.tex++
      W.__glc.texBytes += w * h * 4
      W.__glc.texMs += dt
      if (w * h >= 256 * 256) W.__glc.texList.push(`${w}x${h}:${dt.toFixed(1)}ms`)
      return r
    }
  }
}

// Dans la page : compte d'une image, ventilé par passe.
const FRAME_PROBE = async (nFrames) => {
  const gl = window.__gl
  const info = gl.info
  info.autoReset = false
  const frames = []
  let cur = null
  const origRender = gl.render
  const origShadow = gl.shadowMap.render
  const snap = () => ({ c: info.render.calls, t: info.render.triangles })
  const start = () => { cur = { passes: [], shadow: { c: 0, t: 0 }, calls: 0, tris: 0 }; }
  start()
  gl.shadowMap.render = function (...a) {
    const s0 = snap()
    const r = origShadow.apply(this, a)
    const s1 = snap()
    cur.shadow.c += s1.c - s0.c
    cur.shadow.t += s1.t - s0.t
    return r
  }
  gl.render = function (scene, camera) {
    const s0 = snap()
    const target = gl.getRenderTarget()
    const r = origRender.call(this, scene, camera)
    const s1 = snap()
    const name = scene === window.__scene ? (target ? 'scene→rt' : 'scene') : (scene.isScene ? 'overlay' : (scene.type || 'obj'))
    cur.passes.push({ name, c: s1.c - s0.c, t: s1.t - s0.t, cam: camera.type })
    if (scene.isScene && scene !== window.__scene && scene.children.length === 1 && scene.children[0].material?.uniforms?.tDepth) {
      // passe finale de l'encre : fin d'image
      cur.calls = cur.passes.reduce((s, p) => s + p.c, 0)
      cur.tris = cur.passes.reduce((s, p) => s + p.t, 0)
      frames.push(cur)
      start()
    }
    return r
  }
  const t0 = performance.now()
  while (frames.length < nFrames && performance.now() - t0 < 60000) await new Promise((r) => requestAnimationFrame(r))
  gl.render = origRender
  gl.shadowMap.render = origShadow
  info.autoReset = true
  const last = frames[frames.length - 1]
  return {
    frames: frames.length,
    calls: last?.calls,
    tris: last?.tris,
    shadow: last?.shadow,
    passes: last?.passes,
    programs: gl.info.programs?.length,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
  }
}

const BREAKDOWN = () => {
  const agg = {}
  let objects = 0, hidden = 0, meshes = 0
  const visibleChain = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true }
  window.__scene.traverse((o) => {
    objects++
    if (!o.visible) hidden++
    if (!o.isMesh || !visibleChain(o)) return
    meshes++
    const g = o.geometry, m = o.material
    const base = (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3
    const inst = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1
    const key = `${m.type}|${m.customProgramCacheKey?.() || ''}|${g.attributes.aShell ? 'coques' : g.type}${m.defines && 'TOON_HAIR' in m.defines ? '|cheveux' : ''}`
    const e = (agg[key] ??= { draws: 0, tris: 0, shadow: 0 })
    e.draws++
    e.tris += base * inst
    if (o.castShadow) e.shadow++
  })
  const top = Object.entries(agg).sort((a, b) => b[1].tris - a[1].tris).slice(0, 14).map(([k, v]) => `${k}: ${v.draws} dessins, ${Math.round(v.tris / 1000)}k tri, ${v.shadow} ombre`)
  return { objects, hidden, meshes, top }
}

// Dans la page : temps JS de chaque abonné useFrame sur n images.
const CPU_PROBE = async (nFrames) => {
  const scene = window.__scene
  let store = null
  scene.traverse((o) => { if (!store && o.__r3f?.root) store = o.__r3f.root })
  const subs = store.getState().internal.subscribers
  const classify = (src) => {
    const k = [
      ['Doll', 'fighter.update('], ['Scarf', 'writeSheet('], ['Necklace', 'drop.anchor('],
      ['Hairdo', 'built.movers'], ['Locks', 'chain[i].update'], ['Rig', 'stepTurntable('],
      ['Outline', 'pass.overlay'], ['KeepPrograms', 'pinned'], ['Lights', 'KEY[0]'],
      ['Controls', 'getGamepads'], ['WeaponTrail', 'lastTip'], ['Dust', 'puffs.splice'],
      ['Ghosts', 'ghostRequest'], ['ContactShadows', 'renderTarget'], ['Html', 'getBoundingClientRect'],
    ]
    for (const [n, s] of k) if (src.includes(s)) return n
    return 'other:' + src.slice(0, 60).replace(/\s+/g, ' ')
  }
  const acc = {}
  const saved = subs.map((s) => s.ref)
  subs.forEach((s) => {
    const orig = s.ref
    const name = classify(String(orig.current))
    s.ref = {
      get current() {
        const f = orig.current
        return (a, b, c) => {
          const t = performance.now()
          f(a, b, c)
          const d = performance.now() - t
          const e = (acc[name] ??= { n: 0, ms: 0, max: 0, subs: new Set() })
          e.ms += d
          e.max = Math.max(e.max, d)
          e.n++
        }
      },
    }
    s.__orig = orig
  })
  let frames = 0
  let render = 0
  const gl = window.__gl
  const origRender = gl.render
  gl.render = function (...a) {
    const t = performance.now()
    const r = origRender.apply(this, a)
    render += performance.now() - t
    return r
  }
  const t0 = performance.now()
  while (frames < nFrames && performance.now() - t0 < 90000) {
    await new Promise((r) => requestAnimationFrame(r))
    frames++
  }
  gl.render = origRender
  subs.forEach((s, i) => { if (s.__orig) { s.ref = s.__orig; delete s.__orig } })
  const out = {}
  let total = 0
  for (const [k, v] of Object.entries(acc)) {
    out[k] = { perFrameMs: +(v.ms / frames).toFixed(3), maxMs: +v.max.toFixed(2), calls: v.n }
    total += v.ms
  }
  return { frames, useFrameMsPerFrame: +(total / frames).toFixed(3), glRenderJsMsPerFrame: +(render / frames).toFixed(2), subs: out }
}

const waitFrames = (page, n) =>
  page.evaluate(async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)) }, n)

const resetCounters = (page) => page.evaluate(() => {
  window.__lt.length = 0
  Object.assign(window.__glc, { link: 0, linkMs: 0, compile: 0, tex: 0, texBytes: 0, texMs: 0, texList: [] })
})
const readCounters = (page) => page.evaluate(() => ({
  longtasks: window.__lt.map((e) => Math.round(e.d)),
  programsLinked: window.__glc.link,
  linkMs: Math.round(window.__glc.linkMs),
  texUploads: window.__glc.tex,
  texMB: +(window.__glc.texBytes / 1048576).toFixed(1),
  texMs: Math.round(window.__glc.texMs),
  bigTex: window.__glc.texList,
}))

const main = async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => log('pageerror', e.message))
  page.on('crash', () => log('PAGE CRASH'))
  browser.on('disconnected', () => log('BROWSER DISCONNECTED'))
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 200)) })
  await page.addInitScript(INIT)
  await page.route('http://audit.local/**', (route) => {
    const u = new globalThis.URL(route.request().url())
    const f = u.pathname === '/' ? '/index.html' : u.pathname
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css' }
    const ext = f.split('.').pop()
    try { route.fulfill({ status: 200, contentType: types[ext] ?? 'application/octet-stream', body: fs.readFileSync(APP + f) }) }
    catch { route.fulfill({ status: 404, body: '' }) }
  })
  const results = { board: null, dolls: [] }

  log('goto')
  await page.goto(URL)
  await page.waitForFunction(() => window.__gl && document.querySelectorAll('button.choose').length === 6, null, { timeout: 180000 })
  await waitFrames(page, 8)
  results.boardLoad = await readCounters(page)
  log('board load', JSON.stringify(results.boardLoad))
  await resetCounters(page)
  results.board = await page.evaluate(FRAME_PROBE, 3)
  log('board', JSON.stringify(results.board))
  results.boardBreakdown = await page.evaluate(BREAKDOWN)
  log('board breakdown', JSON.stringify(results.boardBreakdown))
  results.boardCpu = await page.evaluate(CPU_PROBE, 8)
  log('board cpu', JSON.stringify(results.boardCpu))

  for (const i of ONLY) {
    const r = { i }
    await resetCounters(page)
    await page.locator('button.choose').nth(i).click()
    await page.waitForSelector('#play', { timeout: 60000 })
    await waitFrames(page, 6)
    r.enterPresentation = await readCounters(page)
    r.presentation = await page.evaluate(FRAME_PROBE, 2)
    r.presentBreakdown = await page.evaluate(BREAKDOWN)
    log('doll', i, 'present breakdown', JSON.stringify(r.presentBreakdown))
    r.name = await page.evaluate(() => document.querySelector('.arena-title .name')?.textContent + ' / ' + document.querySelector('.arena-title .sub')?.textContent)
    r.shellNormals = await page.evaluate(() => {
      const out = { withNormal: 0, withoutNormal: 0, meshes: 0, instancedMeshes: 0, castShadow: 0 }
      window.__scene.traverse((o) => {
        if (!o.isMesh) return
        out.meshes++
        if (o.isInstancedMesh) out.instancedMeshes++
        if (o.castShadow && o.visible) out.castShadow++
        const g = o.geometry
        if (g?.isInstancedBufferGeometry && g.attributes.aShell) g.attributes.normal ? out.withNormal++ : out.withoutNormal++
      })
      return out
    })
    log('doll', i, r.name, 'present', JSON.stringify({ ...r.presentation, passes: undefined }), JSON.stringify(r.enterPresentation))

    await resetCounters(page)
    await page.click('#play')
    await page.waitForSelector('#hud', { timeout: 60000 })
    await waitFrames(page, 6)
    r.enterArena = await readCounters(page)
    r.arenaIdle = await page.evaluate(FRAME_PROBE, 2)
    log('doll', i, 'arena idle', JSON.stringify({ ...r.arenaIdle, passes: undefined }), JSON.stringify(r.enterArena))
    r.arenaBreakdown = await page.evaluate(BREAKDOWN)
    log('doll', i, 'arena breakdown', JSON.stringify(r.arenaBreakdown))
    r.arenaIdleCpu = await page.evaluate(CPU_PROBE, 6)
    // Course + sprint + attaques
    await page.keyboard.down('z')
    await page.keyboard.down('Shift')
    const atk = setInterval(() => page.keyboard.press('j').catch(() => {}), 1500)
    await waitFrames(page, 4)
    r.arenaRunCpu = await page.evaluate(CPU_PROBE, 8)
    clearInterval(atk)
    await page.keyboard.up('Shift')
    await page.keyboard.up('z')
    r.arenaRun = await page.evaluate(FRAME_PROBE, 1)
    log('doll', i, 'arena run cpu', JSON.stringify(r.arenaRunCpu))

    await resetCounters(page)
    await page.keyboard.press('Escape')
    await waitFrames(page, 3)
    r.exitArena = await readCounters(page)
    await resetCounters(page)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.querySelectorAll('button.choose').length === 6, null, { timeout: 60000 })
    await waitFrames(page, 8)
    r.backToBoard = await readCounters(page)
    log('doll', i, 'exit arena', JSON.stringify(r.exitArena), 'back to board', JSON.stringify(r.backToBoard))
    results.dolls.push(r)
    fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1))
  }
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1))
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
