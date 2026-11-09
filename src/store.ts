import type { InstrumentType, Project, Step, Track } from './types';
import { PATTERN_NAMES, emptySteps } from './types';
import { INSTRUMENTS, defaultParams } from './audio/instruments';

export type StoreEvent =
  | 'project' // alles neu (Laden, Preset)
  | 'tracks' // Spur hinzugefügt / entfernt
  | 'track' // Parameter einer Spur geändert (payload: trackId)
  | 'steps' // Steps geändert
  | 'pattern' // aktuelles Pattern gewechselt
  | 'song' // Arrangement geändert
  | 'transport' // BPM, Swing, Tonart …
  | 'master'
  | 'selection'
  | 'playstate'
  | 'position'; // Spur in 3D verschoben (payload: trackId)

type Listener = (payload?: string) => void;

let idCounter = 0;
export const uid = () => `t${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function createTrack(type: InstrumentType, overrides: Partial<Track> = {}): Track {
  const def = INSTRUMENTS[type];
  return {
    id: uid(),
    name: def.label,
    type,
    color: def.color,
    params: defaultParams(type),
    volume: -6,
    pan: 0,
    mute: false,
    solo: false,
    reverb: 0.1,
    delay: 0,
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
    version: 1,
    name: 'Neuer Track',
    bpm: 130,
    swing: 0,
    key: 9,
    scale: 'minor',
    tracks: [],
    patterns: PATTERN_NAMES.map(() => ({ steps: {} })),
    song: [0],
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

export function validateProject(p: unknown): Project | null {
  if (!p || typeof p !== 'object') return null;
  const proj = p as Project;
  if (proj.version !== 1 || !Array.isArray(proj.tracks) || !Array.isArray(proj.patterns)) return null;
  const base = emptyProject();
  const merged: Project = { ...base, ...proj, master: { ...base.master, ...proj.master } };
  while (merged.patterns.length < PATTERN_NAMES.length) merged.patterns.push({ steps: {} });
  merged.tracks = merged.tracks
    .filter((t) => t && t.type in INSTRUMENTS)
    .map((t) => ({ ...createTrack(t.type), ...t, params: { ...defaultParams(t.type), ...t.params } }));
  if (!merged.song.length) merged.song = [0];
  return merged;
}
