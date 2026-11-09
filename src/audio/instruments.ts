import * as Tone from 'tone';
import type { InstrumentType, Step } from '../types';

/* ------------------------------------------------------------------ */
/*  Parameter-Schemas (Sound-Design-Maske)                             */
/* ------------------------------------------------------------------ */

export interface RangeParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
  log?: boolean;
}
export interface SelectParam {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  def: string;
}
export type ParamDef = RangeParam | SelectParam;
export const isSelect = (p: ParamDef): p is SelectParam => 'options' in p;

export interface InstrumentDef {
  type: InstrumentType;
  label: string;
  short: string;
  color: string;
  melodic: boolean;
  description: string;
  params: ParamDef[];
}

const wave = (def = 'sawtooth'): SelectParam => ({
  key: 'wave',
  label: 'Wellenform',
  def,
  options: [
    { value: 'sawtooth', label: 'Sägezahn' },
    { value: 'square', label: 'Rechteck' },
    { value: 'triangle', label: 'Dreieck' },
    { value: 'sine', label: 'Sinus' },
    { value: 'fatsawtooth', label: 'Supersaw' },
    { value: 'fatsquare', label: 'Fat Square' },
  ],
});

const octave = (def: number): RangeParam => ({ key: 'octave', label: 'Oktave', min: 0, max: 6, step: 1, def });
const gate = (def: number): RangeParam => ({ key: 'gate', label: 'Notenlänge', min: 0.1, max: 16, step: 0.1, def, unit: 'Steps' });

export const CHORDS: Record<string, number[]> = {
  single: [0],
  minor: [0, 3, 7],
  major: [0, 4, 7],
  minor7: [0, 3, 7, 10],
  minor9: [0, 3, 7, 10, 14],
  sus4: [0, 5, 7],
  fifth: [0, 7],
  octave: [0, 12],
  dubstab: [0, 7, 10, 15],
};
const chord = (def: string): SelectParam => ({
  key: 'chord',
  label: 'Akkord',
  def,
  options: [
    { value: 'single', label: 'Einzelton' },
    { value: 'minor', label: 'Moll' },
    { value: 'major', label: 'Dur' },
    { value: 'minor7', label: 'Moll 7' },
    { value: 'minor9', label: 'Moll 9' },
    { value: 'sus4', label: 'Sus 4' },
    { value: 'fifth', label: 'Quinte' },
    { value: 'octave', label: 'Oktave' },
    { value: 'dubstab', label: 'Dub-Stab' },
  ],
});

export const INSTRUMENTS: Record<InstrumentType, InstrumentDef> = {
  kick: {
    type: 'kick',
    label: 'Kick',
    short: 'BD',
    color: '#ff2e63',
    melodic: false,
    description: 'Bassdrum: Sinus mit Pitch-Hüllkurve, Klick und Verzerrung.',
    params: [
      { key: 'tune', label: 'Tonhöhe', min: 30, max: 90, step: 1, def: 48, unit: 'Hz' },
      { key: 'pitchDecay', label: 'Pitch-Abfall', min: 0.005, max: 0.3, step: 0.005, def: 0.05, unit: 's' },
      { key: 'octaves', label: 'Pitch-Tiefe', min: 1, max: 10, step: 0.5, def: 6, unit: 'Okt' },
      { key: 'decay', label: 'Ausklingen', min: 0.08, max: 2, step: 0.01, def: 0.45, unit: 's' },
      { key: 'click', label: 'Klick', min: 0, max: 1, step: 0.01, def: 0.3 },
      { key: 'drive', label: 'Verzerrung', min: 0, max: 1, step: 0.01, def: 0.15 },
    ],
  },
  snare: {
    type: 'snare',
    label: 'Snare',
    short: 'SD',
    color: '#ffb400',
    melodic: false,
    description: 'Snare: Körper (Membran) plus Rauschen.',
    params: [
      { key: 'tune', label: 'Körper-Ton', min: 100, max: 400, step: 1, def: 190, unit: 'Hz' },
      { key: 'snappy', label: 'Teppich', min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: 'decay', label: 'Ausklingen', min: 0.04, max: 0.8, step: 0.01, def: 0.2, unit: 's' },
      { key: 'color', label: 'Rausch-Farbe', min: 800, max: 12000, step: 10, def: 4000, unit: 'Hz', log: true },
    ],
  },
  clap: {
    type: 'clap',
    label: 'Clap',
    short: 'CP',
    color: '#f9ed69',
    melodic: false,
    description: 'Clap: mehrere schnelle Rauschimpulse durch ein Bandpassfilter.',
    params: [
      { key: 'tone', label: 'Ton', min: 400, max: 4000, step: 10, def: 1300, unit: 'Hz', log: true },
      { key: 'q', label: 'Resonanz', min: 0.3, max: 6, step: 0.1, def: 1.2 },
      { key: 'decay', label: 'Ausklingen', min: 0.05, max: 1.2, step: 0.01, def: 0.25, unit: 's' },
      { key: 'spread', label: 'Hand-Abstand', min: 0.004, max: 0.035, step: 0.001, def: 0.011, unit: 's' },
    ],
  },
  hat: {
    type: 'hat',
    label: 'Closed Hat',
    short: 'CH',
    color: '#08d9d6',
    melodic: false,
    description: 'Geschlossene Hi-Hat: metallischer FM-Klang plus Rauschen.',
    params: [
      { key: 'decay', label: 'Ausklingen', min: 0.01, max: 0.4, step: 0.005, def: 0.05, unit: 's' },
      { key: 'tone', label: 'Helligkeit', min: 3000, max: 14000, step: 50, def: 8000, unit: 'Hz', log: true },
      { key: 'metal', label: 'Metall ↔ Rauschen', min: 0, max: 1, step: 0.01, def: 0.5 },
    ],
  },
  openhat: {
    type: 'openhat',
    label: 'Open Hat',
    short: 'OH',
    color: '#00adb5',
    melodic: false,
    description: 'Offene Hi-Hat mit längerem Ausklang.',
    params: [
      { key: 'decay', label: 'Ausklingen', min: 0.05, max: 1.5, step: 0.01, def: 0.35, unit: 's' },
      { key: 'tone', label: 'Helligkeit', min: 3000, max: 14000, step: 50, def: 7000, unit: 'Hz', log: true },
      { key: 'metal', label: 'Metall ↔ Rauschen', min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
  },
  perc: {
    type: 'perc',
    label: 'Perc / Tom',
    short: 'PC',
    color: '#ff8a5b',
    melodic: true,
    description: 'Gestimmte Percussion: Toms, Rimshots, Congas, Blips.',
    params: [
      { key: 'decay', label: 'Ausklingen', min: 0.02, max: 1, step: 0.01, def: 0.15, unit: 's' },
      { key: 'octaves', label: 'Pitch-Tiefe', min: 0, max: 5, step: 0.1, def: 1.5, unit: 'Okt' },
      { key: 'pitchDecay', label: 'Pitch-Abfall', min: 0.002, max: 0.2, step: 0.002, def: 0.02, unit: 's' },
      {
        key: 'wave',
        label: 'Wellenform',
        def: 'sine',
        options: [
          { value: 'sine', label: 'Sinus' },
          { value: 'triangle', label: 'Dreieck' },
          { value: 'square', label: 'Rechteck' },
        ],
      },
      octave(4),
    ],
  },
  bass: {
    type: 'bass',
    label: 'Bass',
    short: 'BS',
    color: '#6a2cff',
    melodic: true,
    description: 'Subtraktiver Mono-Bass mit Filterhüllkurve und Glide.',
    params: [
      wave('sawtooth'),
      { key: 'cutoff', label: 'Filter', min: 40, max: 5000, step: 1, def: 220, unit: 'Hz', log: true },
      { key: 'res', label: 'Resonanz', min: 0.5, max: 15, step: 0.1, def: 2 },
      { key: 'envAmount', label: 'Filter-Hüllkurve', min: 0, max: 6, step: 0.1, def: 2.5, unit: 'Okt' },
      { key: 'decay', label: 'Filter-Abfall', min: 0.02, max: 1.5, step: 0.01, def: 0.18, unit: 's' },
      { key: 'release', label: 'Release', min: 0.01, max: 1, step: 0.01, def: 0.06, unit: 's' },
      { key: 'glide', label: 'Glide', min: 0, max: 0.3, step: 0.005, def: 0, unit: 's' },
      octave(1),
      gate(0.6),
    ],
  },
  acid: {
    type: 'acid',
    label: 'Acid 303',
    short: 'AC',
    color: '#b8ff3c',
    melodic: true,
    description: 'Acid-Linie: resonantes Filter, Akzent und Slide pro Step.',
    params: [
      {
        key: 'wave',
        label: 'Wellenform',
        def: 'sawtooth',
        options: [
          { value: 'sawtooth', label: 'Sägezahn' },
          { value: 'square', label: 'Rechteck' },
        ],
      },
      { key: 'cutoff', label: 'Cutoff', min: 60, max: 3000, step: 1, def: 320, unit: 'Hz', log: true },
      { key: 'res', label: 'Resonanz', min: 1, max: 25, step: 0.1, def: 12 },
      { key: 'envAmount', label: 'Env Mod', min: 0, max: 6, step: 0.1, def: 3 },
      { key: 'decay', label: 'Decay', min: 0.03, max: 1.5, step: 0.01, def: 0.25, unit: 's' },
      { key: 'accent', label: 'Akzent-Stärke', min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: 'glide', label: 'Slide-Zeit', min: 0.01, max: 0.2, step: 0.005, def: 0.06, unit: 's' },
      { key: 'dist', label: 'Verzerrung', min: 0, max: 1, step: 0.01, def: 0.35 },
      octave(2),
      gate(0.8),
    ],
  },
  stab: {
    type: 'stab',
    label: 'Chord Stab',
    short: 'ST',
    color: '#ff5ef0',
    melodic: true,
    description: 'Akkord-Stabs – ideal für Dub- und Detroit-Techno (mit Delay!).',
    params: [
      wave('sawtooth'),
      chord('minor7'),
      { key: 'cutoff', label: 'Filter', min: 100, max: 10000, step: 10, def: 1600, unit: 'Hz', log: true },
      { key: 'res', label: 'Resonanz', min: 0.5, max: 10, step: 0.1, def: 1.5 },
      { key: 'decay', label: 'Ausklingen', min: 0.03, max: 2, step: 0.01, def: 0.2, unit: 's' },
      { key: 'detune', label: 'Verstimmung', min: 0, max: 50, step: 1, def: 12, unit: 'ct' },
      octave(3),
      gate(0.5),
    ],
  },
  pad: {
    type: 'pad',
    label: 'Pad',
    short: 'PD',
    color: '#3d8bff',
    melodic: true,
    description: 'Breite, langsame Flächen für Atmosphäre und Melodic Techno.',
    params: [
      wave('fatsawtooth'),
      chord('minor9'),
      { key: 'attack', label: 'Einblenden', min: 0.01, max: 4, step: 0.01, def: 1.2, unit: 's' },
      { key: 'release', label: 'Ausblenden', min: 0.1, max: 8, step: 0.05, def: 3, unit: 's' },
      { key: 'cutoff', label: 'Filter', min: 100, max: 10000, step: 10, def: 1800, unit: 'Hz', log: true },
      { key: 'chorus', label: 'Chorus', min: 0, max: 1, step: 0.01, def: 0.5 },
      octave(3),
      gate(8),
    ],
  },
  fm: {
    type: 'fm',
    label: 'FM Lead',
    short: 'FM',
    color: '#00ff9c',
    melodic: true,
    description: 'FM-Synthese: Glocken, Plucks, metallische Leads.',
    params: [
      { key: 'harmonicity', label: 'Harmonie', min: 0.25, max: 8, step: 0.25, def: 3 },
      { key: 'modIndex', label: 'Mod-Tiefe', min: 0, max: 40, step: 0.5, def: 10 },
      { key: 'decay', label: 'Ausklingen', min: 0.02, max: 2, step: 0.01, def: 0.3, unit: 's' },
      { key: 'sustain', label: 'Sustain', min: 0, max: 1, step: 0.01, def: 0.1 },
      { key: 'release', label: 'Release', min: 0.01, max: 3, step: 0.01, def: 0.4, unit: 's' },
      octave(4),
      gate(1),
    ],
  },
  fx: {
    type: 'fx',
    label: 'FX / Riser',
    short: 'FX',
    color: '#ffffff',
    melodic: false,
    description: 'Riser, Downlifter, Impacts und Laser-Zaps für Übergänge.',
    params: [
      {
        key: 'mode',
        label: 'Effekt',
        def: 'riser',
        options: [
          { value: 'riser', label: 'Riser (Rauschen hoch)' },
          { value: 'down', label: 'Downlifter' },
          { value: 'impact', label: 'Impact' },
          { value: 'zap', label: 'Laser-Zap' },
        ],
      },
      { key: 'length', label: 'Länge', min: 1, max: 64, step: 1, def: 16, unit: 'Steps' },
      { key: 'q', label: 'Resonanz', min: 0.5, max: 15, step: 0.1, def: 4 },
    ],
  },
};

export const INSTRUMENT_ORDER: InstrumentType[] = [
  'kick', 'snare', 'clap', 'hat', 'openhat', 'perc', 'bass', 'acid', 'stab', 'pad', 'fm', 'fx',
];

export function defaultParams(type: InstrumentType): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of INSTRUMENTS[type].params) out[p.key] = p.def;
  return out;
}

/* ------------------------------------------------------------------ */
/*  Stimmen (Tone.js)                                                  */
/* ------------------------------------------------------------------ */

export interface TriggerInfo {
  step: Step;
  /** MIDI-Note (für melodische Spuren bereits inklusive Grundton) */
  midi: number;
  /** Dauer eines 16tel-Steps in Sekunden */
  stepDur: number;
  /** vorheriger Step hatte Slide (für Acid) */
  prevSlide: boolean;
}

export interface Voice {
  output: Tone.ToneAudioNode;
  set(params: Record<string, number | string>): void;
  trigger(time: number, info: TriggerInfo): void;
  dispose(): void;
}

const num = (p: Record<string, number | string>, k: string, d = 0) => {
  const v = p[k];
  return typeof v === 'number' ? v : d;
};
const str = (p: Record<string, number | string>, k: string, d: string) => {
  const v = p[k];
  return typeof v === 'string' ? v : d;
};
const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// Tone.js erlaubt die "fat"-Varianten im Typ nur über diese Schreibweise
type OscType = 'sawtooth' | 'square' | 'triangle' | 'sine' | 'fatsawtooth' | 'fatsquare';

class KickVoice implements Voice {
  output = new Tone.Gain(1);
  private body = new Tone.MembraneSynth({ envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.05 } });
  private dist = new Tone.Distortion(0.15);
  private click = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.008, sustain: 0, release: 0.005 } });
  private clickHp = new Tone.Filter(3000, 'highpass');
  private clickGain = new Tone.Gain(0.3);
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.body.chain(this.dist, this.output);
    this.click.chain(this.clickHp, this.clickGain, this.output);
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    this.body.pitchDecay = num(p, 'pitchDecay', 0.05);
    this.body.octaves = num(p, 'octaves', 6);
    this.body.envelope.decay = num(p, 'decay', 0.45);
    this.dist.distortion = num(p, 'drive', 0.15);
    this.dist.wet.value = num(p, 'drive') > 0.01 ? 1 : 0;
    this.clickGain.gain.value = num(p, 'click', 0.3);
  }
  trigger(time: number, { step }: TriggerInfo) {
    this.body.triggerAttackRelease(num(this.p, 'tune', 48), num(this.p, 'decay', 0.45), time, step.vel);
    this.click.triggerAttackRelease(0.01, time, step.vel);
  }
  dispose() {
    [this.body, this.dist, this.click, this.clickHp, this.clickGain, this.output].forEach((n) => n.dispose());
  }
}

class SnareVoice implements Voice {
  output = new Tone.Gain(1);
  private body = new Tone.MembraneSynth({ octaves: 2, pitchDecay: 0.02, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 } });
  private bodyGain = new Tone.Gain(0.6);
  private noise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.02 } });
  private noiseHp = new Tone.Filter(4000, 'highpass');
  private noiseGain = new Tone.Gain(0.6);
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.body.chain(this.bodyGain, this.output);
    this.noise.chain(this.noiseHp, this.noiseGain, this.output);
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    const snappy = num(p, 'snappy', 0.6);
    this.noiseGain.gain.value = snappy * 0.9;
    this.bodyGain.gain.value = 0.9 - snappy * 0.5;
    this.noise.envelope.decay = num(p, 'decay', 0.2);
    this.body.envelope.decay = Math.min(0.3, num(p, 'decay', 0.2) * 0.7);
    this.noiseHp.frequency.value = num(p, 'color', 4000);
  }
  trigger(time: number, { step }: TriggerInfo) {
    this.body.triggerAttackRelease(num(this.p, 'tune', 190), 0.1, time, step.vel);
    this.noise.triggerAttackRelease(num(this.p, 'decay', 0.2), time, step.vel);
  }
  dispose() {
    [this.body, this.bodyGain, this.noise, this.noiseHp, this.noiseGain, this.output].forEach((n) => n.dispose());
  }
}

class ClapVoice implements Voice {
  output = new Tone.Gain(1.4);
  private bp = new Tone.Filter(1300, 'bandpass');
  private burst = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.005 } });
  private tail = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.02 } });
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.burst.connect(this.bp);
    this.tail.connect(this.bp);
    this.bp.connect(this.output);
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    this.bp.frequency.value = num(p, 'tone', 1300);
    this.bp.Q.value = num(p, 'q', 1.2);
    this.tail.envelope.decay = num(p, 'decay', 0.25);
  }
  trigger(time: number, { step }: TriggerInfo) {
    const s = num(this.p, 'spread', 0.011);
    this.burst.triggerAttackRelease(0.005, time, step.vel);
    this.burst.triggerAttackRelease(0.005, time + s, step.vel * 0.9);
    this.burst.triggerAttackRelease(0.005, time + s * 2, step.vel * 0.85);
    this.tail.triggerAttackRelease(num(this.p, 'decay', 0.25), time + s * 3, step.vel);
  }
  dispose() {
    [this.bp, this.burst, this.tail, this.output].forEach((n) => n.dispose());
  }
}

class HatVoice implements Voice {
  output = new Tone.Gain(1);
  private metal = new Tone.MetalSynth({
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 8000,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
  });
  private metalGain = new Tone.Gain(0.5);
  private noise = new Tone.NoiseSynth({ envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 } });
  private noiseHp = new Tone.Filter(8000, 'highpass');
  private noiseGain = new Tone.Gain(0.5);
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.metal.chain(this.metalGain, this.output);
    this.noise.chain(this.noiseHp, this.noiseGain, this.output);
    this.metal.volume.value = -12;
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    const d = num(p, 'decay', 0.05);
    this.metal.envelope.decay = d;
    this.noise.envelope.decay = d;
    this.metal.resonance = num(p, 'tone', 8000);
    this.noiseHp.frequency.value = num(p, 'tone', 8000) * 0.8;
    const m = num(p, 'metal', 0.5);
    this.metalGain.gain.value = m;
    this.noiseGain.gain.value = (1 - m) * 0.7;
  }
  trigger(time: number, { step }: TriggerInfo) {
    const d = num(this.p, 'decay', 0.05);
    this.metal.triggerAttackRelease(220, d, time, step.vel);
    this.noise.triggerAttackRelease(d, time, step.vel);
  }
  dispose() {
    [this.metal, this.metalGain, this.noise, this.noiseHp, this.noiseGain, this.output].forEach((n) => n.dispose());
  }
}

class PercVoice implements Voice {
  output = new Tone.Gain(1);
  private synth = new Tone.MembraneSynth({ envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.02 } });
  constructor(params: Record<string, number | string>) {
    this.synth.connect(this.output);
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.synth.envelope.decay = num(p, 'decay', 0.15);
    this.synth.octaves = num(p, 'octaves', 1.5);
    this.synth.pitchDecay = num(p, 'pitchDecay', 0.02);
    this.synth.oscillator.type = str(p, 'wave', 'sine') as 'sine';
  }
  trigger(time: number, { step, midi }: TriggerInfo) {
    this.synth.triggerAttackRelease(midiToFreq(midi), 0.05, time, step.vel);
  }
  dispose() {
    this.synth.dispose();
    this.output.dispose();
  }
}

class BassVoice implements Voice {
  output = new Tone.Gain(1);
  private synth = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { type: 'lowpass', rolloff: -24, Q: 2 },
    envelope: { attack: 0.003, decay: 0.3, sustain: 0.7, release: 0.06 },
    filterEnvelope: { attack: 0.002, decay: 0.18, sustain: 0.05, release: 0.1, baseFrequency: 220, octaves: 2.5 },
  });
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.synth.connect(this.output);
    this.synth.volume.value = -4;
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    this.synth.oscillator.type = str(p, 'wave', 'sawtooth') as OscType;
    this.synth.filter.Q.value = num(p, 'res', 2);
    this.synth.filterEnvelope.baseFrequency = num(p, 'cutoff', 220);
    this.synth.filterEnvelope.octaves = num(p, 'envAmount', 2.5);
    this.synth.filterEnvelope.decay = num(p, 'decay', 0.18);
    this.synth.envelope.release = num(p, 'release', 0.06);
    this.synth.portamento = num(p, 'glide', 0);
  }
  trigger(time: number, { step, midi, stepDur }: TriggerInfo) {
    const dur = Math.max(0.02, num(this.p, 'gate', 0.6) * stepDur);
    this.synth.triggerAttackRelease(midiToFreq(midi), dur, time, step.vel);
  }
  dispose() {
    this.synth.dispose();
    this.output.dispose();
  }
}

class AcidVoice implements Voice {
  output = new Tone.Gain(1);
  private synth = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { type: 'lowpass', rolloff: -24, Q: 12 },
    envelope: { attack: 0.003, decay: 0.2, sustain: 0.8, release: 0.03 },
    filterEnvelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.05, baseFrequency: 320, octaves: 3 },
  });
  private dist = new Tone.Distortion(0.35);
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.synth.chain(this.dist, this.output);
    this.synth.volume.value = -8;
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    this.synth.oscillator.type = str(p, 'wave', 'sawtooth') as OscType;
    this.synth.filter.Q.value = num(p, 'res', 12);
    this.synth.filterEnvelope.baseFrequency = num(p, 'cutoff', 320);
    this.synth.filterEnvelope.octaves = num(p, 'envAmount', 3);
    this.synth.filterEnvelope.decay = num(p, 'decay', 0.25);
    this.dist.distortion = num(p, 'dist', 0.35);
  }
  trigger(time: number, { step, midi, stepDur, prevSlide }: TriggerInfo) {
    const accent = step.accent ? num(this.p, 'accent', 0.6) : 0;
    const vel = Math.min(1, step.vel * (0.7 + accent * 0.6));
    // Akzent öffnet das Filter zusätzlich
    this.synth.filterEnvelope.octaves = num(this.p, 'envAmount', 3) + accent * 1.5;
    const f = midiToFreq(midi);
    if (prevSlide) {
      this.synth.portamento = num(this.p, 'glide', 0.06);
      this.synth.setNote(f, time);
    } else {
      this.synth.portamento = 0;
      this.synth.triggerAttack(f, time, vel);
    }
    if (!step.slide) {
      this.synth.triggerRelease(time + Math.max(0.02, num(this.p, 'gate', 0.8) * stepDur));
    }
  }
  dispose() {
    this.synth.dispose();
    this.dist.dispose();
    this.output.dispose();
  }
}

class ChordVoice implements Voice {
  output = new Tone.Gain(1);
  private synth: Tone.PolySynth;
  private filter = new Tone.Filter(1600, 'lowpass');
  private chorus: Tone.Chorus | null = null;
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>, private pad: boolean) {
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: pad
        ? { attack: 1.2, decay: 0.5, sustain: 0.8, release: 3 }
        : { attack: 0.003, decay: 0.2, sustain: 0, release: 0.2 },
    });
    this.synth.maxPolyphony = 24;
    this.synth.volume.value = pad ? -16 : -12;
    if (pad) {
      this.chorus = new Tone.Chorus(0.6, 3.5, 0.6).start();
      this.synth.chain(this.filter, this.chorus, this.output);
    } else {
      this.synth.chain(this.filter, this.output);
    }
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    const type = str(p, 'wave', this.pad ? 'fatsawtooth' : 'sawtooth') as OscType;
    const oscOpts: Record<string, unknown> = { type };
    if (type.startsWith('fat')) {
      oscOpts.count = 3;
      oscOpts.spread = this.pad ? 30 : num(p, 'detune', 12) * 2;
    }
    const env = this.pad
      ? { attack: num(p, 'attack', 1.2), release: num(p, 'release', 3), decay: 0.5, sustain: 0.8 }
      : { decay: num(p, 'decay', 0.2), release: Math.max(0.05, num(p, 'decay', 0.2)), sustain: 0, attack: 0.003 };
    this.synth.set({ oscillator: oscOpts as never, envelope: env, detune: 0 });
    this.filter.frequency.value = num(p, 'cutoff', 1600);
    this.filter.Q.value = num(p, 'res', 1);
    if (this.chorus) this.chorus.wet.value = num(p, 'chorus', 0.5);
  }
  trigger(time: number, { step, midi, stepDur }: TriggerInfo) {
    const intervals = CHORDS[str(this.p, 'chord', 'minor')] ?? [0];
    const dur = Math.max(0.03, num(this.p, 'gate', this.pad ? 8 : 0.5) * stepDur);
    const notes = intervals.map((i) => midiToFreq(midi + i));
    this.synth.triggerAttackRelease(notes, dur, time, step.vel);
  }
  dispose() {
    this.synth.dispose();
    this.filter.dispose();
    this.chorus?.dispose();
    this.output.dispose();
  }
}

class FmVoice implements Voice {
  output = new Tone.Gain(1);
  private synth = new Tone.PolySynth(Tone.FMSynth);
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.synth.maxPolyphony = 8;
    this.synth.volume.value = -10;
    this.synth.connect(this.output);
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    this.synth.set({
      harmonicity: num(p, 'harmonicity', 3),
      modulationIndex: num(p, 'modIndex', 10),
      envelope: { attack: 0.002, decay: num(p, 'decay', 0.3), sustain: num(p, 'sustain', 0.1), release: num(p, 'release', 0.4) },
      modulationEnvelope: { attack: 0.002, decay: num(p, 'decay', 0.3) * 0.8, sustain: 0.2, release: num(p, 'release', 0.4) },
    });
  }
  trigger(time: number, { step, midi, stepDur }: TriggerInfo) {
    const dur = Math.max(0.03, num(this.p, 'gate', 1) * stepDur);
    this.synth.triggerAttackRelease(midiToFreq(midi), dur, time, step.vel);
  }
  dispose() {
    this.synth.dispose();
    this.output.dispose();
  }
}

class FxVoice implements Voice {
  output = new Tone.Gain(0.8);
  private noise = new Tone.Noise('white');
  private filter = new Tone.Filter(400, 'bandpass');
  private noiseEnv = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 0.1, sustain: 1, release: 0.1 });
  private osc = new Tone.Oscillator(1000, 'sawtooth');
  private oscEnv = new Tone.AmplitudeEnvelope({ attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 });
  private oscGain = new Tone.Gain(0.25);
  private p: Record<string, number | string> = {};
  constructor(params: Record<string, number | string>) {
    this.noise.chain(this.filter, this.noiseEnv, this.output);
    this.osc.chain(this.oscEnv, this.oscGain, this.output);
    this.noise.start();
    this.osc.start();
    this.set(params);
  }
  set(p: Record<string, number | string>) {
    this.p = p;
    this.filter.Q.value = num(p, 'q', 4);
  }
  trigger(time: number, { step, stepDur }: TriggerInfo) {
    const mode = str(this.p, 'mode', 'riser');
    const len = Math.max(stepDur, num(this.p, 'length', 16) * stepDur);
    const f = this.filter.frequency;
    f.cancelScheduledValues(time);
    if (mode === 'riser' || mode === 'down') {
      const [a, b] = mode === 'riser' ? [200, 9000] : [9000, 150];
      f.setValueAtTime(a, time);
      f.exponentialRampToValueAtTime(b, time + len);
      this.noiseEnv.attack = mode === 'riser' ? len * 0.9 : 0.01;
      this.noiseEnv.release = mode === 'riser' ? 0.05 : len * 0.9;
      this.noiseEnv.triggerAttackRelease(mode === 'riser' ? len : 0.02, time, step.vel);
    } else if (mode === 'impact') {
      f.setValueAtTime(3000, time);
      f.exponentialRampToValueAtTime(80, time + len);
      this.noiseEnv.attack = 0.002;
      this.noiseEnv.release = len;
      this.noiseEnv.triggerAttackRelease(0.01, time, step.vel);
    } else {
      const fr = this.osc.frequency;
      fr.cancelScheduledValues(time);
      fr.setValueAtTime(4000, time);
      fr.exponentialRampToValueAtTime(60, time + Math.min(len, 0.4));
      this.oscEnv.decay = Math.min(len, 0.4);
      this.oscEnv.triggerAttackRelease(0.01, time, step.vel);
    }
  }
  dispose() {
    [this.noise, this.filter, this.noiseEnv, this.osc, this.oscEnv, this.oscGain, this.output].forEach((n) => n.dispose());
  }
}

export function createVoice(type: InstrumentType, params: Record<string, number | string>): Voice {
  switch (type) {
    case 'kick':
      return new KickVoice(params);
    case 'snare':
      return new SnareVoice(params);
    case 'clap':
      return new ClapVoice(params);
    case 'hat':
    case 'openhat':
      return new HatVoice(params);
    case 'perc':
      return new PercVoice(params);
    case 'bass':
      return new BassVoice(params);
    case 'acid':
      return new AcidVoice(params);
    case 'stab':
      return new ChordVoice(params, false);
    case 'pad':
      return new ChordVoice(params, true);
    case 'fm':
      return new FmVoice(params);
    case 'fx':
      return new FxVoice(params);
  }
}
