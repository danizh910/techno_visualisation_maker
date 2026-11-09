import * as Tone from 'tone';
import type { Project, Step, Track } from '../types';
import { STEPS } from '../types';
import { INSTRUMENTS, createVoice, type Voice } from './instruments';
import { rootMidi } from '../music';

interface Channel {
  track: Track;
  type: Track['type'];
  voice: Voice;
  filter: Tone.Filter;
  drive: Tone.Distortion;
  panVol: Tone.PanVol;
  revSend: Tone.Gain;
  delSend: Tone.Gain;
}

export interface EngineOptions {
  getProject: () => Project;
  transport: ReturnType<typeof Tone.getTransport>;
  /** liefert das Pattern für einen Takt oder null (= nichts mehr spielen) */
  patternForBar: (bar: number) => number | null;
  live: boolean;
  onStep?: (step: number, bar: number, time: number) => void;
  onTrigger?: (trackId: string, vel: number, note: number, time: number) => void;
}

export function trackOctave(t: Track): number {
  const o = t.params.octave;
  return typeof o === 'number' ? o : 3;
}

export function spatial(t: Track): { pan: number; reverb: number } {
  const pan = Math.max(-1, Math.min(1, t.pos.x / 10));
  const dist = Math.hypot(t.pos.x, t.pos.z);
  const reverb = Math.max(0, Math.min(0.5, (dist - 3) / 14));
  return { pan, reverb };
}

export class Engine {
  readonly masterIn = new Tone.Gain(1);
  private comp = new Tone.Compressor({ threshold: -14, ratio: 3, attack: 0.008, release: 0.2, knee: 6 });
  private masterVol = new Tone.Volume(-2);
  private limiter = new Tone.Limiter(-0.8);
  private reverb = new Tone.Reverb({ decay: 4, preDelay: 0.02, wet: 1 });
  private delay = new Tone.FeedbackDelay({ delayTime: 0.3, feedback: 0.35, wet: 1 });
  private delayTone = new Tone.Filter({ type: 'bandpass', frequency: 1400, Q: 0.4 });
  readonly fft?: Tone.FFT;
  readonly waveform?: Tone.Waveform;

  private channels = new Map<string, Channel>();
  private stepCount = 0;
  private repeatId: number;

  constructor(private o: EngineOptions) {
    this.masterIn.chain(this.comp, this.masterVol, this.limiter, Tone.getDestination());
    this.reverb.connect(this.masterIn);
    this.delay.chain(this.delayTone, this.masterIn);
    if (o.live) {
      this.fft = new Tone.FFT({ size: 256, smoothing: 0.75 });
      this.waveform = new Tone.Waveform(512);
      this.limiter.connect(this.fft);
      this.limiter.connect(this.waveform);
    }
    this.syncTracks();
    this.updateMaster();
    this.updateTransport();
    this.repeatId = o.transport.scheduleRepeat((time) => this.tick(time), '16n', 0);
  }

  get project() {
    return this.o.getProject();
  }

  ready(): Promise<void> {
    return this.reverb.ready;
  }

  /* ---------------- Spuren ---------------- */

  syncTracks() {
    const ids = new Set(this.project.tracks.map((t) => t.id));
    for (const [id, ch] of this.channels) {
      if (!ids.has(id)) this.disposeChannel(ch, id);
    }
    for (const t of this.project.tracks) {
      const ch = this.channels.get(t.id);
      if (!ch || ch.type !== t.type) {
        if (ch) this.disposeChannel(ch, t.id);
        this.createChannel(t);
      } else {
        ch.track = t;
      }
    }
    this.updateMix();
  }

  private createChannel(t: Track) {
    const voice = createVoice(t.type, t.params);
    const filter = new Tone.Filter({ type: t.filterType, frequency: t.cutoff, Q: t.resonance, rolloff: -24 });
    const drive = new Tone.Distortion({ distortion: t.drive, wet: t.drive > 0 ? 1 : 0, oversample: '2x' });
    const panVol = new Tone.PanVol(t.pan, t.volume);
    const revSend = new Tone.Gain(0);
    const delSend = new Tone.Gain(0);
    voice.output.chain(filter, drive, panVol, this.masterIn);
    panVol.connect(revSend);
    panVol.connect(delSend);
    revSend.connect(this.reverb);
    delSend.connect(this.delay);
    this.channels.set(t.id, { track: t, type: t.type, voice, filter, drive, panVol, revSend, delSend });
  }

  private disposeChannel(ch: Channel, id: string) {
    // kurze Verzögerung, damit gerade klingende Noten nicht knacken
    const nodes = [ch.filter, ch.drive, ch.panVol, ch.revSend, ch.delSend];
    ch.panVol.volume.rampTo(-Infinity, 0.05);
    setTimeout(() => {
      ch.voice.dispose();
      nodes.forEach((n) => n.dispose());
    }, 200);
    this.channels.delete(id);
  }

  updateTrack(id: string) {
    const ch = this.channels.get(id);
    const t = this.project.tracks.find((x) => x.id === id);
    if (!ch || !t) return;
    ch.track = t;
    ch.voice.set(t.params);
    ch.filter.type = t.filterType;
    ch.filter.frequency.rampTo(t.cutoff, 0.03);
    ch.filter.Q.value = t.resonance;
    ch.drive.distortion = t.drive;
    ch.drive.wet.value = t.drive > 0 ? 1 : 0;
    this.updateMix();
  }

  updateMix() {
    const p = this.project;
    const anySolo = p.tracks.some((t) => t.solo);
    for (const t of p.tracks) {
      const ch = this.channels.get(t.id);
      if (!ch) continue;
      const sp = spatial(t);
      const pan = p.spatialMix ? sp.pan : t.pan;
      const rev = Math.min(1, t.reverb + (p.spatialMix ? sp.reverb : 0));
      ch.panVol.pan.rampTo(pan, 0.05);
      ch.panVol.volume.rampTo(t.volume, 0.03);
      ch.panVol.mute = t.mute || (anySolo && !t.solo);
      ch.revSend.gain.rampTo(rev, 0.05);
      ch.delSend.gain.rampTo(t.delay, 0.05);
    }
  }

  isAudible(t: Track): boolean {
    const anySolo = this.project.tracks.some((x) => x.solo);
    return !t.mute && (!anySolo || t.solo);
  }

  updateMaster() {
    const m = this.project.master;
    this.masterVol.volume.rampTo(m.volume, 0.05);
    this.comp.threshold.value = m.compThreshold;
    if (Math.abs(this.reverb.decay as number - m.reverbDecay) > 0.01) this.reverb.decay = m.reverbDecay;
    this.delay.feedback.value = m.delayFeedback;
    this.delay.delayTime.rampTo(Tone.Time(m.delayTime).toSeconds(), 0.05);
  }

  updateTransport() {
    const p = this.project;
    this.o.transport.bpm.value = p.bpm;
    this.o.transport.swing = p.swing;
    this.o.transport.swingSubdivision = '16n';
    this.delay.delayTime.value = Tone.Time(p.master.delayTime).toSeconds();
  }

  /* ---------------- Sequencer ---------------- */

  start(time?: number | string) {
    this.stepCount = 0;
    this.o.transport.position = 0;
    this.o.transport.start(time);
  }

  stop() {
    this.o.transport.stop();
    this.stepCount = 0;
  }

  private stepAt(trackId: string, bar: number, step: number): Step | undefined {
    const pi = this.o.patternForBar(bar);
    if (pi == null) return undefined;
    return this.project.patterns[pi]?.steps[trackId]?.[step];
  }

  private tick(time: number) {
    const bar = Math.floor(this.stepCount / STEPS);
    const step = this.stepCount % STEPS;
    this.stepCount++;
    const pi = this.o.patternForBar(bar);
    if (pi == null) return;
    const pat = this.project.patterns[pi];
    const p = this.project;
    const stepDur = Tone.Time('16n').toSeconds();
    for (const t of p.tracks) {
      const s = pat.steps[t.id]?.[step];
      if (!s?.on || !this.isAudible(t)) continue;
      const ch = this.channels.get(t.id);
      if (!ch) continue;
      const melodic = INSTRUMENTS[t.type].melodic;
      const midi = melodic ? rootMidi(p.key, trackOctave(t)) + s.note : 60;
      const prev = step > 0 ? pat.steps[t.id]?.[step - 1] : this.stepAt(t.id, bar - 1, STEPS - 1);
      try {
        ch.voice.trigger(time, { step: s, midi, stepDur, prevSlide: !!(prev?.on && prev.slide) });
      } catch (e) {
        console.warn('Trigger-Fehler', t.name, e);
      }
      this.o.onTrigger?.(t.id, s.vel, s.note, time);
    }
    this.o.onStep?.(step, bar, time);
  }

  /** Spur sofort anspielen (Vorhören / Tastatur) */
  preview(trackId: string, note = 0, vel = 0.9) {
    const t = this.project.tracks.find((x) => x.id === trackId);
    const ch = this.channels.get(trackId);
    if (!t || !ch) return;
    const melodic = INSTRUMENTS[t.type].melodic;
    const midi = melodic ? rootMidi(this.project.key, trackOctave(t)) + note : 60;
    const time = Tone.now() + 0.03;
    try {
      ch.voice.trigger(time, {
        step: { on: true, vel, note, accent: false, slide: false },
        midi,
        stepDur: Tone.Time('16n').toSeconds(),
        prevSlide: false,
      });
    } catch (e) {
      console.warn('Preview-Fehler', e);
    }
    this.o.onTrigger?.(trackId, vel, note, time);
  }

  dispose() {
    this.o.transport.clear(this.repeatId);
    for (const [id, ch] of this.channels) this.disposeChannel(ch, id);
    [this.masterIn, this.comp, this.masterVol, this.limiter, this.reverb, this.delay, this.delayTone].forEach((n) => n.dispose());
    this.fft?.dispose();
    this.waveform?.dispose();
  }
}
