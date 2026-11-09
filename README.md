# TECHNO//VIZ

Eine Groovebox im Browser für **Berlin Techno, Hard Groove und Bounce**. Jede Spur steht als Skulptur im 3D-Raum: in einer dunklen Betonhalle, als reduzierte Linien-Grafik oder in einem hellen Studio. Wo ein Objekt steht, bestimmt den Mix. Die ganze Show läuft im Vollbild und lässt sich als Video exportieren.

**Live:** <https://techno-visualisation-maker.vercel.app>

Gebaut für Laptop + Chrome + Kopfhörer. Auf dem Handy kann man die Szene anschauen, produzieren ist dort nicht vorgesehen.

### Als App installieren

In Chrome oder Edge auf **„Als App installieren“** in der Szene klicken (oder auf das Installieren-Symbol in der Adressleiste). TECHNO//VIZ läuft dann im eigenen Fenster, hat einen Startmenü-Eintrag und funktioniert nach dem ersten Start auch **offline**. Projekte und Sounds bleiben lokal auf dem Rechner.

## Starten

Beim ersten Öffnen ist das Preset **Berlin Rumble** geladen. Leertaste drücken, dann läuft der Beat.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # Typecheck + statischer Build nach dist/
```

Voraussetzung: Node ≥ 20.19 (Vite 8).

## Ohne Synth-Theorie zu eigenen Beats

| Werkzeug | Was es macht |
| --- | --- |
| **Würfeln** (R) | Neue Patterns für alle ungesperrten Spuren. Sie folgen den Regeln des gewählten **Stils**: die Kick bleibt 4/4, Hats variieren in sinnvollen Mustern, Percussion landet in Tribal-Rastern, Töne bleiben in der Tonart. |
| **Mutieren** (M) | Variiert das aktuelle Pattern leicht. Wie stark, bestimmt der Regler daneben. Kick und Clap behalten ihre Grundschläge. |
| **Sperren** (Schloss) | Gesperrte Spuren lassen Würfeln, Mutieren und Leeren unangetastet. |
| **Euklid** | Pro Spur „Schläge“ und „Verschiebung“ einstellen und sofort tribale Loops bekommen. |
| **Chance pro Step** | Ein Step spielt nur mit 75/50/25 % Wahrscheinlichkeit, so wiederholt sich der Loop nie exakt. Stift-Modus „Chance“ oder Shift+Klick. Steps mit Chance sind schraffiert. |
| **Makros** | Drei Regler pro Spur: **Dunkel ↔ Hell**, **Kurz ↔ Lang**, **Sauber ↔ Dreckig**. Sie bewegen im Hintergrund mehrere Klangparameter gleichzeitig. Doppelklick setzt sie auf neutral. Die Experten-Maske mit allen Parametern ist aufklappbar. |
| **Klang würfeln + Bibliothek** | Würfelt einen neuen Sound in sinnvoller Nähe zum Grundklang. Gute Sounds speicherst du als Favorit; sie stehen dann in jedem Projekt bereit (lokal im Browser). |
| **Loop → Track** | Baut aus dem aktuellen Loop einen ganzen Song: Intro, Aufbau, Main, Break, Build-up mit Filterfahrt und Clap-Roll, Drop, Fills am Phrasenende, Outro. Die Teile landen in den Patterns A–H und lassen sich danach frei bearbeiten. |

## Groove

- **Swing pro Spur**: Hats und Percs geshuffelt, die Kick bleibt gerade. Das ist der Kern von Hard Groove.
- **Sidechain pro Spur**: Bass, Pads und Stabs ducken sich unter die Kick und pumpen.
- **Kick mit Rumble-Modus**: ein dunkler, verhallter, gesättigter Sub-Tail, der unter jedem neuen Schlag weggeduckt wird.
- **Ride** (16tel für Hard Groove) und **Shaker** als zusätzliche Instrumente.
- **Presets** (vorne): **Berlin Rumble** (132 BPM), **Hard Groove** (145 BPM), **Bounce** (140 BPM). Dahinter folgen Peak-Time, Acid, Minimal, Hard Techno, Melodic, Dub, Industrial und Detroit.

## 3D-Show

- **Szenen**: **Halle** (Beton, Nebel, Lichtkegel, weiche Schatten), **Linien** (Wireframes, sehr grafisch) und **Studio** (heller Boden, Galerie-Skulpturen). Fast monochrom mit **einer** Akzentfarbe, die du wählen kannst. Glow ist optional und dezent.
- **Jedes Instrument hat seine Rolle**: Die Kick bewegt die ganze Szene (Licht- und Kamera-Puls), Hats liefern nur feine Details, der Bass bringt Masse und Gewicht, Pads atmen.
- **Qualität** (Chip in der Szene): Auf **Auto** misst die App die Bildrate und schaltet bei Ruckeln selbst eine Stufe runter: Hoch, dann Mittel (weniger Pixeldichte, ein Schattenlicht), dann Niedrig (keine Schatten, kein Nebel). Du kannst die Stufe auch fest wählen, die Wahl wird gemerkt.
- **Bedienung**: Objekt ziehen = Raum-Mix (links/rechts = Panorama, Abstand zur Mitte = Hall), Klick = Sound bearbeiten, im Leeren ziehen = Kamera drehen, Mausrad = Zoom.
- **Show-Modus** (V): blendet die Oberfläche aus, schaltet auf Vollbild und fährt die Kamera automatisch durch fünf Einstellungen.
- **Video-Export**: Track und 3D-Show werden Bild für Bild gerendert. Das dauert länger als der Track, ruckelt dafür nie. Ausgabe als **MP4** (H.264/AAC), falls der Browser es nicht kann als **WebM**. Wählbar sind 720p/1080p und 30/60 fps.

## Tastatur

| Taste | Funktion |
| --- | --- |
| Leertaste | Play / Stopp |
| 1–8 | Pattern A–H |
| R | Würfeln (ungesperrte Spuren) |
| M | Mutieren |
| N | Nächste Szene |
| V | Show-Modus an/aus (Esc beendet) |
| C | Nächste Kamera-Einstellung (im Show-Modus) |
| A W S E D F T G Z/Y H U J K | Gewählte Spur wie ein Keyboard spielen |
| Enter | Gewählte Spur vorhören |
| Rechtsklick / Shift+Klick auf Step | Lautstärke / Chance wechseln |

## Speichern

Das Projekt wird automatisch im Browser gespeichert. **Speichern / Laden** exportiert und importiert eine Projektdatei (`.json`). Projekte aus dem ersten Prototyp lassen sich weiterhin laden; der alte globale Swing wird dabei auf die Spuren verteilt. **WAV** rendert das Pattern (×4) oder den Song offline.

## Technik

Vite + TypeScript ohne UI-Framework, [Tone.js](https://tonejs.github.io) für Synthese und Sequencing, [three.js](https://threejs.org) für die Szene, [Mediabunny](https://mediabunny.dev) für das Video-Muxing (WebCodecs). Alles läuft im Browser: kein Server, keine Datenbank, kein Login. Das Deployment ist statisch auf Vercel.

```
src/
  types.ts              Datenmodell (Projekt v2: Spuren, Patterns, Song + Filterfahrt)
  store.ts              Zustand, Events, Autosave, Migration, Sound-Bibliothek
  groove.ts             Stil-Regeln, Würfeln, Mutieren, Euklid, Loop → Track
  presets.ts            Genre-Presets
  audio/instruments.ts  Instrumente, Parameter-Schemas, Makros, Klang-Würfel
  audio/engine.ts       Mixer, Sequencer (Swing/Chance/Sidechain pro Spur), Master-Filter
  audio/export.ts       Offline-Rendering → WAV, Event-Protokoll für das Video
  video.ts              Frame-genauer Video-Export (MP4/WebM)
  viz/scene.ts          3D-Szenen, Rollen-Animation, Auto-Kamera, Interaktion
  ui/                   Sequencer, Piano-Roll, Mixer, Sound-Editor, Arrangement
scripts/
  smoke_test.py         Playwright: Logik, Wiedergabe, Sperren, Loop → Track, WAV
  video_test.py         Playwright (echtes Chrome): Video-Export + Show-Modus
  app_test.py           Playwright (echtes Chrome): Manifest, Offline-Start, Qualitätsstufen
public/
  manifest.webmanifest, sw.js, icon-*.png   App-Installation + Offline-Cache
```

Die Tests laufen gegen einen laufenden Server: `npm run build`, dann `npx vite preview --port 4173`, dann `python scripts/smoke_test.py`.

## Ideen für später

- MIDI-Controller und MIDI-Export
- Eigene Samples laden
- Patterns länger als 16 Steps, Polyrhythmen
- Automationen pro Spur (bisher nur die Master-Filterfahrt im Song)
