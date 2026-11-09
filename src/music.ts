import type { ScaleName } from './types';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES: Record<ScaleName, { label: string; steps: number[] }> = {
  minor: { label: 'Moll (Äolisch)', steps: [0, 2, 3, 5, 7, 8, 10] },
  phrygian: { label: 'Phrygisch', steps: [0, 1, 3, 5, 7, 8, 10] },
  dorian: { label: 'Dorisch', steps: [0, 2, 3, 5, 7, 9, 10] },
  harmonicMinor: { label: 'Harmonisch Moll', steps: [0, 2, 3, 5, 7, 8, 11] },
  major: { label: 'Dur', steps: [0, 2, 4, 5, 7, 9, 11] },
  chromatic: { label: 'Chromatisch', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export function inScale(semitone: number, scale: ScaleName): boolean {
  return SCALES[scale].steps.includes(((semitone % 12) + 12) % 12);
}

export function midiName(m: number): string {
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Grundton (MIDI) einer Spur aus Tonart + Oktave */
export function rootMidi(key: number, octave: number): number {
  return 12 * (octave + 1) + key;
}
