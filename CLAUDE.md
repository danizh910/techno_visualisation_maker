# CLAUDE.md – Projektwissen für Claude Code

## Projekt
TECHNO//VIZ: Browser-Groovebox für Berlin Techno, Hard Groove und Bounce, für Einsteiger. Jede Spur ist
eine Skulptur im 3D-Raum (Szenen Halle/Linien/Studio, monochrom + eine Akzentfarbe), Position = Raum-Mix.
Live: https://techno-visualisation-maker.vercel.app (Vercel, Git-Deploy von `main`).
Sprache der Oberfläche und Kommentare: **Deutsch**.

## Befehle
- `npm install` – Abhängigkeiten
- `npm run dev` – Dev-Server auf http://localhost:5173
- `npm run typecheck` – TypeScript prüfen (muss fehlerfrei sein)
- `npm run build` – Typecheck + Produktions-Build nach `dist/`
- Windows PowerShell 5 kennt `&&` nicht → Befehle einzeln ausführen oder `;` nutzen.

## Stack
Vite 8 + TypeScript 5 (strict), **kein UI-Framework** (DOM-Helfer `h()` in `src/ui/dom.ts`),
Tone.js 15 (Audio), three.js 0.187 (3D, UnrealBloom). Node ≥ 20.19 nötig.

## Architektur
```
src/types.ts              Datenmodell v2: Project, Track (swing, sidechain, locked, macros, euclid), Step (prob)
src/store.ts              Zustand + Event-Bus + Autosave, validateProject (Migration v1→v2), Sound-Bibliothek
src/music.ts              Tonleitern, Notennamen, rootMidi(key, octave)
src/groove.ts             Notation drum()/mel(), STYLES-Regeln, generate/mutate/euclid, buildSong (Loop → Track)
src/presets.ts            Genre-Presets (Berlin Rumble, Hard Groove, Bounce vorne)
src/audio/instruments.ts  INSTRUMENTS (Schemas, `macro`-Tags), applyMacros, randomSound, Voice-Klassen
src/audio/engine.ts       Engine: Spur-Kanäle, Mixer, Hall/Delay-Busse, Master, Sequencer-Tick, Raum-Mix
src/audio/export.ts       renderAudio (Tone.Offline, geseedeter Zufall, Event-Protokoll), WAV-Encoder
src/video.ts              Video-Export: Frames mit fester Zeit → Mediabunny (MP4, Fallback WebM)
src/viz/scene.ts          Scene3D: LOOKS, Rollen pro Instrument, Auto-Kamera (autoCam), step(dt,t) öffentlich
src/ui/*.ts               sequencer, pianoRoll, mixer, soundEditor, arrangement
src/main.ts               Verdrahtung: Layout, Topbar, Tabs, Tastatur, Start-Bildschirm, Export
```

### Wichtige Muster
- **Store-Events**: `project` (alles neu), `tracks` (hinzu/weg), `track` (Parameter, payload = id),
  `steps`, `pattern`, `song`, `transport`, `master`, `selection`, `playstate` (jeder Step!), `position`.
  UI-Module rendern bei Events komplett neu (`keepScroll` erhält Scrollposition).
  Bei `track`-Events wird nicht neu gerendert, solange der Nutzer einen Regler im selben Bereich
  bedient (`editingIn(root)`) – sonst bricht das Ziehen ab. Regler geben nach `change` den Fokus ab.
- **Engine** baut alle Tone-Knoten im aktuellen Kontext → dieselbe Klasse läuft live und offline.
  Keine globalen Tone-Busse (`Channel.send`) verwenden, die brechen den Offline-Export.
- Kette pro Spur: `Voice → Filter → Distortion → PanVol → Master` (+ Sends zu Reverb/Delay).
  Master: `Compressor → Volume → Limiter → Destination` (+ FFT/Waveform live).
- Sequencer: `transport.scheduleRepeat(tick, '16n')`; Pattern pro Takt über `patternForBar(bar)`.
  Visuelles immer über `Tone.getDraw().schedule(cb, time)`.
- Melodische Steps: `note` = Halbtöne (0..24) über Grundton `rootMidi(project.key, params.octave)`.
- Acid: `slide` am vorherigen Step → `setNote` mit Portamento statt neuem Anschlag.
- Makros: Experten-Werte (`track.params`) bleiben unverändert, `applyMacros` rechnet beim Setzen der Voice drauf.
- Swing/Sidechain/Chance laufen im Engine-Tick (Transport-Swing ist 0). Song-Edits über `store.setSong`,
  damit `songFilter` gleich lang bleibt.
- Lokal ist Node 20.11 zu alt für Vite 8 → portable Node 22 nutzen.
- Tests: `python scripts/smoke_test.py URL`, `python scripts/video_test.py URL` (braucht installiertes Chrome).

### Neues Instrument hinzufügen
1. `InstrumentType` in `src/types.ts` erweitern.
2. Eintrag in `INSTRUMENTS` + `INSTRUMENT_ORDER` (`src/audio/instruments.ts`) mit Parametern.
3. Voice-Klasse (implements `Voice`: `output`, `set`, `trigger`, `dispose`) + Fall in `createVoice`.
4. Geometrie in `geometryFor()` und Rolle in `ROLE` (`src/viz/scene.ts`).
5. Regeln in `STYLES[...].rules` (`src/groove.ts`), mindestens unter `classic`.

## Konventionen
- Strikte Typen, keine ungenutzten Variablen (tsc bricht sonst ab).
- localStorage-Zugriffe immer in try/catch.
- Vor jedem Commit: `npm run build`.
- Debug im Browser: `window.__tvm` = `{ store, engine, scene, Tone }`.
