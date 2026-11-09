import * as Tone from 'tone';
import type { Project, Step, Track } from '../types';
import { STEPS } from '../types';
import { INSTRUMENTS, applyMacros, createVoice, type Voice } from './instruments';
import { rootMidi } from '../music';

interface Channel {
  track: Track;
  type: Track['type'];
  voice: Voice;
  filter: Tone.Filter;
  drive: Tone.Distortion;
  duck: Tone.Gain;
  panVol: Tone.PanVol;
  revSend: Tone.Gain;
  delSend: Tone.Gain;
}

export interface EngineOptions {
  getProject: () => Project;
  transport: ReturnType<typeof Tone.getTransport>;
  /** liefert das Pattern für einen Takt oder null (= nichts mehr spielen) */
  patternForBar: (bar: number) => number | null;
  /** Master-Filter am Anfang/Ende des Takts (0..1), Standard offen */
  filterForBar?: (bar: number) => [number, number];
  live: boolean;
  /** Zufall für Step-Wahrscheinlichkeiten (beim Video-Export geseedet) */
  rng?: () => number;
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

/** Spur-Filter und Drive inkl. Makro-Einfluss (Dunkel schließt den Tiefpass, Dreckig gibt Drive dazu) */
export function channelShape(t: Track): { cutoff: number; drive: number } {
  const m = t.macros;
  const dark = m.tone < 0.5 ? 20000 * Math.pow(2, -(0.5 - m.tone) * 9.2) : 20000;
  const cutoff = t.filterType === 'lowpass' ? Math.min(t.cutoff, dark) : t.cutoff;
  const drive = Math.max(t.drive, m.dirt > 0.5 ? (m.dirt - 0.5) * 1.2 : 0);
  return { cutoff, drive };
}

/** 0..1 → Hz für die Master-Filterfahrt */
export const filterHz = (v: number) => 120 * Math.pow(20000 / 120, Math.max(0, Math.min(1, v)));

export class Engine {
  readonly masterIn = new Tone.Gain(1);
  private masterFilter = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -24, Q: 1 });
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
  private filterOpen = true;
  private repeatId: number;
  private rng: () => number;

  constructor(private o: EngineOptions) {
    this.rng = o.rng ?? Math.random;
    this.masterIn.chain(this.masterFilter, this.comp, this.masterVol, this.limiter, Tone.getDestination());
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

  private get stepDur() {
    return 60 / this.project.bpm / 4;
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
        this.updateTrack(t.id);
      }
    }
    this.updateMix();
  }

  private createChannel(t: Track) {
    const shape = channelShape(t);
    const voice = createVoice(t.type, applyMacros(t.type, t.params, t.macros));
    const filter = new Tone.Filter({ type: t.filterType, frequency: shape.cutoff, Q: t.resonance, rolloff: -24 });
    const drive = new Tone.Distortion({ distortion: shape.drive, wet: shape.drive > 0 ? 1 : 0, oversample: '2x' });
    const duck = new Tone.Gain(1);
    const panVol = new Tone.PanVol(t.pan, t.volume);
    const revSend = new Tone.Gain(0);
    const delSend = new Tone.Gain(0);
    voice.output.chain(filter, drive, duck, panVol, this.masterIn);
    panVol.connect(revSend);
    panVol.connect(delSend);
    revSend.connect(this.reverb);
    delSend.connect(this.delay);
    this.channels.set(t.id, { track: t, type: t.type, voice, filter, drive, duck, panVol, revSend, delSend });
  }

  private disposeChannel(ch: Channel, id: string) {
    // stummschalten und kurz warten, damit gerade klingende Noten nicht knacken
    ch.panVol.mute = true;
    setTimeout(() => {
      ch.voice.dispose();
      [ch.filter, ch.drive, ch.duck, ch.panVol, ch.revSend, ch.delSend].forEach((n) => n.dispose());
    }, 200);
    this.channels.delete(id);
  }

  updateTrack(id: string) {
    const ch = this.channels.get(id);
    const t = this.project.tracks.find((x) => x.id === id);
    if (!ch || !t) return;
    ch.track = t;
    const shape = channelShape(t);
    ch.voice.set(applyMacros(t.type, t.params, t.macros));
    ch.filter.type = t.filterType;
    ch.filter.frequency.rampTo(shape.cutoff, 0.03);
    ch.filter.Q.value = t.resonance;
    ch.drive.distortion = shape.drive;
    ch.drive.wet.value = shape.drive > 0 ? 1 : 0;
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
    if (Math.abs((this.reverb.decay as number) - m.reverbDecay) > 0.01) this.reverb.decay = m.reverbDecay;
    this.delay.feedback.value = m.delayFeedback;
    this.delay.delayTime.rampTo(this.o.transport.toSeconds(m.delayTime), 0.05);
  }

  updateTransport() {
    const p = this.project;
    this.o.transport.bpm.value = p.bpm;
    // Swing läuft pro Spur im Sequencer, nicht global
    this.o.transport.swing = 0;
    this.delay.delayTime.value = this.o.transport.toSeconds(p.master.delayTime);
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
    const f = this.masterFilter.frequency;
    f.cancelScheduledValues(0);
    f.value = 20000;
    this.filterOpen = true;
    for (const ch of this.channels.values()) {
      ch.duck.gain.cancelScheduledValues(0);
      ch.duck.gain.value = 1;
    }
  }

  private stepAt(trackId: string, bar: number, step: number): Step | undefined {
    const pi = this.o.patternForBar(bar);
    if (pi == null) return undefined;
    return this.project.patterns[pi]?.steps[trackId]?.[step];
  }

  private automateFilter(bar: number, time: number) {
    const [a, b] = this.o.filterForBar?.(bar) ?? [1, 1];
    const f = this.masterFilter.frequency;
    if (a >= 0.999 && b >= 0.999) {
      if (this.filterOpen) return;
      f.cancelScheduledValues(time);
      f.setValueAtTime(20000, time);
      this.filterOpen = true;
      return;
    }
    f.cancelScheduledValues(time);
    f.setValueAtTime(filterHz(a), time);
    f.exponentialRampToValueAtTime(filterHz(b), time + this.stepDur * STEPS);
    this.filterOpen = false;
  }

  private tick(time: number) {
    const bar = Math.floor(this.stepCount / STEPS);
    const step = this.stepCount % STEPS;
    this.stepCount++;
    const pi = this.o.patternForBar(bar);
    if (pi == null) return;
    if (step === 0) this.automateFilter(bar, time);
    const pat = this.project.patterns[pi];
    const p = this.project;
    const stepDur = this.stepDur;
    const kickTimes: number[] = [];
    for (const t of p.tracks) {
      const s = pat.steps[t.id]?.[step];
      if (!s?.on || !this.isAudible(t)) continue;
      // Wahrscheinlichkeit: Step spielt nur mit X % Chance
      if (s.prob < 1 && this.rng() >= s.prob) continue;
      const ch = this.channels.get(t.id);
      if (!ch) continue;
      // Swing pro Spur: 2. und 4. Sechzehntel jeder Zählzeit nach hinten
      const at = step % 2 === 1 ? time + t.swing * stepDur * 0.5 : time;
      const melodic = INSTRUMENTS[t.type].melodic;
      const midi = melodic ? rootMidi(p.key, trackOctave(t)) + s.note : 60;
      const prev = step > 0 ? pat.steps[t.id]?.[step - 1] : this.stepAt(t.id, bar - 1, STEPS - 1);
      try {
        ch.voice.trigger(at, { step: s, midi, stepDur, prevSlide: !!(prev?.on && prev.slide) });
      } catch (e) {
        console.warn('Trigger-Fehler', t.name, e);
      }
      if (t.type === 'kick') kickTimes.push(at);
      this.o.onTrigger?.(t.id, s.vel, s.note, at);
    }
    if (kickTimes.length) this.duck(Math.min(...kickTimes), stepDur);
    this.o.onStep?.(step, bar, time);
  }

  /** Sidechain: alle Spuren mit Anteil ducken sich unter die Kick und kommen in ~einer Zählzeit zurück */
  private duck(time: number, stepDur: number) {
    for (const ch of this.channels.values()) {
      const amt = ch.track.sidechain;
      if (amt <= 0 || ch.type === 'kick') continue;
      const g = ch.duck.gain;
      g.cancelAndHoldAtTime(time);
      g.linearRampToValueAtTime(1 - amt * 0.92, time + 0.004);
      g.setTargetAtTime(1, time + 0.02, stepDur * 0.9);
    }
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
        step: { on: true, vel, note, accent: false, slide: false, prob: 1 },
        midi,
        stepDur: this.stepDur,
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
    [this.masterIn, this.masterFilter, this.comp, this.masterVol, this.limiter, this.reverb, this.delay, this.delayTone].forEach((n) => n.dispose());
    this.fft?.dispose();
    this.waveform?.dispose();
  }
}
