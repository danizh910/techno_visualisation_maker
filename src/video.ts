import {
  Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, CanvasSource, AudioBufferSource,
  QUALITY_HIGH, canEncodeVideo, canEncodeAudio,
} from 'mediabunny';
import type { Project } from './types';
import { renderAudio } from './audio/export';
import type { Scene3D } from './viz/scene';

export interface VideoOptions {
  project: Project;
  sequence: number[];
  filters?: number[];
  scene: Scene3D;
  width: number;
  height: number;
  fps: number;
  onProgress: (phase: string, frac: number) => void;
  signal: { cancelled: boolean };
}

/** MP4 (H.264 + AAC) wenn der Browser es kann, sonst WebM (VP9/VP8 + Opus) */
async function pickFormat(w: number, h: number) {
  if ((await canEncodeVideo('avc', { width: w, height: h })) && (await canEncodeAudio('aac'))) {
    return { format: new Mp4OutputFormat({ fastStart: 'in-memory' }), video: 'avc' as const, audio: 'aac' as const, ext: 'mp4', mime: 'video/mp4' };
  }
  const video = (await canEncodeVideo('vp9', { width: w, height: h })) ? ('vp9' as const) : ('vp8' as const);
  return { format: new WebMOutputFormat(), video, audio: 'opus' as const, ext: 'webm', mime: 'video/webm' };
}

/* -------- Spektrum aus dem gerenderten Audio (wie Tone.FFT, in dB) -------- */
const N = 256;
function makeSpectrum(buf: AudioBuffer) {
  const l = buf.getChannelData(0);
  const r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const out = new Float32Array(N / 2);
  const smooth = new Float32Array(N / 2).fill(-100);
  return (t: number) => {
    const start = Math.floor(t * buf.sampleRate) - N;
    for (let i = 0; i < N; i++) {
      const k = start + i;
      const s = k >= 0 && k < l.length ? (l[k] + r[k]) * 0.5 : 0;
      re[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let i = 0; i < N / 2; i++) {
      const db = 20 * Math.log10((Math.hypot(re[i], im[i]) * 2) / N + 1e-9);
      smooth[i] = smooth[i] * 0.6 + db * 0.4;
      out[i] = smooth[i];
    }
    return out;
  };
}

/** iterative Radix-2-FFT in place */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/**
 * Rendert Track + 3D-Show frame-genau als Video: erst das Audio offline (inkl. Protokoll aller Anschläge),
 * dann jedes Bild mit fester Zeit – ruckelt nie, egal wie langsam der Rechner ist.
 */
export async function exportVideo(o: VideoOptions): Promise<{ blob: Blob; ext: string }> {
  const { scene, fps } = o;
  o.onProgress('Audio wird gerendert …', 0);
  const audio = await renderAudio(o.project, o.sequence, o.filters, 7);
  if (o.signal.cancelled) throw new Error('abgebrochen');

  const fmt = await pickFormat(o.width, o.height);
  const output = new Output({ format: fmt.format, target: new BufferTarget() });
  // WebGL leert seinen Puffer nach dem Anzeigen → jedes Bild sofort in eine 2D-Leinwand kopieren
  const gl = scene.renderer.domElement;
  const frame = document.createElement('canvas');
  frame.width = o.width;
  frame.height = o.height;
  const ctx = frame.getContext('2d')!;
  const video = new CanvasSource(frame, { codec: fmt.video, quality: QUALITY_HIGH });
  const sound = new AudioBufferSource({ codec: fmt.audio, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  output.addAudioTrack(sound);
  await output.start();

  const prevAnalyser = scene.analyser;
  const prevAuto = scene.autoCam;
  const spectrum = makeSpectrum(audio.buffer);
  let fftNow: Float32Array | null = null;
  scene.pauseLoop(true);
  scene.setRenderSize(o.width, o.height, 1);
  scene.resetEnergy();
  scene.analyser = () => fftNow;
  scene.autoCam = true;
  try {
    const total = Math.ceil(audio.buffer.duration * fps);
    let ev = 0;
    let st = 0;
    for (let f = 0; f < total; f++) {
      if (o.signal.cancelled) throw new Error('abgebrochen');
      const t = f / fps;
      while (ev < audio.events.length && audio.events[ev].time <= t) {
        const e = audio.events[ev++];
        scene.trigger(e.id, e.vel, e.note);
      }
      while (st < audio.steps.length && audio.steps[st].time <= t) scene.setPlayStep(audio.steps[st++].step);
      if (st >= audio.steps.length && t > audio.steps[audio.steps.length - 1]?.time + 0.2) scene.setPlayStep(-1);
      fftNow = spectrum(t);
      scene.step(1 / fps, t);
      ctx.drawImage(gl, 0, 0, o.width, o.height);
      await video.add(t, 1 / fps);
      if (f % 15 === 0) {
        o.onProgress(`Bild ${f + 1} / ${total}`, f / total);
        // UI kurz atmen lassen (Fortschritt, Abbrechen-Knopf)
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    o.onProgress('Audio wird eingebettet …', 1);
    await sound.add(audio.buffer);
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    scene.analyser = prevAnalyser;
    scene.autoCam = prevAuto;
    scene.setPlayStep(-1);
    scene.resetEnergy();
    scene.pauseLoop(false);
  }
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('Video konnte nicht erstellt werden');
  return { blob: new Blob([buf], { type: fmt.mime }), ext: fmt.ext };
}
