import * as Tone from 'tone';
import type { Project } from '../types';
import { STEPS } from '../types';
import { Engine } from './engine';

export interface RenderEvent {
  time: number;
  id: string;
  vel: number;
  note: number;
}
export interface RenderResult {
  buffer: AudioBuffer;
  events: RenderEvent[];
  steps: { time: number; step: number; bar: number }[];
}

/** Seedbarer Zufall (mulberry32), damit Audio und Video dieselben Wahrscheinlichkeits-Steps haben */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rendert eine Takt-Folge offline. Es wird eine komplett eigene Engine im Offline-Kontext aufgebaut.
 * `filters` = Master-Filter pro Takt (wie project.songFilter), optional.
 */
export async function renderAudio(project: Project, sequence: number[], filters?: number[], seed = 1): Promise<RenderResult> {
  const snapshot: Project = JSON.parse(JSON.stringify(project));
  const stepDur = 60 / snapshot.bpm / 4;
  const seconds = sequence.length * STEPS * stepDur + Math.max(2, snapshot.master.reverbDecay);
  const events: RenderEvent[] = [];
  const steps: RenderResult['steps'] = [];

  const buffer = await Tone.Offline(async (ctx) => {
    const engine = new Engine({
      getProject: () => snapshot,
      transport: ctx.transport,
      live: false,
      rng: seeded(seed),
      patternForBar: (bar) => (bar < sequence.length ? sequence[bar] : null),
      filterForBar: (bar) => (filters && bar < filters.length ? [filters[bar], filters[bar + 1] ?? filters[bar]] : [1, 1]),
      onTrigger: (id, vel, note, time) => events.push({ id, vel, note, time }),
      onStep: (step, bar, time) => steps.push({ step, bar, time }),
    });
    await engine.ready();
    engine.start(0);
  }, seconds, 2, 44100);

  const audio = buffer.get();
  if (!audio) throw new Error('Rendering fehlgeschlagen');
  events.sort((a, b) => a.time - b.time);
  return { buffer: audio, events, steps };
}

export async function renderToWav(project: Project, sequence: number[], filters?: number[]): Promise<Blob> {
  return encodeWav((await renderAudio(project, sequence, filters)).buffer);
}

function encodeWav(buf: AudioBuffer): Blob {
  const channels = buf.numberOfChannels;
  const len = buf.length;
  const rate = buf.sampleRate;
  const bytes = 44 + len * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, len * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
