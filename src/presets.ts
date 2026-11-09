import type { InstrumentType, Project, ScaleName, StyleName, Track } from './types';
import { createTrack, emptyProject } from './store';
import { STYLES, drum, mel } from './groove';

/* Kurzschreibweise für Patterns (siehe groove.ts)
 * Drums:     "x...o...g...?..." – x = voll, o = mittel, g = Ghost, ? = 50 % Chance, . = aus
 * Melodisch: "0 . 3! 7~ ." – Zahl = Halbton über Grundton, ! = Akzent, ~ = Slide, ? = leise, % = 50 % Chance
 */

interface PresetTrack {
  type: InstrumentType;
  name?: string;
  params?: Record<string, number | string>;
  mix?: Partial<Track>;
  pos: [number, number];
  /** Pattern-Buchstabe -> Notation */
  p: Partial<Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H', string>>;
}

export interface GenrePreset {
  id: string;
  name: string;
  bpm: number;
  /** alter globaler Swing → wird auf alle Spuren außer Kick verteilt */
  swing?: number;
  style: StyleName;
  key: number;
  scale: ScaleName;
  song: string;
  description: string;
  tracks: PresetTrack[];
  master?: Partial<Project['master']>;
}

const K4 = 'x...x...x...x...';
const OFF = '..x...x...x...x.';

export const GENRES: GenrePreset[] = [
  {
    id: 'berlin',
    name: 'Berlin Rumble',
    style: 'berlin',
    bpm: 132,
    key: 5,
    scale: 'minor',
    song: 'AABBCCDC',
    description: 'Dunkle Halle: Rumble-Kick, Dub-Stab im Delay, pumpender Drone.',
    master: { reverbDecay: 5, delayTime: '8n.', delayFeedback: 0.45, compThreshold: -16 },
    tracks: [
      { type: 'kick', pos: [0, 1], params: { tune: 45, decay: 0.42, drive: 0.25, click: 0.22, rumble: 0.65, rumbleTone: 140, rumbleDecay: 0.88 }, p: { A: K4, B: K4, C: K4, D: 'x...x...x...x..g' }, mix: { volume: -3 } },
      { type: 'hat', pos: [4, -2], params: { decay: 0.035, tone: 9000, metal: 0.35 }, p: { A: 'g.x.g.x.g.x.g.x.', B: 'g?xgg?xgg?xgg?xg', C: 'g?xgg?xgg?xgg?xg', D: 'ggxgggxgggxgggxx' }, mix: { volume: -15 } },
      { type: 'openhat', pos: [6, 1], params: { decay: 0.22, tone: 7500 }, p: { B: OFF, C: OFF, D: OFF }, mix: { volume: -15 } },
      { type: 'ride', pos: [-4, 3], p: { C: '..o...o...o...o.', D: 'g.o.g.o.g.o.g.o.' }, mix: { volume: -19 } },
      { type: 'clap', pos: [-3, -2], params: { tone: 1100, decay: 0.35, q: 1.6 }, p: { C: '............x...', D: '....x.......x...' }, mix: { volume: -12, reverb: 0.4 } },
      { type: 'perc', name: 'Tom', pos: [5, -6], params: { decay: 0.25, octaves: 1.2, pitchDecay: 0.04, wave: 'sine', octave: 3 }, p: { B: '. . 0 . . . . . 7 . . . . 0 . .', C: '. 0 . . . 7 . . 0 . . 12% . . 5 .', D: '. 0 . . . 7 . . 0 . . 12 . . 5 .' }, mix: { volume: -14, delay: 0.3, reverb: 0.25 } },
      { type: 'stab', name: 'Dub Stab', pos: [-5, -6], params: { chord: 'minor7', cutoff: 750, res: 2.5, decay: 0.22, octave: 3 }, p: { B: '. . . . . . 0 . . . . . . . . .', C: '. . . 0 . . . . . . . 0 . . . .', D: '. . . 0 . . 0 . . . . 0 . . . .' }, mix: { volume: -14, delay: 0.55, reverb: 0.4, sidechain: 0.5 } },
      { type: 'pad', name: 'Drone', pos: [-7, -8], params: { chord: 'fifth', cutoff: 500, attack: 2, release: 4, gate: 16, octave: 2 }, p: { A: '0', B: '0', C: '0', D: '0' }, mix: { volume: -18, reverb: 0.5, sidechain: 0.7 } },
      { type: 'fx', pos: [8, -5], params: { mode: 'riser', length: 16 }, p: { D: 'x...............' }, mix: { volume: -18, reverb: 0.4 } },
    ],
  },
  {
    id: 'hardgroove',
    name: 'Hard Groove',
    style: 'hardgroove',
    bpm: 145,
    key: 2,
    scale: 'minor',
    song: 'AABBCCDC',
    description: 'Geshuffelte Hats, 16tel-Ride, geloopte Toms und Congas.',
    master: { reverbDecay: 3, delayTime: '8n', delayFeedback: 0.3 },
    tracks: [
      { type: 'kick', pos: [0, 1], params: { tune: 52, decay: 0.3, drive: 0.35, click: 0.4, octaves: 5 }, p: { A: K4, B: K4, C: K4, D: 'x...x...x...x..g' }, mix: { volume: -3 } },
      { type: 'ride', pos: [5, -1], params: { decay: 0.7, tone: 7000, bell: 0.45, wash: 0.25 }, p: { A: 'goxogoxogoxogoxo', B: 'goxogoxogoxogoxo', C: 'goxogoxogoxogoxo', D: 'goxogoxogoxogoxx' }, mix: { volume: -17 } },
      { type: 'hat', pos: [3, -4], params: { decay: 0.03, tone: 9500, metal: 0.4 }, p: { A: 'x.xox.xox.xox.xo', B: 'x.xox.xox.xox.xo', C: 'xgxox?xoxgxox?xo', D: 'x.xxx.xxx.xxx.xx' }, mix: { volume: -15 } },
      { type: 'openhat', pos: [7, 2], params: { decay: 0.25 }, p: { B: OFF, C: OFF, D: OFF }, mix: { volume: -16 } },
      { type: 'clap', pos: [-3, -2], params: { tone: 1400, decay: 0.22 }, p: { B: '....x.......x...', C: '....x..g....x...', D: '....x..g....x.gg' }, mix: { volume: -10, reverb: 0.25 } },
      { type: 'perc', name: 'Toms', pos: [-5, -5], params: { decay: 0.22, octaves: 1.6, pitchDecay: 0.03, wave: 'sine', octave: 3 }, p: { B: '0 . . 7 . . 12 . 0 . . 7 . . 5 .', C: '0 . . 7 . . 12 . 0 . . 7 . . 5 .', D: '0 . . 7 . . 12 . 0 . 7 . 12 . 5 3' }, mix: { volume: -12, delay: 0.1 } },
      { type: 'perc', name: 'Conga', pos: [6, -6], params: { decay: 0.08, octaves: 0.6, pitchDecay: 0.01, wave: 'triangle', octave: 4 }, p: { A: '7 . . 12 . . . 7% . . 12 . . 7 . .', C: '7 . . 12 . . . 7% . . 12 . . 7 . .', D: '7 . . 12 . . . 7 . . 12 . . 7 . 12' }, mix: { volume: -16 } },
      { type: 'bass', pos: [-6, 2], params: { wave: 'square', cutoff: 180, envAmount: 2, decay: 0.12, res: 3, gate: 0.5 }, p: { C: '. 0 0 . . 0 0 . . 0 0 . . 0 12 .', D: '. 0 0 . . 0 0 . . 0 0 . . 0 12 .' }, mix: { volume: -9, sidechain: 0.45 } },
      { type: 'stab', pos: [-4, -8], params: { chord: 'minor7', cutoff: 1800, decay: 0.12, wave: 'square' }, p: { C: '. . 0 . . 0 . . . . 0 . . 0 . .', D: '. . 0 . . 0 . . . . 0 . . 0 . .' }, mix: { volume: -15, delay: 0.3, sidechain: 0.4 } },
    ],
  },
  {
    id: 'bounce',
    name: 'Bounce',
    style: 'bounce',
    bpm: 140,
    key: 9,
    scale: 'minor',
    song: 'AABBCCDC',
    description: 'Offbeat-Bass mit Oktavsprüngen – rollt und hüpft.',
    master: { reverbDecay: 3.5, delayTime: '8n.', delayFeedback: 0.35 },
    tracks: [
      { type: 'kick', pos: [0, 1], params: { tune: 50, decay: 0.28, drive: 0.3, click: 0.35 }, p: { A: K4, B: K4, C: K4, D: 'x...x...x...x.x.' }, mix: { volume: -3 } },
      { type: 'bass', name: 'Bounce Bass', pos: [-6, 2], params: { wave: 'sawtooth', cutoff: 260, res: 4, envAmount: 2.8, decay: 0.1, gate: 0.45 }, p: { B: '. . 0 . . . 0 . . . 0 . . . 0 .', C: '. . 0 12 . . 0 12 . . 0 12 . . 0 7', D: '. 0 12 . . 0 12 . . 0 12 . . 0 12 0' }, mix: { volume: -8, sidechain: 0.5 } },
      { type: 'hat', pos: [4, -3], params: { decay: 0.03, tone: 10000 }, p: { A: 'gxgxgxgxgxgxgxgx', B: 'gxgxgxgxgxgxgxgx', C: 'gxoxgxoxgxoxgxox', D: 'gxoxgxoxgxoxgxox' }, mix: { volume: -15 } },
      { type: 'openhat', pos: [6, 1], params: { decay: 0.18, tone: 8000 }, p: { A: OFF, B: OFF, C: OFF, D: OFF }, mix: { volume: -14 } },
      { type: 'clap', pos: [-3, -2], p: { B: '....x.......x...', C: '....x.......x...', D: '....x.......x..x' }, mix: { volume: -10, reverb: 0.3 } },
      { type: 'stab', pos: [-5, -6], params: { chord: 'minor', cutoff: 2200, decay: 0.1, detune: 18 }, p: { C: '. . . . . . 0 . . . . . . . 0 .', D: '. . 0 . . . . . . . 0 . . . 0 .' }, mix: { volume: -15, delay: 0.35, sidechain: 0.35 } },
      { type: 'perc', name: 'Blip', pos: [5, -6], params: { decay: 0.05, octaves: 0.3, pitchDecay: 0.005, wave: 'square', octave: 4 }, p: { C: '. 12 . . . 19 . . . 12 . . . 7% . .', D: '. 12 . . . 19 . . . 12 . . . 7 . .' }, mix: { volume: -18, delay: 0.25 } },
      { type: 'fm', name: 'Lead', pos: [3, -9], params: { harmonicity: 2, modIndex: 8, decay: 0.15, octave: 4, gate: 0.8 }, p: { D: '0 . . 7 . . 12 . . 10 . . 7 . . .' }, mix: { volume: -17, delay: 0.35, reverb: 0.3, sidechain: 0.3 } },
      { type: 'fx', pos: [8, -5], params: { mode: 'riser', length: 16 }, p: { D: 'x...............' }, mix: { volume: -18, reverb: 0.4 } },
    ],
  },
  {
    id: 'peak',
    style: 'classic',
    name: 'Peak-Time Techno',
    bpm: 132,
    key: 9,
    scale: 'minor',
    song: 'AABBCCDC',
    description: 'Treibend, rollender Bass, offene Hats, Stabs mit Delay.',
    tracks: [
      { type: 'kick', pos: [0, 2], p: { A: K4, B: K4, C: K4, D: 'x...x...x...x.x.' }, mix: { volume: -3 } },
      { type: 'clap', pos: [-3, -1], p: { B: '....x.......x...', C: '....x.......x...', D: '....x.......x..o' }, mix: { reverb: 0.25 } },
      { type: 'hat', pos: [4, -2], p: { A: 'o.o.o.ooo.o.o.oo', B: 'oxooxoooxoxoxooo', C: 'oxooxoooxoxoxooo', D: 'oxoxoxoxoxoxoxox' }, mix: { volume: -12 } },
      { type: 'openhat', pos: [6, 1], p: { B: '..x...x...x...x.', C: '..x...x...x...x.', D: '..x...x...x...x.' }, mix: { volume: -11 } },
      { type: 'bass', pos: [-6, 2], p: { A: '. 0 0 0 . 0 0 0 . 0 0 0 . 0 0 12', B: '. 0 0 0 . 0 0 0 . 0 0 0 . 0 0 12', C: '. 0 0 0 . 0 0 0 . 0 0 0 . 3 3 5', D: '. 0 0 0 . 0 0 0 . 0 0 0 . 0 0 12' }, mix: { volume: -7 } },
      { type: 'perc', pos: [3, -6], p: { C: '. . . 7 . . 12 . . . . 7 . 5 . .', D: '. . . 7 . . 12 . . . . 7 . 5 . 3' }, mix: { volume: -14, delay: 0.25 } },
      { type: 'stab', pos: [-4, -6], p: { C: '0 . . 0 . . 0 . . . 0 . . . . .', D: '0 . . 0 . . 0 . . . 0 . . 3 . .' }, mix: { volume: -12, delay: 0.4, reverb: 0.3 } },
      { type: 'fx', pos: [8, -5], p: { D: 'x...............' }, mix: { volume: -16, reverb: 0.4 } },
    ],
  },
  {
    id: 'acid',
    style: 'classic',
    name: 'Acid Techno',
    bpm: 136,
    key: 4,
    scale: 'phrygian',
    song: 'AABBCCDD',
    description: 'Quietschende 303-Linie mit Akzenten und Slides.',
    tracks: [
      { type: 'kick', pos: [0, 2], params: { drive: 0.4, decay: 0.4 }, p: { A: K4, B: K4, C: K4, D: K4 }, mix: { volume: -3 } },
      { type: 'clap', pos: [-3, -1], p: { B: '....x.......x...', C: '....x.......x...', D: '....x.......x...' } },
      { type: 'hat', pos: [4, -2], p: { A: '..x...x...x...x.', B: 'x.x.x.x.x.x.x.xx', C: 'x.x.x.x.x.x.x.xx', D: 'x.x.x.x.x.x.x.xx' }, mix: { volume: -12 } },
      { type: 'acid', pos: [-5, -4], p: {
        A: '0 0 12! 0 . 0 10~ 12 0 . 0! 3 . 0 7~ 0',
        B: '0 0 12! 0 . 0 10~ 12 0 . 0! 3 . 0 7~ 0',
        C: '0! 12 0 1~ 0 . 12! 0 3 0 . 13! 0 7~ 10 0',
        D: '0 0 12! 0 . 0 10~ 12 0 . 0! 3 . 0 7~ 0',
      }, mix: { volume: -6, delay: 0.15 } },
      { type: 'bass', pos: [-6, 3], params: { wave: 'square', cutoff: 150 }, p: { C: '0 . . 0 . . 0 . 0 . . 0 . . 0 .', D: '0 . . 0 . . 0 . 0 . . 0 . . 0 .' }, mix: { volume: -10 } },
      { type: 'perc', pos: [5, -5], params: { wave: 'square', octaves: 0.5, decay: 0.05 }, p: { B: '. . x . . x . . . . x . . x . .'.replace(/x/g, '12'), D: '. . 12 . . 12 . . . . 12 . . 12 . 7' }, mix: { volume: -16 } },
    ],
  },
  {
    id: 'minimal',
    style: 'classic',
    name: 'Minimal / Microhouse',
    bpm: 124,
    swing: 0.25,
    key: 2,
    scale: 'dorian',
    song: 'AABBCBCD',
    description: 'Reduziert, Swing, kleine Percussion-Details.',
    tracks: [
      { type: 'kick', pos: [0, 2], params: { tune: 52, decay: 0.3, click: 0.15 }, p: { A: K4, B: K4, C: K4, D: 'x...x...x.......' } },
      { type: 'hat', pos: [4, -2], params: { decay: 0.03 }, p: { A: '..o...o...o...o.', B: 'o.x.o.x.o.x.o.xo', C: 'o.x.o.x.o.x.o.xo', D: 'o.x.o.x.o.x.o.xo' }, mix: { volume: -13 } },
      { type: 'clap', pos: [-3, -1], params: { tone: 2200, decay: 0.12 }, p: { B: '....x.......x...', C: '....x.......x...' }, mix: { volume: -10 } },
      { type: 'perc', pos: [3, -5], params: { wave: 'sine', decay: 0.08, octaves: 0.8 }, p: { A: '. . . 7 . . . . . . 12 . . . . 5', B: '. . . 7 . . . . . . 12 . . . . 5', C: '. 12 . 7 . . 7 . . . 12 . 5 . . 5', D: '. 12 . 7 . . 7 . . . 12 . 5 . . 5' }, mix: { volume: -12, delay: 0.3 } },
      { type: 'bass', pos: [-6, 2], params: { wave: 'triangle', cutoff: 400, envAmount: 1.5 }, p: { B: '. . 0 . . . 0 . . . 0 . . 5 . .', C: '. . 0 . . . 0 . . . 0 . . 5 . 7', D: '. . 0 . . . 0 . . . 0 . . 5 . .' }, mix: { volume: -8 } },
      { type: 'fm', pos: [-4, -6], params: { harmonicity: 3.5, modIndex: 6, decay: 0.15, octave: 4 }, p: { C: '0 . . . . . 7 . . . . . 10 . . .', D: '0 . . 3 . . 7 . . . . . 10 . . .' }, mix: { volume: -16, delay: 0.45, reverb: 0.3 } },
    ],
  },
  {
    id: 'hard',
    style: 'classic',
    name: 'Hard Techno',
    bpm: 150,
    key: 5,
    scale: 'phrygian',
    song: 'AABBCCDB',
    description: 'Schnell, verzerrte Rumble-Kick, harte Clap, aggressive Energie.',
    tracks: [
      { type: 'kick', pos: [0, 2], params: { tune: 44, drive: 0.75, decay: 0.6, octaves: 7, click: 0.5 }, p: { A: K4, B: K4, C: K4, D: 'x...x...x...xxxx' }, mix: { volume: -4, reverb: 0.2 } },
      { type: 'bass', pos: [-6, 2], params: { wave: 'sawtooth', cutoff: 120, envAmount: 2, decay: 0.08 }, p: { B: '. 0 0 . . 0 0 . . 0 0 . . 0 0 .', C: '. 0 0 . . 0 0 . . 0 0 . . 0 0 .', D: '. 0 0 . . 0 0 . . 0 0 . . 0 0 .' }, mix: { volume: -9, drive: 0.4 } },
      { type: 'clap', pos: [-3, -1], params: { tone: 1100, decay: 0.3 }, p: { B: '....x.......x...', C: '....x.......x...', D: '....x.......x.x.' }, mix: { reverb: 0.35, drive: 0.3 } },
      { type: 'hat', pos: [4, -2], params: { decay: 0.04, metal: 0.7 }, p: { A: 'xxxxxxxxxxxxxxxx', B: 'xxxxxxxxxxxxxxxx', C: 'xxxxxxxxxxxxxxxx', D: 'xxxxxxxxxxxxxxxx' }, mix: { volume: -15 } },
      { type: 'openhat', pos: [6, 1], p: { B: '..x...x...x...x.', C: '..x...x...x...x.' }, mix: { volume: -12 } },
      { type: 'fm', pos: [-4, -6], params: { harmonicity: 1.5, modIndex: 25, decay: 0.08, sustain: 0, octave: 4 }, p: { C: '0! . . 1 . . 0 . . . 1 . 0 . . .', D: '0 . . 1 . . 0 . . . 1 . 0 . 13 .' }, mix: { volume: -13, delay: 0.2 } },
      { type: 'fx', pos: [8, -5], params: { mode: 'impact', length: 32 }, p: { C: 'x...............' }, mix: { volume: -12, reverb: 0.5 } },
    ],
  },
  {
    id: 'melodic',
    style: 'classic',
    name: 'Melodic Techno',
    bpm: 122,
    key: 0,
    scale: 'minor',
    song: 'AABBCCDD',
    description: 'Emotionale Pads, Arpeggios und warme Bässe.',
    master: { reverbDecay: 6 },
    tracks: [
      { type: 'kick', pos: [0, 2], params: { tune: 46, decay: 0.55, click: 0.15 }, p: { A: K4, B: K4, C: K4, D: K4 }, mix: { volume: -4 } },
      { type: 'clap', pos: [-3, -1], params: { tone: 1600, decay: 0.35 }, p: { B: '....x.......x...', C: '....x.......x...', D: '....x.......x...' }, mix: { reverb: 0.35, volume: -9 } },
      { type: 'hat', pos: [4, -2], p: { A: '..x...x...x...x.', B: '..x...x...x...x.', C: 'o.x.o.x.o.x.o.x.', D: 'o.x.o.x.o.x.o.x.' }, mix: { volume: -14 } },
      { type: 'bass', pos: [-6, 2], params: { wave: 'sawtooth', cutoff: 180, envAmount: 2, glide: 0.04 }, p: { A: '. . 0 . . . 0 . . . 0 . . . 0 .', B: '. 0 0 . . 0 0 . . 8 8 . . 7 7 .', C: '. 0 0 . . 0 0 . . 8 8 . . 7 7 .', D: '. 0 0 . . 0 0 . . 8 8 . . 7 7 .' }, mix: { volume: -8 } },
      { type: 'pad', pos: [-5, -7], params: { chord: 'minor9', attack: 1.5, release: 4, gate: 16 }, p: { A: '0 . . . . . . . . . . . . . . .', B: '0 . . . . . . . 8 . . . . . . .', C: '0 . . . . . . . 8 . . . . . . .', D: '0 . . . . . . . 7 . . . . . . .' }, mix: { volume: -10, reverb: 0.5 } },
      { type: 'fm', pos: [4, -7], name: 'Arp', params: { harmonicity: 2, modIndex: 4, decay: 0.25, octave: 4, gate: 0.8 }, p: { C: '0 3 7 12 0 3 7 12 8 12 15 8 7 10 14 7', D: '0 3 7 12 0 3 7 15 8 12 15 20 7 10 14 19' }, mix: { volume: -14, delay: 0.4, reverb: 0.3 } },
      { type: 'fx', pos: [8, -4], p: { B: '................', D: 'x...............' }, mix: { volume: -16, reverb: 0.5 } },
    ],
  },
  {
    id: 'dub',
    style: 'berlin',
    name: 'Dub Techno',
    bpm: 118,
    swing: 0.1,
    key: 7,
    scale: 'minor',
    song: 'AABBCCBB',
    description: 'Tiefe Stabs im Delay-Nebel, viel Raum, sanfte Kick.',
    master: { reverbDecay: 7, delayTime: '8n.', delayFeedback: 0.6 },
    tracks: [
      { type: 'kick', pos: [0, 2], params: { tune: 50, decay: 0.4, click: 0.05, drive: 0 }, p: { A: K4, B: K4, C: K4 }, mix: { volume: -4 } },
      { type: 'hat', pos: [4, -2], params: { decay: 0.06, metal: 0.2 }, p: { A: '..o...o...o...o.', B: '..x...x...x...x.', C: 'o.x.o.x.o.x.o.x.' }, mix: { volume: -15, reverb: 0.3 } },
      { type: 'stab', pos: [-5, -6], params: { chord: 'dubstab', cutoff: 900, decay: 0.25, octave: 3 }, p: { A: '. . . . . . 0 . . . . . . . . .', B: '. . 0 . . . . . . . 0 . . . . .', C: '. . 0 . . . 0 . . . 0 . . 0 . .' }, mix: { volume: -10, delay: 0.7, reverb: 0.5 } },
      { type: 'bass', pos: [-6, 3], params: { wave: 'sine', cutoff: 300, envAmount: 0.5 }, p: { B: '0 . . . . . . . 0 . . . . . . .', C: '0 . . . . . . . 0 . . . . 3 . .' }, mix: { volume: -6 } },
      { type: 'clap', pos: [-2, -2], name: 'Rim', params: { tone: 3000, decay: 0.06, q: 4 }, p: { C: '....x.......x...' }, mix: { volume: -14, delay: 0.5 } },
      { type: 'pad', pos: [5, -8], params: { chord: 'minor7', cutoff: 700, gate: 16 }, p: { A: '0 . . . . . . . . . . . . . . .', B: '0 . . . . . . . . . . . . . . .', C: '0 . . . . . . . . . . . . . . .' }, mix: { volume: -16, reverb: 0.6 } },
    ],
  },
  {
    id: 'industrial',
    style: 'berlin',
    name: 'Industrial',
    bpm: 140,
    key: 1,
    scale: 'phrygian',
    song: 'AABBCCDC',
    description: 'Dunkel, metallisch, verzerrte Percussion und Lärm.',
    tracks: [
      { type: 'kick', pos: [0, 2], params: { drive: 0.9, decay: 0.35, tune: 55 }, p: { A: K4, B: 'x...x...x...x..x', C: 'x..xx...x..xx...', D: K4 }, mix: { volume: -4 } },
      { type: 'snare', pos: [-3, -1], params: { snappy: 0.8, color: 2500, decay: 0.25 }, p: { B: '....x.......x...', C: '....x.......x.o.', D: '....x...o...x...' }, mix: { reverb: 0.4, drive: 0.5 } },
      { type: 'hat', pos: [4, -2], params: { metal: 0.9, decay: 0.08, tone: 5000 }, p: { A: 'x.ox.ox.x.ox.ox.', B: 'x.ox.ox.x.ox.ox.', C: 'x.ox.ox.x.ox.ox.', D: 'xxxxxxxxxxxxxxxx' }, mix: { volume: -14 } },
      { type: 'perc', pos: [4, -6], params: { wave: 'square', octaves: 3, decay: 0.2 }, p: { C: '0 . . . 0 . . 1 . . 0 . . . 1 .', D: '0 . . . 0 . . 1 . . 0 . . . 1 .' }, mix: { volume: -14, drive: 0.6, reverb: 0.3 } },
      { type: 'bass', pos: [-6, 2], params: { wave: 'square', cutoff: 90, envAmount: 3, decay: 0.1 }, p: { B: '. 0 . 0 . 0 . 0 . 0 . 0 . 1 . 0', C: '. 0 . 0 . 0 . 0 . 0 . 0 . 1 . 0', D: '. 0 . 0 . 0 . 0 . 0 . 0 . 1 . 0' }, mix: { volume: -9, drive: 0.5 } },
      { type: 'fx', pos: [-6, -6], params: { mode: 'zap', length: 3 }, p: { C: '..........x.....', D: '..x.......x...x.' }, mix: { volume: -14, delay: 0.3 } },
    ],
  },
  {
    id: 'detroit',
    style: 'classic',
    name: 'Detroit Techno',
    bpm: 128,
    swing: 0.12,
    key: 5,
    scale: 'dorian',
    song: 'AABBCCDD',
    description: 'Soulige Akkorde, funky Hats, klassische Drum-Machine-Vibes.',
    tracks: [
      { type: 'kick', pos: [0, 2], params: { tune: 52, decay: 0.35 }, p: { A: K4, B: K4, C: K4, D: K4 } },
      { type: 'clap', pos: [-3, -1], p: { B: '....x.......x...', C: '....x.......x...', D: '....x.......x..o' }, mix: { volume: -8 } },
      { type: 'hat', pos: [4, -2], p: { A: 'x.ox.oxox.ox.oxo', B: 'x.ox.oxox.ox.oxo', C: 'x.ox.oxox.ox.oxo', D: 'x.ox.oxox.ox.oxo' }, mix: { volume: -13 } },
      { type: 'openhat', pos: [6, 1], p: { C: '..x...x...x...x.', D: '..x...x...x...x.' }, mix: { volume: -13 } },
      { type: 'stab', pos: [-4, -6], params: { chord: 'minor9', wave: 'square', cutoff: 2500, decay: 0.3 }, p: { B: '0 . . 0 . . 0 . . . 0 . . . . .', C: '0 . . 0 . . 0 . . . 3 . . . . .', D: '0 . . 0 . . 0 . . . 3 . . 5 . .' }, mix: { volume: -12, delay: 0.3, reverb: 0.25 } },
      { type: 'bass', pos: [-6, 2], params: { wave: 'square', cutoff: 300, envAmount: 2 }, p: { A: '0 . . 0 . . 0 . . 0 . . 0 . 12 .', B: '0 . . 0 . . 0 . . 0 . . 0 . 12 .', C: '0 . . 0 . . 3 . . 3 . . 5 . 7 .', D: '0 . . 0 . . 3 . . 3 . . 5 . 7 .' }, mix: { volume: -8 } },
      { type: 'pad', pos: [5, -7], params: { chord: 'minor9', gate: 16, cutoff: 1400 }, p: { D: '0 . . . . . . . 3 . . . . . . .' }, mix: { volume: -16, reverb: 0.5 } },
    ],
  },
];

export function buildPreset(g: GenrePreset): Project {
  const proj = emptyProject();
  proj.name = g.name;
  proj.bpm = g.bpm;
  proj.style = g.style;
  proj.key = g.key;
  proj.scale = g.scale;
  proj.master = { ...proj.master, ...g.master };
  const letters = 'ABCDEFGH';
  for (const pt of g.tracks) {
    const swing = pt.type === 'kick' ? 0 : (g.swing ?? STYLES[g.style].swing[pt.type] ?? 0);
    const t = createTrack(pt.type, { pos: { x: pt.pos[0], z: pt.pos[1] }, swing, ...pt.mix });
    if (pt.name) t.name = pt.name;
    Object.assign(t.params, pt.params);
    proj.tracks.push(t);
    for (const [letter, notation] of Object.entries(pt.p)) {
      const idx = letters.indexOf(letter);
      if (idx < 0 || !notation) continue;
      const looksMelodic = /\d/.test(notation);
      proj.patterns[idx].steps[t.id] = looksMelodic ? mel(notation) : drum(notation);
    }
  }
  proj.song = g.song.split('').map((c) => letters.indexOf(c)).filter((i) => i >= 0);
  proj.songFilter = proj.song.map(() => 1);
  return proj;
}

