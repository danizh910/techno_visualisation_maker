"""Smoke-Test für TECHNO//VIZ (Playwright, Chromium).

Aufruf:  python scripts/smoke_test.py [URL] [Screenshot-Ordner]
Standard-URL: http://localhost:4173  (vorher `npm run build` + `npx vite preview --port 4173`)
"""
import sys
import functools
print = functools.partial(print, flush=True)
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None

CHECKS = r"""
() => {
  const { groove, validateProject, store } = window.__tvm;
  const out = [];
  const ok = (cond, msg) => { if (!cond) out.push(msg); };
  const on = (arr) => arr.map((x, i) => (x === true || x.on) ? i : -1).filter((i) => i >= 0).join(',');
  ok(on(groove.euclid(4, 0)) === '0,4,8,12', 'euclid 4');
  ok(groove.euclid(5, 0).filter(Boolean).length === 5, 'euclid 5 count');
  ok(on(groove.euclid(4, 1)) === '1,5,9,13', 'euclid rot');
  const scale = [0, 2, 3, 5, 7, 8, 10];
  for (const style of ['berlin', 'hardgroove', 'bounce', 'classic']) {
    for (let i = 0; i < 40; i++) {
      const k = groove.generate(style, 'kick', scale);
      ok([0, 4, 8, 12].every((j) => k[j].on), `kick 4/4 ${style}`);
      const m = groove.mutate(k, style, 'kick', scale, 1);
      ok([0, 4, 8, 12].every((j) => m[j].on), `mutate keeps kick ${style}`);
      const b = groove.generate(style, 'bass', scale);
      ok(b.every((s) => !s.on || scale.includes(s.note % 12)), `bass in scale ${style}`);
    }
  }
  const v1 = validateProject({ version: 1, name: 'alt', bpm: 128, swing: 0.3, key: 0, scale: 'minor',
    tracks: [{ id: 'h1', type: 'hat', name: 'Hat', color: '#08d9d6', params: {}, pos: { x: 1, z: 1 } }],
    patterns: [{ steps: { h1: [{ on: true, vel: 1, note: 0, accent: false, slide: false }] } }], song: [0],
    master: {} });
  ok(v1 && v1.version === 2, 'migration version');
  ok(v1 && v1.tracks[0].swing === 0.3, 'migration swing');
  ok(v1 && v1.patterns[0].steps.h1[0].prob === 1 && v1.patterns[0].steps.h1.length === 16, 'migration steps');
  ok(v1 && v1.tracks[0].macros.tone === 0.5, 'migration macros');
  ok(store.project.tracks.length > 3, 'preset loaded');
  return out;
}
"""

errors = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function('window.__tvm && window.__tvm.store.project.tracks.length > 0')
    print('Projekt:', page.evaluate('window.__tvm.store.project.name'))

    failed = page.evaluate(CHECKS)
    print('Logik-Checks:', 'OK' if not failed else failed)

    # Abspielen per echtem Klick (Audio braucht Nutzer-Geste)
    page.click('.btn.play')
    page.wait_for_timeout(2500)
    st = page.evaluate('({ playing: window.__tvm.store.playing, step: window.__tvm.store.playStep, ctx: window.__tvm.Tone.getContext().state })')
    print('Wiedergabe:', st)
    if not (st['playing'] and st['step'] >= 0 and st['ctx'] == 'running'):
        failed.append('playback')

    # Sperren + Würfeln: gesperrte Spur bleibt gleich
    before = page.evaluate("""() => { const s = window.__tvm.store; const t = s.project.tracks[1]; t.locked = true; return JSON.stringify(s.steps(t.id)); }""")
    page.keyboard.press('r')
    after = page.evaluate("() => JSON.stringify(window.__tvm.store.steps(window.__tvm.store.project.tracks[1].id))")
    print('Sperren:', 'OK' if before == after else 'FEHLER')
    if before != after:
        failed.append('lock')
    page.keyboard.press('m')

    if SHOTS:
        for name in ['halle', 'linien', 'studio']:
            page.evaluate(f"() => {{ window.__tvm.store.project.scene = '{name}'; window.__tvm.store.emit('look'); }}")
            page.wait_for_timeout(700)
            page.screenshot(path=f'{SHOTS}/{name}.png')
        page.evaluate("() => { window.__tvm.store.project.scene = 'halle'; window.__tvm.store.emit('look'); }")

    # Software-WebGL (CI) blockiert sonst den Main-Thread, auf dem Tone offline taktet
    page.evaluate('() => window.__tvm.scene.pauseLoop(true)')

    # Loop -> Track
    page.evaluate("() => { const s = window.__tvm.store; window.__tvm.groove.buildSong(s.project, 2); s.emit('project'); }")
    song = page.evaluate('({ n: window.__tvm.store.project.song.length, f: window.__tvm.store.project.songFilter.length })')
    print('Loop -> Track:', song)
    if song['n'] != 72 or song['f'] != 72:
        failed.append('buildSong')

    # WAV-Export (2 Takte mit Filterfahrt)
    size = page.evaluate("async () => (await window.__tvm.renderToWav(window.__tvm.store.project, [4, 5], [0.3, 1])).size")
    print('WAV-Export Bytes:', size)
    if size < 100_000:
        failed.append('wav')

    page.click('.btn.play')
    if SHOTS:
        page.screenshot(path=f'{SHOTS}/ui.png')
    browser.close()

relevant = [e for e in errors if 'fonts.g' not in e]
print('Konsolenfehler:', relevant or 'keine')
if failed or relevant:
    print('FEHLGESCHLAGEN:', failed)
    sys.exit(1)
print('ALLES OK')
