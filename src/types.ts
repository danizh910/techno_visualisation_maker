export const STEPS = 16;
export const PATTERN_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export type InstrumentType =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'openhat'
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
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

export interface Track {
  id: string;
  name: string;
  type: InstrumentType;
  color: string;
  /** Instrument-Parameter (Sound-Design-Maske) */
  params: Record<string, number | string>;
  /** Mixer */
  volume: number; // dB
  pan: number; // -1..1
  mute: boolean;
  solo: boolean;
  reverb: number; // 0..1
  delay: number; // 0..1
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

export interface Project {
  version: 1;
  name: string;
  bpm: number;
  swing: number; // 0..1
  key: number; // 0..11 (0 = C)
  scale: ScaleName;
  tracks: Track[];
  patterns: Pattern[]; // 8 Stück (A-H)
  song: number[]; // Pattern-Indizes
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
  return { on: false, vel: 1, note: 0, accent: false, slide: false };
}

export function emptySteps(): Step[] {
  return Array.from({ length: STEPS }, emptyStep);
}
