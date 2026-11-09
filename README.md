# TECHNO//VIZ – Techno Visualisation Maker

Ein Browser-Tool, mit dem du eigene Techno-Tracks (alle Genres) baust – und dabei **jede Spur als leuchtendes 3D-Objekt im Raum** siehst. Die Objekte pulsieren in Echtzeit zum Beat, lassen sich frei verschieben und nebeneinanderstellen, und ihre Position beeinflusst den Mix.

## Starten

```bash
npm install
npm run dev
```

Dann <http://localhost:5173> öffnen, ein Genre wählen und mit der **Leertaste** abspielen.

Produktions-Build: `npm run build` (Ausgabe in `dist/`, statisch hostbar, z.B. GitHub Pages).

## Funktionen

| Bereich | Was es kann |
| --- | --- |
| **3D-Szene** | Jede Spur = eigenes Neon-Objekt (Kick = Ikosaeder, Bass = Würfel, Acid = Torusknoten …). Pulsiert bei jedem Schlag, hüpft mit der Tonhöhe, 16-Step-Ring mit Lauflicht, Spektrum-Ring, Laser, Bloom-Glow. Ziehen = platzieren, Klick = Sound bearbeiten, Kamera drehen/zoomen, Kamerafahrt. |
| **Raum-Mix** | Links/rechts im Raum = Panorama, Entfernung zur Mitte = mehr Hall. So „siehst“ du deinen Mix. |
| **12 Synth-Instrumente** | Kick, Snare, Clap, Closed/Open Hat, Perc/Tom, Bass, Acid 303, Chord Stab, Pad, FM Lead, FX/Riser – alles live synthetisiert, keine Samples nötig. |
| **Sound-Design-Maske** | Pro Instrument eigene Parameter (Tonhöhe, Hüllkurven, Filter, Resonanz, Akkorde, FM …), Zufallsklang, plus Spur-Filter (LP/HP/BP), Resonanz und Drive. |
| **Step-Sequencer** | 16 Steps pro Spur, Anschlagstärke per Rechtsklick, Zufalls-Pattern, Kopieren/Einfügen, 8 Patterns (A–H). |
| **Piano-Roll** | Für melodische Spuren: Noten über zwei Oktaven, Tonart-Hervorhebung, Akzent und Slide (Acid!), Transponieren. |
| **Mixer & Effekte** | Lautstärke, Panorama, Hall- und Delay-Send, Mute/Solo pro Spur; Master mit Kompressor, Limiter, Hall-Länge, Delay-Zeit/Feedback. |
| **Arrangement** | Patterns zu einem Song verketten, Song-Modus spielt die Kette ab (Sequencer folgt automatisch). |
| **Export & Speichern** | WAV-Export (Offline-Rendering), Projekt als JSON speichern/laden, automatisches Zwischenspeichern im Browser. |
| **Genre-Presets** | Peak-Time, Acid, Minimal, Hard Techno, Melodic, Dub, Industrial, Detroit – mit fertigen Patterns und Song-Struktur. |

## Tastatur

- **Leertaste**: Play / Stopp
- **1–8**: Pattern A–H wählen
- **A W S E D F T G Z/Y H U J K**: gewählte Spur wie ein Keyboard spielen
- **Enter**: gewählte Spur vorhören

## Technik

- [Vite](https://vitejs.dev) + TypeScript (ohne UI-Framework)
- [Tone.js](https://tonejs.github.io) für Synthese, Sequencing, Effekte und Offline-Export
- [three.js](https://threejs.org) für die 3D-Szene (inkl. UnrealBloom-Post-Processing)

```
src/
  audio/instruments.ts  Instrumente + Parameter-Schemas (Sound-Design-Maske)
  audio/engine.ts       Mixer, Effekte, Sequencer-Takt, Raum-Mix
  audio/export.ts       Offline-Rendering → WAV
  viz/scene.ts          3D-Szene, Interaktion (Ziehen, Auswählen)
  ui/                   Sequencer, Piano-Roll, Mixer, Sound-Editor, Arrangement
  presets.ts            Genre-Presets
  store.ts              Projekt-Zustand + Autosave
```

## Ideen für später

- MIDI-Controller-Eingang und MIDI-Export
- Eigene Samples laden
- Automationen (Filterfahrten über mehrere Takte)
- Pattern-Länge > 16 Steps, Polyrhythmen
- Video-Export der 3D-Szene
