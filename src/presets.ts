import type { InstrumentType, Project, ScaleName, Step, Track } from './types';
import { STEPS, emptySteps } from './types';
import { createTrack, emptyProject } from './store';

/* Kurzschreibweise für Patterns
 * Drums:     "x...o..." – x = voll, o = leise, . = aus (Leerzeichen werden ignoriert)
 * Melodisch: "0 . 3! 7~ ." – Zahl = Halbton über Grundton, ! = Akzent, ~ = Slide, ? = leise
 */
function drum(s: string): Step[] {
  const chars = s.replace(/\s+/g, '').split('');
  const out = emptySteps();
  chars.slice(0, STEPS).forEach((c, i) => {
    if (c === 'x' || c === 'o') {
      out[i].on = true;
      out[i].vel = c === 'x' ? 1 : 0.6;
    }
  });
  return out;
}

function mel(s: string): Step[] {
  const tokens = s.trim().split(/\s+/);
  const out = emptySteps();
  tokens.slice(0, STEPS).forEach((tok, i) => {
    if (tok === '.' || tok === '-') return;
    const n = parseInt(tok, 10);
    if (Number.isNaN(n)) return;
    out[i] = {
      on: true,
      note: n,
      vel: tok.includes('?') ? 0.6 : 1,
      accent: tok.includes('!'),
      slide: tok.includes('~'),
    };
  });
  return out;
}

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
  swing?: number;
  key: number;
  scale: ScaleName;
  song: string;
  description: string;
  tracks: PresetTrack[];
  master?: Partial<Project['master']>;
}

const K4 = 'x...x...x...x...';

export const GENRES: GenrePreset[] = [
  {
    id: 'peak',
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
  proj.swing = g.swing ?? 0;
  proj.key = g.key;
  proj.scale = g.scale;
  proj.master = { ...proj.master, ...g.master };
  const letters = 'ABCDEFGH';
  for (const pt of g.tracks) {
    const t = createTrack(pt.type, { pos: { x: pt.pos[0], z: pt.pos[1] }, ...pt.mix });
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
  return proj;
}

export function randomDrumSteps(type: InstrumentType): Step[] {
  const dens: Partial<Record<InstrumentType, number>> = { kick: 0.25, snare: 0.12, clap: 0.12, hat: 0.6, openhat: 0.2, perc: 0.25, fx: 0.05 };
  const d = dens[type] ?? 0.3;
  return Array.from({ length: STEPS }, (_, i) => {
    let on = Math.random() < d;
    if (type === 'kick') on = i % 4 === 0 || Math.random() < 0.06;
    if (type === 'clap' || type === 'snare') on = i === 4 || i === 12 || Math.random() < 0.05;
    if (type === 'openhat') on = i % 4 === 2 || Math.random() < 0.05;
    return { on, vel: Math.random() < 0.3 ? 0.6 : 1, note: 0, accent: false, slide: false };
  });
}

export function randomMelodicSteps(scaleSteps: number[], density = 0.45): Step[] {
  const pool = [...scaleSteps, ...scaleSteps.map((s) => s + 12), 24];
  return Array.from({ length: STEPS }, () => {
    const on = Math.random() < density;
    const note = Math.random() < 0.35 ? 0 : pool[Math.floor(Math.random() * pool.length)];
    return { on, vel: Math.random() < 0.25 ? 0.6 : 1, note, accent: Math.random() < 0.2, slide: Math.random() < 0.15 };
  });
}
