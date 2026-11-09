import type { InstrumentType, Macros, Project, Step, Track } from './types';
import { PATTERN_NAMES, STEPS, emptyStep, emptySteps } from './types';
import { INSTRUMENTS, NEUTRAL_MACROS, defaultParams } from './audio/instruments';

export type StoreEvent =
  | 'project' // alles neu (Laden, Preset)
  | 'tracks' // Spur hinzugefügt / entfernt
  | 'track' // Parameter einer Spur geändert (payload: trackId)
  | 'steps' // Steps geändert
  | 'pattern' // aktuelles Pattern gewechselt
  | 'song' // Arrangement geändert
  | 'transport' // BPM, Tonart, Stil …
  | 'master'
  | 'look' // Szene, Akzentfarbe
  | 'selection'
  | 'playstate'
  | 'position'; // Spur in 3D verschoben (payload: trackId)

type Listener = (payload?: string) => void;

let idCounter = 0;
export const uid = () => `t${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/** wählbare Akzentfarben (die Szene bleibt sonst monochrom) */
export const ACCENTS = ['#ff3b1f', '#ffb000', '#c6ff1a', '#4d8dff', '#f2efe9'];

export function createTrack(type: InstrumentType, overrides: Partial<Track> = {}): Track {
  const def = INSTRUMENTS[type];
  return {
    id: uid(),
    name: def.label,
    type,
    color: def.color,
    params: defaultParams(type),
    macros: { ...NEUTRAL_MACROS },
    volume: -6,
    pan: 0,
    mute: false,
    solo: false,
    reverb: 0.1,
    delay: 0,
    swing: 0,
    sidechain: 0,
    locked: false,
    euclid: { hits: 4, rot: 0 },
    filterType: 'lowpass',
    cutoff: 20000,
    resonance: 0.7,
    drive: 0,
    pos: { x: 0, z: 0 },
    ...overrides,
  };
}

export function emptyProject(): Project {
  return {
    version: 2,
    name: 'Neuer Track',
    bpm: 132,
    key: 9,
    scale: 'minor',
    style: 'berlin',
    scene: 'halle',
    accent: ACCENTS[0],
    tracks: [],
    patterns: PATTERN_NAMES.map(() => ({ steps: {} })),
    song: [0],
    songFilter: [1],
    master: { volume: -2, compThreshold: -14, reverbDecay: 4, delayTime: '8n.', delayFeedback: 0.35 },
    spatialMix: true,
  };
}

class Store {
  project: Project = emptyProject();
  currentPattern = 0;
  selectedTrackId: string | null = null;
  mode: 'pattern' | 'song' = 'pattern';
  playing = false;
  /** aktueller Step (0..15) und Takt im Song – nur zur Anzeige */
  playStep = -1;
  playBar = -1;

  private listeners = new Map<StoreEvent, Set<Listener>>();

  on(ev: StoreEvent | StoreEvent[], fn: Listener) {
    for (const e of Array.isArray(ev) ? ev : [ev]) {
      if (!this.listeners.has(e)) this.listeners.set(e, new Set());
      this.listeners.get(e)!.add(fn);
    }
  }

  emit(ev: StoreEvent, payload?: string) {
    this.listeners.get(ev)?.forEach((fn) => fn(payload));
    if (ev !== 'playstate' && ev !== 'selection') scheduleSave();
  }

  track(id: string | null): Track | undefined {
    return this.project.tracks.find((t) => t.id === id);
  }

  get selected(): Track | undefined {
    return this.track(this.selectedTrackId);
  }

  steps(trackId: string, patternIndex = this.currentPattern): Step[] {
    const pat = this.project.patterns[patternIndex];
    if (!pat.steps[trackId]) pat.steps[trackId] = emptySteps();
    return pat.steps[trackId];
  }

  select(id: string | null) {
    this.selectedTrackId = id;
    this.emit('selection');
  }

  addTrack(type: InstrumentType): Track {
    const t = createTrack(type);
    // Position: freie Stelle auf einem Kreis
    const n = this.project.tracks.length;
    const a = (n / 10) * Math.PI * 2;
    t.pos = { x: Math.round(Math.cos(a) * 7 * 10) / 10, z: Math.round(Math.sin(a) * 5 * 10) / 10 };
    const sameType = this.project.tracks.filter((x) => x.type === type).length;
    if (sameType) t.name = `${t.name} ${sameType + 1}`;
    this.project.tracks.push(t);
    this.emit('tracks');
    this.select(t.id);
    return t;
  }

  removeTrack(id: string) {
    this.project.tracks = this.project.tracks.filter((t) => t.id !== id);
    for (const p of this.project.patterns) delete p.steps[id];
    if (this.selectedTrackId === id) this.selectedTrackId = this.project.tracks[0]?.id ?? null;
    this.emit('tracks');
    this.emit('selection');
  }

  updateTrack(id: string, patch: Partial<Track>) {
    const t = this.track(id);
    if (!t) return;
    Object.assign(t, patch);
    this.emit('track', id);
  }

  setParam(id: string, key: string, value: number | string) {
    const t = this.track(id);
    if (!t) return;
    t.params[key] = value;
    this.emit('track', id);
  }

  /** Song-Kette ändern und Filter-Spur synchron halten */
  setSong(song: number[], filter?: number[]) {
    const p = this.project;
    p.song = song.length ? song.slice(0, 128) : [0];
    p.songFilter = p.song.map((_, i) => filter?.[i] ?? 1);
    this.emit('song');
  }

  load(p: Project) {
    this.project = p;
    this.currentPattern = 0;
    this.selectedTrackId = p.tracks[0]?.id ?? null;
    this.emit('project');
    this.emit('selection');
  }
}

export const store = new Store();

/* ---------------- Autosave (nur Komfort, darf fehlschlagen) ---------------- */
const SAVE_KEY = 'tvm-project-v1';
let saveTimer: number | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(store.project));
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, 600);
}

export function loadAutosave(): Project | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return validateProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

const num = (v: unknown, d: number, a = -Infinity, b = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d;

function normSteps(arr: unknown): Step[] {
  const src = Array.isArray(arr) ? arr : [];
  return Array.from({ length: STEPS }, (_, i) => {
    const s = (src[i] ?? {}) as Partial<Step>;
    return {
      ...emptyStep(),
      on: !!s.on,
      vel: num(s.vel, 1, 0.05, 1),
      note: Math.round(num(s.note, 0, 0, 24)),
      accent: !!s.accent,
      slide: !!s.slide,
      prob: num(s.prob, 1, 0.05, 1),
    };
  });
}

/** Lädt Projekte aller Versionen (v1 = Prototyp) und füllt fehlende Felder auf */
export function validateProject(p: unknown): Project | null {
  if (!p || typeof p !== 'object') return null;
  const proj = p as Omit<Project, 'version'> & { version: number; swing?: number };
  if ((proj.version !== 1 && proj.version !== 2) || !Array.isArray(proj.tracks) || !Array.isArray(proj.patterns)) return null;
  const v1 = proj.version === 1;
  const base = emptyProject();
  const merged = { ...base, ...proj, version: 2, master: { ...base.master, ...proj.master } } as Project & { swing?: number };
  delete merged.swing;
  merged.bpm = num(merged.bpm, 132, 60, 200);
  merged.tracks = merged.tracks
    .filter((t) => t && t.type in INSTRUMENTS)
    .map((t) => {
      const nt: Track = { ...createTrack(t.type), ...t, params: { ...defaultParams(t.type), ...t.params } };
      nt.macros = { ...NEUTRAL_MACROS, ...(t.macros as Partial<Macros> | undefined) };
      if (v1) {
        // globaler Swing wird Swing pro Spur, Neon-Farben werden monochrom
        nt.swing = t.type === 'kick' ? 0 : num(proj.swing, 0, 0, 1);
        nt.color = INSTRUMENTS[t.type].color;
      }
      return nt;
    });
  const ids = new Set(merged.tracks.map((t) => t.id));
  merged.patterns = PATTERN_NAMES.map((_, i) => {
    const steps: Record<string, Step[]> = {};
    for (const [id, arr] of Object.entries(proj.patterns[i]?.steps ?? {})) if (ids.has(id)) steps[id] = normSteps(arr);
    return { steps };
  });
  merged.song = (Array.isArray(merged.song) ? merged.song : [])
    .filter((i) => Number.isInteger(i) && i >= 0 && i < PATTERN_NAMES.length)
    .slice(0, 128);
  if (!merged.song.length) merged.song = [0];
  merged.songFilter = merged.song.map((_, i) => num(proj.songFilter?.[i], 1, 0, 1));
  return merged;
}

/* ---------------- Sound-Bibliothek (projektübergreifend, lokal) ---------------- */

export interface SavedSound {
  id: string;
  name: string;
  type: InstrumentType;
  params: Record<string, number | string>;
  macros: Macros;
  filterType: Track['filterType'];
  cutoff: number;
  resonance: number;
  drive: number;
}

const LIB_KEY = 'tvm-sounds-v1';

export function loadLibrary(): SavedSound[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIB_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((s) => s && s.type in INSTRUMENTS && typeof s.name === 'string') : [];
  } catch {
    return [];
  }
}

export function saveLibrary(list: SavedSound[]): boolean {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
