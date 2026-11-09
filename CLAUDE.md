# CLAUDE.md – Projektwissen für Claude Code

## Projekt
TECHNO//VIZ: Browser-Tool zum Bauen von Techno-Tracks (alle Genres). Jede Spur ist ein leuchtendes
3D-Objekt im Raum, das in Echtzeit zum Beat pulsiert, frei verschoben werden kann und dessen Position
den Mix beeinflusst (Raum-Mix). Sprache der Oberfläche und Kommentare: **Deutsch**.

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
src/types.ts              Datenmodell: Project, Track, Pattern, Step (16 Steps)
src/store.ts              Globaler Zustand + Event-Bus (store.on/emit) + Autosave (localStorage)
src/music.ts              Tonleitern, Notennamen, rootMidi(key, octave)
src/presets.ts            8 Genre-Presets, Pattern-Kurzschreibweise drum()/mel(), Zufalls-Patterns
src/audio/instruments.ts  INSTRUMENTS (Parameter-Schemas = Sound-Design-Maske) + Voice-Klassen
src/audio/engine.ts       Engine: Spur-Kanäle, Mixer, Hall/Delay-Busse, Master, Sequencer-Tick, Raum-Mix
src/audio/export.ts       WAV-Export: eigene Engine in Tone.Offline, 16-bit-WAV-Encoder
src/viz/scene.ts          Scene3D: Objekte pro Spur, Step-Ring, Spektrum, Laser, Drag&Drop, Auswahl
src/viz/club.ts           ClubScene: realistischer Club-Raum (lazy geladen, eigener Chunk), Lichter je Spur
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

### Neues Instrument hinzufügen
1. `InstrumentType` in `src/types.ts` erweitern.
2. Eintrag in `INSTRUMENTS` + `INSTRUMENT_ORDER` (`src/audio/instruments.ts`) mit Parametern.
3. Voice-Klasse (implements `Voice`: `output`, `set`, `trigger`, `dispose`) + Fall in `createVoice`.
4. Geometrie in `geometryFor()` (`src/viz/scene.ts`).
5. Optional Dichte in `randomDrumSteps` (`src/presets.ts`).

### Club-Ansicht (`src/viz/club.ts`)
- Umschalter „◉ Objekte / ▣ Club-Raum" im Szenen-Overlay; Wahl in localStorage (`tvm-view`).
- Nur eine Szene rendert gleichzeitig (`setActive`). Club wird per `import()` erst bei Bedarf geladen.
- Alles prozedural (Canvas-Texturen, keine Assets). Mapping: Kick → Crowd/Membranen/Boden,
  Snare/Clap → Strobo (nur wenn aktiviert), Hats → Moving-Head-Flackern, Bass/Acid → Laser,
  Stab/FM → LED-Wand, Pad → Wash-Farben, FX → Spiegelkugel/Dunst. Moving Heads tragen Spurfarben.
- Performance: nur vordere 6 Moving Heads sind echte SpotLights (2 + Spiegelkugel mit Schatten),
  Lichtkegel sind additive Shader. Adaptive Auflösung, bei sehr wenig FPS Schatten aus.

## Konventionen
- Strikte Typen, keine ungenutzten Variablen (tsc bricht sonst ab).
- localStorage-Zugriffe immer in try/catch.
- Vor jedem Commit: `npm run build`.
- Debug im Browser: `window.__tvm` = `{ store, engine, scene, Tone }`.
