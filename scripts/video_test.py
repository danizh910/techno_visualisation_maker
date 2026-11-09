"""Test für Video-Export und Show-Modus (Playwright, Chromium).

Aufruf:  python scripts/video_test.py [URL] [Screenshot-Ordner]
Rendert 2 Takte in 640×360 / 15 fps, lädt das Ergebnis in ein <video> und prüft Dauer und Auflösung.
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None

with sync_playwright() as pw:
    # echtes Chrome (Zielplattform); die Headless-Shell stürzt beim H.264-Encoding ab
    b = pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
    page = b.new_page(viewport={'width': 1280, 'height': 760})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function('window.__tvm && window.__tvm.store.project.tracks.length > 0')

    res = page.evaluate("""async () => {
      const T = window.__tvm;
      const { exportVideo } = await T.video();
      const out = await exportVideo({
        project: T.store.project, sequence: [2, 3], scene: T.scene, width: 640, height: 360, fps: 15,
        signal: { cancelled: false }, onProgress: () => {},
      });
      const url = URL.createObjectURL(out.blob);
      const v = document.createElement('video');
      v.muted = true; v.src = url;
      await new Promise((ok, err) => { v.onloadedmetadata = ok; v.onerror = () => err(new Error('nicht abspielbar')); });
      // Dauer bei WebM ohne Index erst nach Seek bekannt
      if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise((ok) => (v.ondurationchange = ok)); }
      // ein Bild bei 1 s auslesen: darf nicht schwarz sein
      v.currentTime = 1; await new Promise((ok) => (v.onseeked = ok));
      const c = document.createElement('canvas'); c.width = 640; c.height = 360;
      const x = c.getContext('2d'); x.drawImage(v, 0, 0);
      const d = x.getImageData(0, 0, 640, 360).data; let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return { ext: out.ext, size: out.blob.size, w: v.videoWidth, h: v.videoHeight, dur: v.duration, light: Math.round(sum / (d.length / 4) / 3) };
    }""")
    print('Video:', res, flush=True)
    ok = res['w'] == 640 and res['h'] == 360 and res['dur'] > 3 and res['size'] > 20000 and res['light'] > 3

    page.evaluate('() => window.__tvm.setVJ(true)')
    page.wait_for_timeout(1500)
    hidden = page.evaluate("() => getComputedStyle(document.querySelector('.topbar')).display === 'none' && window.__tvm.scene.autoCam")
    print('Show-Modus:', 'OK' if hidden else 'FEHLER', flush=True)
    if SHOTS:
        page.keyboard.press('Space')
        page.wait_for_timeout(2500)
        page.screenshot(path=f'{SHOTS}/show.png')
    page.evaluate('() => window.__tvm.setVJ(false)')
    back = page.evaluate("() => getComputedStyle(document.querySelector('.topbar')).display !== 'none' && !window.__tvm.scene.autoCam")
    print('Show beenden:', 'OK' if back else 'FEHLER', flush=True)
    b.close()

print('Seitenfehler:', errors or 'keine')
if not (ok and hidden and back) or errors:
    sys.exit(1)
print('ALLES OK')
