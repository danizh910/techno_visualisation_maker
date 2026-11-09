import * as Tone from 'tone';
import type { Project } from '../types';
import { STEPS } from '../types';
import { Engine } from './engine';

/**
 * Rendert den Song (oder ein Pattern mehrfach) offline und liefert eine WAV-Datei.
 * Es wird eine komplett eigene Engine im Offline-Kontext aufgebaut.
 */
export async function renderToWav(project: Project, sequence: number[]): Promise<Blob> {
  const snapshot: Project = JSON.parse(JSON.stringify(project));
  const stepDur = 60 / snapshot.bpm / 4;
  const seconds = sequence.length * STEPS * stepDur + Math.max(2, snapshot.master.reverbDecay);

  const buffer = await Tone.Offline(async (ctx) => {
    const engine = new Engine({
      getProject: () => snapshot,
      transport: ctx.transport,
      live: false,
      patternForBar: (bar) => (bar < sequence.length ? sequence[bar] : null),
    });
    await engine.ready();
    engine.start(0);
  }, seconds, 2, 44100);

  const audio = buffer.get();
  if (!audio) throw new Error('Rendering fehlgeschlagen');
  return encodeWav(audio);
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
