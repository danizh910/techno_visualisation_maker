import './style.css';
import * as Tone from 'tone';
import { store, loadAutosave, validateProject, emptyProject, ACCENTS } from './store';
import { Engine } from './audio/engine';
import { renderToWav, downloadBlob } from './audio/export';
import { GENRES, buildPreset } from './presets';
import { buildSong, generate, mutate, euclid } from './groove';
import { Scene3D } from './viz/scene';
import { NOTE_NAMES, SCALES } from './music';
import { PATTERN_NAMES, type Project, type ScaleName, type SceneName } from './types';
import { clear, h, icon } from './ui/dom';
import { mountSequencer, rollTracks } from './ui/sequencer';
import { mountPianoRoll } from './ui/pianoRoll';
import { mountMixer } from './ui/mixer';
import { mountSoundEditor } from './ui/soundEditor';
import { mountArrangement } from './ui/arrangement';

/* ------------------------------------------------------------------ */
/*  Grundgerüst                                                        */
/* ------------------------------------------------------------------ */

const app = document.getElementById('app')!;
const topbar = h('header', { class: 'topbar' });
const sceneEl = h('div', { class: 'scene' });
const overlay = h('div', { class: 'scene-overlay' });
const editor = h('aside', { class: 'side' });
const stage = h('main', { class: 'stage' }, sceneEl, overlay, editor);
const tabsNav = h('nav', { class: 'tabs' });
const panes = {
  seq: h('div', { class: 'pane' }),
  piano: h('div', { class: 'pane' }),
  mixer: h('div', { class: 'pane' }),
  arr: h('div', { class: 'pane' }),
};
const dock = h('section', { class: 'dock' }, tabsNav, h('div', { class: 'tab-body' }, Object.values(panes)));
app.append(topbar, stage, dock);

/* ------------------------------------------------------------------ */
/*  Audio + 3D                                                         */
/* ------------------------------------------------------------------ */

const draw = Tone.getDraw();
const songIndex = (bar: number) => bar % store.project.song.length;

const engine = new Engine({
  getProject: () => store.project,
  transport: Tone.getTransport(),
  live: true,
  patternForBar: (bar) => (store.mode === 'song' ? store.project.song[songIndex(bar)] : store.currentPattern),
  filterForBar: (bar) => {
    if (store.mode !== 'song') return [1, 1];
    const f = store.project.songFilter;
    const i = songIndex(bar);
    return [f[i] ?? 1, f[(i + 1) % f.length] ?? 1];
  },
  onStep: (step, bar, time) => {
    draw.schedule(() => {
      if (!store.playing) return;
      store.playStep = step;
      store.playBar = bar;
      if (store.mode === 'song') {
        const pi = store.project.song[songIndex(bar)];
        if (pi !== store.currentPattern) {
          store.currentPattern = pi;
          store.emit('pattern');
        }
      }
      scene.setPlayStep(step);
      store.emit('playstate');
    }, time);
  },
  onTrigger: (id, vel, note, time) => {
    draw.schedule(() => scene.trigger(id, vel, note), time);
  },
});

const scene = new Scene3D(sceneEl, {
  onSelect: (id) => store.select(id),
  onMoving: (id, x, z) => moveTrack(id, x, z),
  onMove: (id, x, z) => moveTrack(id, x, z),
});
scene.analyser = () => (engine.fft ? (engine.fft.getValue() as Float32Array) : null);

function moveTrack(id: string, x: number, z: number) {
  const t = store.track(id);
  if (!t) return;
  t.pos = { x, z };
  engine.updateMix();
  store.emit('position', id);
}

function syncScene() {
  scene.syncTracks(store.project.tracks, (id) => store.steps(id), (t) => engine.isAudible(t));
}

function applyLook() {
  const p = store.project;
  scene.setAccent(p.accent);
  scene.setLook(p.scene);
  document.documentElement.style.setProperty('--accent', p.accent);
}

store.on('project', () => {
  engine.syncTracks();
  engine.updateMaster();
  engine.updateTransport();
  syncScene();
  applyLook();
});
store.on('tracks', () => {
  engine.syncTracks();
  syncScene();
});
store.on('track', (id) => {
  if (id) engine.updateTrack(id);
  syncScene();
});
store.on(['steps', 'pattern'], syncScene);
store.on('master', () => engine.updateMaster());
store.on('transport', () => engine.updateTransport());
store.on('look', applyLook);
store.on('selection', () => scene.setSelected(store.selectedTrackId));

const preview = (id: string, note = 0) => {
  void Tone.start();
  engine.preview(id, note);
};

/* ------------------------------------------------------------------ */
/*  Transport                                                          */
/* ------------------------------------------------------------------ */

async function play() {
  await Tone.start();
  if (store.playing) return;
  store.playing = true;
  engine.start('+0.05');
  store.emit('playstate');
  renderTopbar();
}

function stop() {
  engine.stop();
  store.playing = false;
  store.playStep = -1;
  store.playBar = -1;
  scene.setPlayStep(-1);
  store.emit('playstate');
  renderTopbar();
}

function setMode(m: 'pattern' | 'song') {
  store.mode = m;
  renderTopbar();
  store.emit('playstate');
}

/* ------------------------------------------------------------------ */
/*  Topbar                                                             */
/* ------------------------------------------------------------------ */

let patternBtns: HTMLElement[] = [];

function renderTopbar() {
  clear(topbar);
  const p = store.project;

  const bpm = h('input', { type: 'number', class: 'bpm', min: 60, max: 200, step: 1, value: String(p.bpm), title: 'Tempo (BPM)' });
  bpm.addEventListener('change', () => {
    p.bpm = Math.max(60, Math.min(200, parseFloat(bpm.value) || 132));
    bpm.value = String(p.bpm);
    store.emit('transport');
  });

  patternBtns = PATTERN_NAMES.map((name, i) =>
    h('button', {
      class: 'pat-btn' + (i === store.currentPattern ? ' on' : ''),
      title: `Pattern ${name} bearbeiten (Taste ${i + 1})`,
      onclick: () => selectPattern(i),
    }, name),
  );

  const genreSel = h('select', {
    class: 'genre',
    title: 'Genre-Preset laden',
    onchange: (e: Event) => {
      const g = GENRES.find((x) => x.id === (e.target as HTMLSelectElement).value);
      if (g && confirm(`Preset „${g.name}“ laden? Das aktuelle Projekt wird ersetzt.`)) loadProject(buildPreset(g));
      (e.target as HTMLSelectElement).value = '';
    },
  }, h('option', { value: '' }, 'Preset laden …'), GENRES.map((g) => h('option', { value: g.id }, `${g.name} · ${g.bpm}`)));

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const proj = validateProject(JSON.parse(await f.text()));
      if (!proj) throw new Error('ungültig');
      loadProject(proj);
    } catch {
      alert('Die Datei ist kein gültiges TECHNO//VIZ-Projekt.');
    }
  });

  const nameInput = h('input', { class: 'proj-name', value: p.name, maxlength: 40, title: 'Projektname' });
  nameInput.addEventListener('change', () => {
    p.name = nameInput.value.trim() || 'Neuer Track';
    nameInput.blur();
    store.emit('transport');
  });

  topbar.append(
    h('div', { class: 'logo' }, 'TECHNO', h('b', {}, '//'), 'VIZ'),
    h('div', { class: 'group transport' },
      h('button', {
        class: 'btn play' + (store.playing ? ' on' : ''),
        'data-hint': 'play',
        title: 'Abspielen / Stopp (Leertaste)',
        onclick: () => (store.playing ? stop() : play()),
      }, icon(store.playing ? 'stop' : 'play')),
      h('label', { class: 'mini' }, 'BPM', bpm),
    ),
    h('div', { class: 'group segs' },
      h('button', { class: 'seg' + (store.mode === 'pattern' ? ' on' : ''), title: 'Aktuelles Pattern in Schleife spielen', onclick: () => setMode('pattern') }, 'Loop'),
      h('button', { class: 'seg' + (store.mode === 'song' ? ' on' : ''), title: 'Arrangement (Song) abspielen', onclick: () => setMode('song') }, 'Song'),
    ),
    h('div', { class: 'group patterns' }, patternBtns),
    h('div', { class: 'group' },
      h('select', {
        title: 'Tonart',
        onchange: (e: Event) => { p.key = parseInt((e.target as HTMLSelectElement).value, 10); store.emit('transport'); },
      }, NOTE_NAMES.map((n, i) => h('option', { value: i, selected: i === p.key }, n))),
      h('select', {
        title: 'Tonleiter',
        onchange: (e: Event) => { p.scale = (e.target as HTMLSelectElement).value as ScaleName; store.emit('transport'); },
      }, Object.entries(SCALES).map(([k, s]) => h('option', { value: k, selected: k === p.scale }, s.label))),
    ),
    h('div', { class: 'spacer' }),
    h('div', { class: 'group' },
      nameInput,
      genreSel,
      h('button', { class: 'btn small ghost', title: 'Neues leeres Projekt', onclick: () => { if (confirm('Neues leeres Projekt beginnen?')) loadProject(emptyProject()); } }, 'Neu'),
      h('button', {
        class: 'btn small ghost',
        title: 'Projekt als Datei speichern',
        onclick: () => downloadBlob(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }), `${safeName(p.name)}.json`),
      }, 'Speichern'),
      h('button', { class: 'btn small ghost', title: 'Projektdatei laden', onclick: () => fileInput.click() }, 'Laden'),
      h('button', { class: 'btn small', title: 'Als WAV exportieren', onclick: exportWav }, 'WAV'),
      fileInput,
    ),
  );
}

function selectPattern(i: number) {
  store.currentPattern = i;
  store.emit('pattern');
}

const safeName = (s: string) => (s || 'track').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);

store.on(['project', 'transport'], renderTopbar);
store.on('pattern', () => patternBtns.forEach((b, i) => b.classList.toggle('on', i === store.currentPattern)));
store.on('playstate', () => {
  const playingPat = store.playing ? (store.mode === 'song' ? store.project.song[songIndex(Math.max(0, store.playBar))] : store.currentPattern) : -1;
  patternBtns.forEach((b, i) => b.classList.toggle('playing', i === playingPat));
});

/* ------------------------------------------------------------------ */
/*  Szenen-Overlay                                                     */
/* ------------------------------------------------------------------ */

const SCENES: { id: SceneName; label: string }[] = [
  { id: 'halle', label: 'Halle' },
  { id: 'linien', label: 'Linien' },
  { id: 'studio', label: 'Studio' },
];

function setScene(s: SceneName) {
  store.project.scene = s;
  store.emit('look');
  renderOverlay();
}

function renderOverlay() {
  clear(overlay);
  const p = store.project;
  overlay.append(
    h('div', { class: 'ov-btns' },
      h('div', { class: 'chip-group' },
        SCENES.map((s) => h('button', { class: 'chip' + (p.scene === s.id ? ' on' : ''), title: `Szene „${s.label}“ (Taste N wechselt)`, onclick: () => setScene(s.id) }, s.label)),
      ),
      h('div', { class: 'chip-group accents', title: 'Akzentfarbe' },
        ACCENTS.map((c) =>
          h('button', {
            class: 'acc' + (p.accent === c ? ' on' : ''),
            style: `--a:${c}`,
            title: 'Akzentfarbe',
            onclick: () => { p.accent = c; store.emit('look'); renderOverlay(); },
          }),
        ),
      ),
    ),
    h('div', { class: 'ov-btns' },
      h('button', {
        class: 'chip' + (p.spatialMix ? ' on' : ''),
        title: 'Raum-Mix: links/rechts = Panorama, Entfernung zur Mitte = mehr Hall',
        onclick: () => {
          p.spatialMix = !p.spatialMix;
          engine.updateMix();
          store.emit('transport');
          renderOverlay();
        },
      }, 'Raum-Mix'),
      h('button', { class: 'chip' + (scene.bloom ? ' on' : ''), title: 'Dezenter Glow (kostet Leistung)', onclick: () => { scene.bloom = !scene.bloom; renderOverlay(); } }, 'Glow'),
      h('button', { class: 'chip' + (scene.autoRotate ? ' on' : ''), title: 'Langsame Kamerafahrt', onclick: () => { scene.autoRotate = !scene.autoRotate; renderOverlay(); } }, 'Kamerafahrt'),
      h('button', { class: 'chip', title: 'Kamera zurücksetzen', onclick: () => scene.resetCamera() }, 'Kamera zurück'),
      h('button', { class: 'chip icon-chip', title: 'Tipps anzeigen', onclick: () => showTips(true) }, icon('help')),
    ),
    h('div', { class: 'ov-hint' }, 'Objekt ziehen = im Raum mischen · Klick = Sound · Ziehen im Leeren = Kamera · Mausrad = Zoom'),
  );
}
store.on(['project', 'look'], renderOverlay);

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

const TABS: { id: keyof typeof panes; label: string }[] = [
  { id: 'seq', label: 'Sequencer' },
  { id: 'piano', label: 'Piano-Roll' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'arr', label: 'Arrangement' },
];
let activeTab: keyof typeof panes = 'seq';
function renderTabs() {
  clear(tabsNav);
  for (const t of TABS) {
    tabsNav.append(h('button', { class: 'tab' + (t.id === activeTab ? ' on' : ''), onclick: () => { activeTab = t.id; renderTabs(); } }, t.label));
    panes[t.id].classList.toggle('on', t.id === activeTab);
  }
  tabsNav.append(h('div', { class: 'spacer' }), h('span', { class: 'kbd-hint' }, 'Leertaste Play · 1–8 Pattern · R Würfeln · M Mutieren · N Szene · A–K Tastatur'));
}

function loopToTrack() {
  if (!store.project.tracks.length) return;
  const src = PATTERN_NAMES[store.currentPattern];
  if (!confirm(`Aus Pattern ${src} einen kompletten Track bauen?\n\nIntro, Aufbau, Main, Break, Build-up, Drop, Fill und Outro werden in die Patterns A–H geschrieben (überschreibt sie) und als Song angeordnet.`)) return;
  const wasPlaying = store.playing;
  if (wasPlaying) stop();
  buildSong(store.project, store.currentPattern);
  store.currentPattern = 2;
  store.emit('project');
  store.emit('song');
  setMode('song');
  activeTab = 'arr';
  renderTabs();
  if (wasPlaying) void play();
}

mountSequencer(panes.seq, { preview, loopToTrack });
mountPianoRoll(panes.piano, preview);
mountMixer(panes.mixer);
mountArrangement(panes.arr, { onExport: () => exportWav(), loopToTrack });
mountSoundEditor(editor, preview);
renderTabs();

/* ------------------------------------------------------------------ */
/*  Export, Laden                                                      */
/* ------------------------------------------------------------------ */

function loadProject(p: Project) {
  if (store.playing) stop();
  store.load(p);
}

function busyModal(title: string, text: string) {
  const el = h('div', { class: 'modal' }, h('div', { class: 'modal-card' }, h('div', { class: 'spinner' }), h('h2', {}, title), h('p', {}, text)));
  document.body.append(el);
  return el;
}

async function exportWav() {
  const p = store.project;
  const song = store.mode === 'song';
  const seq = song ? p.song : [store.currentPattern, store.currentPattern, store.currentPattern, store.currentPattern];
  const busy = busyModal('Rendere WAV …', song ? `Song mit ${seq.length} Takten` : `Pattern ${PATTERN_NAMES[store.currentPattern]} × 4`);
  try {
    await new Promise((r) => setTimeout(r, 50));
    const blob = await renderToWav(p, seq, song ? p.songFilter : undefined);
    downloadBlob(blob, `${safeName(p.name)}.wav`);
  } catch (e) {
    console.error(e);
    alert('Export fehlgeschlagen: ' + (e as Error).message);
  } finally {
    busy.remove();
  }
}

/* ------------------------------------------------------------------ */
/*  Tastatur                                                           */
/* ------------------------------------------------------------------ */

const PIANO: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyZ: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14,
};
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') {
    e.preventDefault();
    // sonst löst der fokussierte Button beim Loslassen zusätzlich einen Klick aus
    if (tag === 'BUTTON') target.blur();
    if (store.playing) stop();
    else void play();
  } else if (/^Digit[1-8]$/.test(e.code)) {
    selectPattern(parseInt(e.code.slice(5), 10) - 1);
  } else if (e.code === 'KeyR' && !e.repeat) {
    rollTracks('dice');
  } else if (e.code === 'KeyM' && !e.repeat) {
    rollTracks('mutate');
  } else if (e.code === 'KeyN' && !e.repeat) {
    const i = SCENES.findIndex((s) => s.id === store.project.scene);
    setScene(SCENES[(i + 1) % SCENES.length].id);
  } else if (e.code === 'Enter' && store.selectedTrackId && tag !== 'BUTTON') {
    e.preventDefault();
    preview(store.selectedTrackId);
  } else if (e.code in PIANO && store.selectedTrackId && !e.repeat && !e.shiftKey) {
    preview(store.selectedTrackId, PIANO[e.code]);
  }
});

/* ------------------------------------------------------------------ */
/*  Onboarding                                                         */
/* ------------------------------------------------------------------ */

const TIPS_KEY = 'tvm-tips-seen';

function showTips(force = false) {
  try {
    if (!force && localStorage.getItem(TIPS_KEY)) return;
  } catch {
    /* ohne Speicher: Tipps einfach zeigen */
  }
  document.querySelector('.tips')?.remove();
  const close = () => {
    card.remove();
    try {
      localStorage.setItem(TIPS_KEY, '1');
    } catch {
      /* egal */
    }
  };
  const card = h('div', { class: 'tips', role: 'dialog', 'aria-label': 'Tipps' },
    h('div', { class: 'tips-head' }, h('strong', {}, 'So legst du los'), h('button', { class: 'icon', title: 'Schließen', onclick: close }, icon('clear'))),
    h('ol', {},
      h('li', {}, h('b', {}, 'Leertaste'), ' – der Beat läuft sofort.'),
      h('li', {}, h('b', {}, 'Würfeln'), ' (R) – neue Patterns, die immer zum Stil passen. ', h('b', {}, 'Mutieren'), ' (M) variiert nur leicht.'),
      h('li', {}, h('b', {}, 'Schloss'), ' an einer Spur – die bleibt beim Würfeln, wie sie ist.'),
      h('li', {}, 'Objekt anklicken → rechts die Regler ', h('b', {}, 'Dunkel/Hell, Kurz/Lang, Sauber/Dreckig'), '.'),
      h('li', {}, h('b', {}, 'Loop → Track'), ' – baut aus deinem Loop einen ganzen Song.'),
    ),
    h('button', { class: 'btn small accent', onclick: close }, 'Verstanden'),
  );
  stage.append(card);
}

/* ------------------------------------------------------------------ */
/*  Start: gespeichertes Projekt oder direkt ein groovendes Preset     */
/* ------------------------------------------------------------------ */

renderTopbar();
renderOverlay();
const saved = loadAutosave();
store.load(saved && saved.tracks.length ? saved : buildPreset(GENRES[0]));
showTips();

// für Tests / Debugging
Object.assign(window, { __tvm: { store, engine, scene, Tone, groove: { generate, mutate, euclid, buildSong }, renderToWav, validateProject, GENRES, buildPreset, loadProject } });
