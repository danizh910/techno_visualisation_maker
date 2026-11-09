export const STEPS = 16;
export const PATTERN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export type InstrumentType =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'openhat'
  | 'ride'
  | 'shaker'
  | 'perc'
  | 'bass'
  | 'acid'
  | 'stab'
  | 'pad'
  | 'fm'
  | 'fx';

export interface Step {
  on: boolean;
  /** 0..1 */
  vel: number;
  /** Halbtöne über dem Grundton der Spur (0..24) */
  note: number;
  accent: boolean;
  slide: boolean;
  /** Wahrscheinlichkeit, dass der Step spielt (0..1) */
  prob: number;
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

/** Makro-Regler 0..1, 0.5 = neutral (Experten-Werte unverändert) */
export interface Macros {
  tone: number; // Dunkel ↔ Hell
  length: number; // Kurz ↔ Lang
  dirt: number; // Sauber ↔ Dreckig
}

export interface Track {
  id: string;
  name: string;
  type: InstrumentType;
  color: string;
  /** Instrument-Parameter (Experten-Maske) */
  params: Record<string, number | string>;
  macros: Macros;
  /** Mixer */
  volume: number; // dB
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  reverb: number; // 0..1
  delay: number; // 0..1
  /** Groove */
  swing: number; // 0..1 (verschiebt die 2. und 4. Sechzehntel)
  sidechain: number; // 0..1 (duckt unter die Kick)
  locked: boolean; // beim Würfeln/Mutieren tabu
  euclid: { hits: number; rot: number };
  /** Klangformung pro Spur */
  filterType: FilterType;
  cutoff: number; // Hz
  resonance: number; // Q
  drive: number; // 0..1
  /** Position in der 3D-Szene */
  pos: { x: number; z: number };
}

export interface Pattern {
  /** trackId -> 16 Steps */
  steps: Record<string, Step[]>;
}

export type ScaleName = 'minor' | 'phrygian' | 'dorian' | 'major' | 'harmonicMinor' | 'chromatic';
export type StyleName = 'berlin' | 'hardgroove' | 'bounce' | 'classic';
export type SceneName = 'halle' | 'linien' | 'studio';

export interface Project {
  version: 2;
  name: string;
  bpm: number;
  key: number; // 0..11 (0 = C)
  scale: ScaleName;
  /** Genre-Regeln für Würfeln/Mutieren */
  style: StyleName;
  scene: SceneName;
  accent: string;
  tracks: Track[];
  patterns: Pattern[]; // 8 Stück (A-H)
  song: number[]; // Pattern-Indizes
  /** Master-Filter pro Song-Takt (0 = zu, 1 = offen), gleich lang wie song */
  songFilter: number[];
  master: {
    volume: number; // dB
    compThreshold: number; // dB
    reverbDecay: number; // s
    delayTime: string; // Transport-Notation, z.B. "8n."
    delayFeedback: number; // 0..0.95
  };
  spatialMix: boolean;
}

export function emptyStep(): Step {
  return { on: false, vel: 1, note: 0, accent: false, slide: false, prob: 1 };
}

export function emptySteps(): Step[] {
  return Array.from({ length: STEPS }, emptyStep);
}
