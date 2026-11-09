"""Test für App-Installation, Offline-Betrieb und Qualitätsstufen (Playwright, echtes Chrome).

Aufruf:  python scripts/app_test.py [URL]
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
failed = []

FPS = """async (mode) => {
  const s = window.__tvm.scene;
  s.setQualityMode(mode);
  await new Promise((r) => setTimeout(r, 1500));
  let n = 0; const t0 = performance.now();
  await new Promise((done) => { const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  return { fps: Math.round(n / ((performance.now() - t0) / 1000)), quality: s.quality, px: s.renderer.domElement.width };
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function('window.__tvm && window.__tvm.store.project.tracks.length > 0')

    man = page.evaluate("async () => (await fetch('./manifest.webmanifest')).json()")
    print('Manifest:', man['name'], man['display'], [i['sizes'] for i in man['icons']])
    if man['display'] != 'standalone':
        failed.append('manifest')

    page.wait_for_function('navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true)', timeout=15000)
    page.evaluate('() => navigator.serviceWorker.ready')
    page.reload()  # jetzt kontrolliert der SW die Seite und füllt den Cache
    page.wait_for_function('window.__tvm && navigator.serviceWorker.controller !== null', timeout=15000)
    page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload()
    page.wait_for_function('window.__tvm && window.__tvm.store.project.tracks.length > 0', timeout=15000)
    print('Offline-Neuladen: OK')
    ctx.set_offline(False)

    page.click('.btn.play')
    for mode in [2, 1, 0]:
        r = page.evaluate(FPS, mode)
        print(f'Qualität {mode}:', r)
        if r['quality'] != mode:
            failed.append(f'quality {mode}')
    label = page.evaluate("() => [...document.querySelectorAll('.chip')].map((c) => c.textContent).find((t) => t.startsWith('Qualität'))")
    print('Chip:', label)
    b.close()

print('Seitenfehler:', errors or 'keine')
if failed or errors:
    print('FEHLGESCHLAGEN:', failed)
    sys.exit(1)
print('ALLES OK')
