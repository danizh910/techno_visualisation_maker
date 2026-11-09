import type { InstrumentType, Project, Step, StyleName, Track } from './types';
import { STEPS, emptySteps } from './types';
import { INSTRUMENTS } from './audio/instruments';

export type Rng = () => number;
const pick = <T>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const clone = (s: Step[]) => s.map((x) => ({ ...x }));

/* ------------------------------------------------------------------ */
/*  Notation                                                           */
/* ------------------------------------------------------------------ */

const DRUM_VEL: Record<string, number> = { x: 1, o: 0.65, g: 0.38, '?': 0.6 };

/** Drums: x = voll, o = mittel, g = Ghost, ? = 50 % Chance, . = aus (Leerzeichen egal) */
export function drum(s: string): Step[] {
  const out = emptySteps();
  s.replace(/\s+/g, '').split('').slice(0, STEPS).forEach((c, i) => {
    const vel = DRUM_VEL[c];
    if (vel === undefined) return;
    out[i].on = true;
    out[i].vel = vel;
    if (c === '?') out[i].prob = 0.5;
  });
  return out;
}

/** Melodisch: "0 . 3! 7~ 5? 12%" – Zahl = Halbton, ! = Akzent, ~ = Slide, ? = leise, % = 50 % Chance */
export function mel(s: string): Step[] {
  const out = emptySteps();
  s.trim().split(/\s+/).slice(0, STEPS).forEach((tok, i) => {
    const n = parseInt(tok, 10);
    if (Number.isNaN(n)) return;
    out[i] = {
      on: true,
      note: n,
      vel: tok.includes('?') ? 0.6 : 1,
      accent: tok.includes('!'),
      slide: tok.includes('~'),
      prob: tok.includes('%') ? 0.5 : 1,
    };
  });
  return out;
}

/** Euklidischer Rhythmus: `hits` Schläge möglichst gleichmäßig auf n Steps, um `rot` nach rechts verschoben */
export function euclid(hits: number, rot = 0, n = STEPS): boolean[] {
  const h = clamp(Math.round(hits), 0, n);
  const base = Array.from({ length: n }, (_, i) => h > 0 && (i * h) % n < h);
  const r = ((Math.round(rot) % n) + n) % n;
  return base.map((_, i) => base[(i - r + n) % n]);
}

/** Ton auf die Tonleiter ziehen (0..24) */
export function snap(n: number, scale: number[]): number {
  const inS = (x: number) => scale.includes(((x % 12) + 12) % 12);
  const v = clamp(n, 0, 24);
  if (inS(v)) return v;
  return inS(v - 1) && v > 0 ? v - 1 : Math.min(24, v + 1);
}

/* ------------------------------------------------------------------ */
/*  Genre-Regeln                                                       */
/* ------------------------------------------------------------------ */

interface Rule {
  /** Rhythmus-Vorlagen in Drum-Notation */
  rhythms?: string[];
  /** euklidische Raster [Schläge, Verschiebung] (Tribal-Percussion) */
  euclid?: [number, number][];
  /** wo zusätzliche Ghost-Schläge landen dürfen ('x' = erlaubt) und wie oft */
  extra?: string;
  extraP?: number;
  /** Chance, einen Nicht-Anker-Schlag wegzulassen */
  dropP?: number;
  /** Chance, dass ein leiser Step eine Wahrscheinlichkeit < 100 % bekommt */
  probP?: number;
  /** Tonvorrat in Halbtönen (wird auf die Tonleiter gezogen) */
  notes?: number[];
  /** mögliche Motivlängen (wiederholte Tonfolge = klingt nach Absicht) */
  motif?: number[];
  accentP?: number;
  slideP?: number;
}

export interface StyleDef {
  label: string;
  bpm: number;
  description: string;
  /** Swing pro Instrument, wenn ein Preset/Würfeln ihn setzt */
  swing: Partial<Record<InstrumentType, number>>;
  rules: Partial<Record<InstrumentType, Rule>>;
}

const ALL = 'xxxxxxxxxxxxxxxx';
const K4 = 'x...x...x...x...';
const OFF = '..x...x...x...x.';

const ACID: Rule = {
  rhythms: ['xxoxxoxoxxoxxoxo', 'x.xxx.xox.xx.xox', 'xx.xx.xxx.x.xx.x', 'x.x.xxx.x.xxx.xx'],
  notes: [0, 0, 12, 3, 7, 10, 1, 15],
  motif: [3, 4, 5, 8],
  accentP: 0.3,
  slideP: 0.2,
};

export const STYLES: Record<StyleName, StyleDef> = {
  berlin: {
    label: 'Berlin Rumble',
    bpm: 132,
    description: 'Dunkel, hypnotisch, Rumble-Kick, wenig Elemente, viel Raum.',
    swing: { hat: 0.12, shaker: 0.2, perc: 0.15, ride: 0.08 },
    rules: {
      kick: { rhythms: [K4, K4, 'x...x...x...x..g'] },
      hat: { rhythms: ['g.x.g.x.g.x.g.x.', 'ggxgggxgggxgggxg', OFF, 'g.xgg.x.g.xgg.xg'], extra: ALL, extraP: 0.1, probP: 0.5 },
      openhat: { rhythms: [OFF, '..o...x...o...x.', '......x.......x.'] },
      ride: { rhythms: ['..o...o...o...o.', 'g.o.g.o.g.o.g.o.', OFF], probP: 0.3 },
      shaker: { rhythms: ['gogogogogogogogo', '.og..og..og..og.'], probP: 0.4 },
      clap: { rhythms: ['....x.......x...', '............x...', '....x.......x..g', '....o.......x...'] },
      snare: { rhythms: ['............x...', '....x.......x...'] },
      perc: { euclid: [[3, 2], [5, 1], [3, 6], [4, 3], [5, 3]], notes: [0, 0, 7, 12, 5, 10, 3], dropP: 0.1, probP: 0.3 },
      bass: { rhythms: [OFF, '..x.......x.....', 'x.....x...x.....', '...x...x...x..x.'], notes: [0, 0, 0, 12, 7], motif: [1, 2, 2] },
      acid: ACID,
      stab: { rhythms: ['......x.........', '...x.......x....', '..x.......x...x.', '......x.....x...'], notes: [0, 0, 0, 5, 7], motif: [1, 1, 2] },
      pad: { rhythms: ['x...............', 'x.......x.......'], notes: [0, 0, 5, 8, 3], motif: [1, 2] },
      fm: { rhythms: ['x.....x.....x...', '..x..x....x..x..', 'x..x..x..x..x...'], notes: [0, 7, 12, 3, 10, 15, 19], motif: [2, 3, 4] },
      fx: { rhythms: ['x...............', '........x.......'] },
    },
  },
  hardgroove: {
    label: 'Hard Groove',
    bpm: 145,
    description: 'Schnell, geshuffelt, 16tel-Ride, geloopte Toms und Percussion.',
    swing: { hat: 0.4, shaker: 0.45, perc: 0.35, ride: 0.2, openhat: 0.1, clap: 0.15 },
    rules: {
      kick: { rhythms: [K4, 'x...x...x...x..g', 'x...x...x..gx...', 'x...x..gx...x...'] },
      ride: { rhythms: ['goxogoxogoxogoxo', 'oxoxoxoxoxoxoxox', 'gxgxgxgxgxgxgxgx', 'goxogoxogoxogoxx'], probP: 0.2 },
      hat: { rhythms: ['x.xox.xox.xox.xo', 'xgxgxgxgxgxgxgxg', '.x.x.x.x.x.x.x.x', 'x.xxx.xxx.xxx.xx', 'gxggxxgxgxggxxgx'], extra: ALL, extraP: 0.1, probP: 0.35 },
      openhat: { rhythms: [OFF, '..x...x...x..xx.'] },
      shaker: { rhythms: ['xgogxgogxgogxgog', 'ogxgogxgogxgogxg'], probP: 0.3 },
      clap: { rhythms: ['....x.......x...', '....x..g....x...', '....x.......x.g.', '....x..g....x..g'] },
      snare: { rhythms: ['....x.......x...', '..g.x.......x.g.'] },
      perc: {
        rhythms: ['x..x..x.x..x..x.', 'x..x..x...x..x..', '..x..x..x..x.x..', 'x.x..x.x..x.x..x'],
        euclid: [[5, 0], [7, 2], [6, 1], [5, 3], [9, 0]],
        notes: [0, 7, 12, 5, 3, 10, 0, 12],
        motif: [3, 4],
        dropP: 0.05,
        probP: 0.2,
      },
      bass: { rhythms: [OFF, '.xx..xx..xx..xx.', '..xx..x...xx..x.', 'x.x.x.x.x.x.x.x.'], notes: [0, 0, 0, 12, 7, 10], motif: [1, 2, 3] },
      acid: ACID,
      stab: { rhythms: ['..x..x....x..x..', '...x..x....x..x.', 'x..x..x.........'], notes: [0, 0, 3, 5, 7], motif: [1, 2] },
      pad: { rhythms: ['x...............'], notes: [0, 5, 3] },
      fm: { rhythms: ['x..x..x..x..x.x.', '.x..x..x..x..x..'], notes: [0, 12, 7, 3, 15], motif: [2, 3] },
      fx: { rhythms: ['x...............'] },
    },
  },
  bounce: {
    label: 'Bounce',
    bpm: 140,
    description: 'Offbeat-Bass mit Oktavsprüngen, rollend und hüpfend.',
    swing: { hat: 0.15, shaker: 0.25, perc: 0.2 },
    rules: {
      kick: { rhythms: [K4, K4, 'x...x...x...x.x.'] },
      bass: {
        rhythms: [OFF, '..xx..xx..xx..xx', '.xx..xx..xx..xx.', '..x.x.x...x.x.x.', '..x...xx..x...xx'],
        notes: [0, 0, 12, 0, 7, 12, 10],
        motif: [2, 2, 3, 4],
      },
      hat: { rhythms: ['.x.x.x.x.x.x.x.x', 'xxoxxxoxxxoxxxox', 'gxgxgxgxgxgxgxgx'], probP: 0.3 },
      openhat: { rhythms: [OFF] },
      ride: { rhythms: [OFF, 'o.x.o.x.o.x.o.x.'] },
      shaker: { rhythms: ['gxgxgxgxgxgxgxgx'], probP: 0.3 },
      clap: { rhythms: ['....x.......x...', '....x.......x..x', '....x..x....x...'] },
      snare: { rhythms: ['....x.......x...'] },
      perc: { rhythms: [OFF, '.x...x.x.x...x..'], euclid: [[3, 2], [5, 2], [6, 2]], notes: [12, 7, 12, 19, 0], motif: [2, 3] },
      acid: { ...ACID, rhythms: ['..x.x.x...x.x.x.', '.xx.xxx..xx.x.xx'], notes: [0, 12, 0, 7, 10, 12] },
      stab: { rhythms: [OFF, '..x.......x.....', '..x...x.....x...'], notes: [0, 0, 0, 7, 5], motif: [1, 2] },
      pad: { rhythms: ['x...............'], notes: [0, 5] },
      fm: { rhythms: ['..x...x...x..x..', 'x..x..x..x..x...'], notes: [0, 7, 12, 3], motif: [2, 3] },
      fx: { rhythms: ['x...............'] },
    },
  },
  classic: {
    label: 'Klassisch',
    bpm: 132,
    description: 'Allround-Techno-Regeln für die übrigen Genres.',
    swing: {},
    rules: {
      kick: { rhythms: [K4, 'x...x...x...x.x.', 'x...x...x..xx...'] },
      clap: { rhythms: ['....x.......x...', '....x.......x..o'] },
      snare: { rhythms: ['....x.......x...', '....x.......x.o.'] },
      hat: { rhythms: ['x.x.x.x.x.x.x.x.', 'oxooxoooxoxoxooo', OFF, ALL], extra: ALL, extraP: 0.1 },
      openhat: { rhythms: [OFF] },
      ride: { rhythms: [OFF, 'x.x.x.x.x.x.x.x.'] },
      shaker: { rhythms: ['xoxoxoxoxoxoxoxo'] },
      perc: { euclid: [[3, 2], [5, 1], [4, 2]], notes: [0, 7, 12, 5] },
      bass: { rhythms: ['.xxx.xxx.xxx.xxx', 'x..x..x.x..x..x.', OFF], notes: [0, 0, 12, 7, 3] },
      acid: ACID,
      stab: { rhythms: ['x..x..x...x.....', '..x.......x.....'], notes: [0, 0, 3, 5] },
      pad: { rhythms: ['x...............', 'x.......x.......'], notes: [0, 5, 8, 3] },
      fm: { rhythms: ['x.x.x.x.x.x.x.x.'], notes: [0, 3, 7, 12, 10], motif: [3, 4] },
      fx: { rhythms: ['x...............'] },
    },
  },
};

export const STYLE_ORDER: StyleName[] = ['berlin', 'hardgroove', 'bounce', 'classic'];

function ruleFor(style: StyleName, type: InstrumentType): Rule {
  return STYLES[style].rules[type] ?? STYLES.classic.rules[type] ?? { rhythms: ['x.......x.......'] };
}

/** Steps, die beim Mutieren nie angefasst werden (Kick bleibt 4/4, Clap bleibt auf 2 und 4) */
function anchorsFor(type: InstrumentType): number[] {
  if (type === 'kick') return [0, 4, 8, 12];
  if (type === 'clap' || type === 'snare') return [4, 12];
  return [];
}

function assignNotes(steps: Step[], r: Rule, scale: number[], rng: Rng) {
  const pool = (r.notes ?? [0]).map((n) => snap(n, scale));
  const len = pick(r.motif ?? [1, 2, 2, 3], rng);
  const motif = [0, ...Array.from({ length: len - 1 }, () => pick(pool, rng))];
  let k = 0;
  for (const s of steps) {
    if (!s.on) continue;
    s.note = motif[k++ % len];
    s.accent = rng() < (r.accentP ?? 0);
    s.slide = rng() < (r.slideP ?? 0);
  }
}

/** Genre-bewusstes Würfeln: neues Pattern für eine Spur, das immer nach dem Stil klingt */
export function generate(style: StyleName, type: InstrumentType, scale: number[], rng: Rng = Math.random): Step[] {
  const r = ruleFor(style, type);
  let steps: Step[];
  if (r.euclid && (!r.rhythms || rng() < 0.5)) {
    const [h, rot] = pick(r.euclid, rng);
    steps = euclid(h, rot).map((on, i) => ({ on, vel: i === rot ? 1 : pick([1, 0.65, 0.65], rng), note: 0, accent: false, slide: false, prob: 1 }));
  } else {
    steps = drum(pick(r.rhythms ?? ['x.......x.......'], rng));
  }
  const anchors = anchorsFor(type);
  steps.forEach((s, i) => {
    if (s.on && !anchors.includes(i) && rng() < (r.dropP ?? 0)) s.on = false;
    if (!s.on && r.extra?.[i] === 'x' && rng() < (r.extraP ?? 0)) {
      s.on = true;
      s.vel = 0.38;
    }
    if (s.on && s.vel < 0.7 && s.prob === 1 && rng() < (r.probP ?? 0)) s.prob = pick([0.5, 0.75], rng);
  });
  if (INSTRUMENTS[type].melodic) assignNotes(steps, r, scale, rng);
  return steps;
}

/** Mutieren: vorhandenes Pattern leicht variieren (amount 0..1), Anker bleiben stehen */
export function mutate(steps: Step[], style: StyleName, type: InstrumentType, scale: number[], amount: number, rng: Rng = Math.random): Step[] {
  const r = ruleFor(style, type);
  const anchors = anchorsFor(type);
  const melodic = INSTRUMENTS[type].melodic;
  const out = clone(steps);
  const used = out.filter((s) => s.on).map((s) => s.note);
  const pool = used.length ? used : (r.notes ?? [0]).map((n) => snap(n, scale));
  const p = 0.04 + amount * 0.3;
  out.forEach((s, i) => {
    if (anchors.includes(i)) return;
    // Kick nur selten anfassen – sie trägt den Groove
    if (type === 'kick' && rng() > amount * 0.3) return;
    const roll = rng();
    if (roll < p * 0.5) {
      if (s.on) s.on = false;
      else Object.assign(s, { on: true, vel: pick([0.38, 0.65, 1], rng), prob: 1, note: melodic ? pick(pool, rng) : 0, accent: false, slide: false });
    } else if (s.on && roll < p) {
      s.vel = clamp(Math.round((s.vel + (rng() - 0.5) * 0.5) * 100) / 100, 0.3, 1);
      if (melodic && rng() < 0.4) s.note = snap(pick(pool, rng) + pick([0, 0, 12, -12], rng), scale);
      if (!melodic && s.vel < 0.7 && rng() < 0.4) s.prob = pick([0.5, 0.75, 1], rng);
      if (type === 'acid') {
        if (rng() < 0.3) s.accent = !s.accent;
        if (rng() < 0.2) s.slide = !s.slide;
      }
    }
  });
  return out;
}

/** Euklidisches Raster auf eine Spur legen, vorhandene Töne werden der Reihe nach weiterverwendet */
export function applyEuclid(steps: Step[], hits: number, rot: number): Step[] {
  const notes = steps.filter((s) => s.on).map((s) => s.note);
  const src = notes.length ? notes : [0];
  let k = 0;
  return euclid(hits, rot).map((on, i) => {
    const s: Step = { on, vel: 1, note: 0, accent: false, slide: false, prob: 1 };
    if (on) {
      s.note = src[k % src.length];
      s.vel = i === ((rot % STEPS) + STEPS) % STEPS ? 1 : 0.7;
      k++;
    }
    return s;
  });
}

/* ------------------------------------------------------------------ */
/*  Loop → ganzer Track                                                */
/* ------------------------------------------------------------------ */

const TOPS: InstrumentType[] = ['hat', 'ride', 'shaker'];
const HITS: InstrumentType[] = ['clap', 'snare'];
const MUSIC: InstrumentType[] = ['acid', 'stab', 'pad', 'fm'];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Baut aus dem Loop `src` eine Song-Struktur in die Patterns A–H:
 * A Intro · B Aufbau · C Main · D Break · E Build-up · F Drop · G Fill · H Outro
 * und setzt Song-Kette + Filterfahrt.
 */
export function buildSong(p: Project, src: number) {
  const source = p.patterns[src].steps;
  const get = (t: Track) => clone(source[t.id] ?? emptySteps());
  const has = (types: InstrumentType[]) => p.tracks.some((t) => types.includes(t.type));
  const derive = (keep: (t: Track) => number, edit?: (t: Track, s: Step[]) => void) => {
    const steps: Record<string, Step[]> = {};
    for (const t of p.tracks) {
      const f = keep(t);
      const s = f > 0 ? get(t).map((x) => ({ ...x, vel: Math.max(0.2, x.vel * f) })) : emptySteps();
      edit?.(t, s);
      steps[t.id] = s;
    }
    return { steps };
  };
  const is = (t: Track, types: InstrumentType[]) => types.includes(t.type);
  const roll = (s: Step[], from: number) => {
    for (let i = from; i < STEPS; i++) Object.assign(s[i], { on: true, vel: lerp(0.4, 1, (i - from) / (STEPS - 1 - from)), prob: 1 });
  };
  const musicBreak = has(MUSIC);

  const patterns = [
    // A Intro: Kick + Tops
    derive((t) => (t.type === 'kick' || is(t, TOPS) ? 1 : 0)),
    // B Aufbau: alle Drums + Bass, noch keine Musik
    derive((t) => (is(t, MUSIC) || t.type === 'fx' ? 0 : 1)),
    // C Main: der Loop
    derive(() => 1),
    // D Break: keine Kick, kein Bass – Musik und Raum
    derive((t) => (is(t, MUSIC) ? 1 : t.type === 'fx' ? 0 : !musicBreak && (is(t, TOPS) || t.type === 'perc') ? 0.7 : 0)),
    // E Build-up: Kick in Vierteln, Clap-Roll, Riser
    derive(
      (t) => (is(t, MUSIC) || is(t, TOPS) || t.type === 'kick' ? 1 : 0),
      (t, s) => {
        if (t.type === 'kick') s.forEach((x, i) => Object.assign(x, { on: i % 4 === 0, vel: 1, prob: 1 }));
        if (is(t, HITS)) {
          s.forEach((x, i) => Object.assign(x, { on: i % 4 === 0, vel: 0.6, prob: 1 }));
          roll(s, 8);
        }
        if (t.type === 'fx') s[0].on = true;
      },
    ),
    // F Drop: der Loop mit voller Wucht
    derive(() => 1),
    // G Fill: letzte Zählzeit ohne Kick, Roll auf Clap/Snare, Toms abwärts
    derive(
      () => 1,
      (t, s) => {
        if (t.type === 'kick') for (let i = 12; i < STEPS; i++) s[i].on = false;
        if (is(t, HITS)) roll(s, 12);
        if (t.type === 'perc') [12, 7, 5, 0].forEach((n, k) => Object.assign(s[12 + k], { on: true, note: n, vel: 0.8 + k * 0.05, prob: 1 }));
        if (t.type === 'fx') s[0].on = true;
      },
    ),
    // H Outro: Kick, Tops, Perc
    derive((t) => (t.type === 'kick' || is(t, TOPS) || t.type === 'perc' || t.type === 'openhat' ? 1 : 0)),
  ];
  p.patterns = patterns;

  const song: number[] = [];
  const filt: number[] = [];
  const part = (pat: number, bars: number, f0 = 1, f1 = f0, fillAtEnd = false) => {
    for (let i = 0; i < bars; i++) {
      song.push(fillAtEnd && i === bars - 1 ? 6 : pat);
      filt.push(lerp(f0, f1, bars > 1 ? i / bars : 0));
    }
  };
  part(0, 8, 0.45, 1); // Intro mit Filter auf
  part(1, 8, 1, 1, true); // Aufbau
  part(2, 16, 1, 1, true); // Main
  part(3, 8, 0.8); // Break
  part(4, 8, 0.3, 1); // Build-up mit Filterfahrt
  part(5, 16, 1, 1, true); // Drop
  part(7, 8, 1, 0.35); // Outro, Filter zu
  p.song = song;
  p.songFilter = filt.map((v) => Math.round(v * 100) / 100);
}
