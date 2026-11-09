import './style.css';
import * as Tone from 'tone';
import { store, loadAutosave, validateProject, emptyProject } from './store';
import { Engine } from './audio/engine';
import { renderToWav, downloadBlob } from './audio/export';
import { GENRES, buildPreset } from './presets';
import { Scene3D } from './viz/scene';
import { NOTE_NAMES, SCALES } from './music';
import { PATTERN_NAMES, type ScaleName } from './types';
import { clear, h } from './ui/dom';
import { mountSequencer } from './ui/sequencer';
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

const engine = new Engine({
  getProject: () => store.project,
  transport: Tone.getTransport(),
  live: true,
  patternForBar: (bar) => (store.mode === 'song' ? store.project.song[bar % store.project.song.length] : store.currentPattern),
  onStep: (step, bar, time) => {
    draw.schedule(() => {
      if (!store.playing) return;
      store.playStep = step;
      store.playBar = bar;
      if (store.mode === 'song') {
        const pi = store.project.song[bar % store.project.song.length];
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
  onMoving: (id, x, z) => {
    const t = store.track(id);
    if (!t) return;
    t.pos = { x, z };
    engine.updateMix();
    store.emit('position', id);
  },
  onMove: (id, x, z) => {
    const t = store.track(id);
    if (!t) return;
    t.pos = { x, z };
    engine.updateMix();
    store.emit('position', id);
  },
});
scene.analyser = () => (engine.fft ? (engine.fft.getValue() as Float32Array) : null);

function syncScene() {
  scene.syncTracks(store.project.tracks, (id) => store.steps(id), (t) => engine.isAudible(t));
}

store.on('project', () => {
  engine.syncTracks();
  engine.updateMaster();
  engine.updateTransport();
  syncScene();
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

/* ------------------------------------------------------------------ */
/*  Topbar                                                             */
/* ------------------------------------------------------------------ */

let patternBtns: HTMLElement[] = [];

function renderTopbar() {
  clear(topbar);
  const p = store.project;

  const bpm = h('input', { type: 'number', class: 'bpm', min: 60, max: 200, step: 1, value: String(p.bpm), title: 'Tempo (BPM)' });
  bpm.addEventListener('change', () => {
    p.bpm = Math.max(60, Math.min(200, parseFloat(bpm.value) || 130));
    bpm.value = String(p.bpm);
    store.emit('transport');
  });

  const swing = h('input', { type: 'range', min: 0, max: 0.6, step: 0.01, value: String(p.swing), title: 'Swing' });
  swing.addEventListener('input', () => {
    p.swing = parseFloat(swing.value);
    engine.updateTransport();
  });
  swing.addEventListener('change', () => store.emit('transport'));

  patternBtns = PATTERN_NAMES.map((name, i) =>
    h('button', {
      class: 'pat-btn' + (i === store.currentPattern ? ' on' : ''),
      title: `Pattern ${name} bearbeiten (Taste ${i + 1})`,
      onclick: () => {
        store.currentPattern = i;
        store.emit('pattern');
        renderTopbar();
      },
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
  }, h('option', { value: '' }, 'Genre-Preset …'), GENRES.map((g) => h('option', { value: g.id }, `${g.name} (${g.bpm})`)));

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      const proj = validateProject(JSON.parse(await f.text()));
      if (!proj) throw new Error('ungültig');
      loadProject(proj);
    } catch {
      alert('Die Datei ist kein gültiges Projekt.');
    }
  });

  topbar.append(
    h('div', { class: 'logo' }, h('span', {}, 'TECHNO'), h('b', {}, '//'), h('span', {}, 'VIZ')),
    h('div', { class: 'group transport' },
      h('button', {
        class: 'btn play' + (store.playing ? ' on' : ''),
        title: 'Abspielen / Stopp (Leertaste)',
        onclick: () => (store.playing ? stop() : play()),
      }, store.playing ? '■' : '▶'),
      h('label', { class: 'mini' }, 'BPM', bpm),
      h('label', { class: 'mini' }, 'Swing', swing),
    ),
    h('div', { class: 'group mode' },
      h('button', {
        class: 'seg' + (store.mode === 'pattern' ? ' on' : ''),
        title: 'Aktuelles Pattern in Schleife spielen',
        onclick: () => { store.mode = 'pattern'; renderTopbar(); store.emit('playstate'); },
      }, 'Pattern'),
      h('button', {
        class: 'seg' + (store.mode === 'song' ? ' on' : ''),
        title: 'Arrangement (Song) abspielen',
        onclick: () => { store.mode = 'song'; renderTopbar(); store.emit('playstate'); },
      }, 'Song'),
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
      genreSel,
      h('button', { class: 'btn small', title: 'Neues leeres Projekt', onclick: () => { if (confirm('Neues leeres Projekt beginnen?')) loadProject(emptyProject()); } }, 'Neu'),
      h('button', {
        class: 'btn small',
        title: 'Projekt als Datei speichern',
        onclick: () => downloadBlob(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }), `${p.name || 'projekt'}.json`),
      }, 'Speichern'),
      h('button', { class: 'btn small', title: 'Projektdatei laden', onclick: () => fileInput.click() }, 'Laden'),
      h('button', { class: 'btn small accent', title: 'Als WAV exportieren', onclick: exportWav }, '⬇ WAV'),
      fileInput,
    ),
  );
}

store.on(['project', 'transport'], renderTopbar);
store.on('pattern', () => patternBtns.forEach((b, i) => b.classList.toggle('on', i === store.currentPattern)));
store.on('playstate', () => {
  const playingPat = store.playing ? (store.mode === 'song' ? store.project.song[store.playBar % store.project.song.length] : store.currentPattern) : -1;
  patternBtns.forEach((b, i) => b.classList.toggle('playing', i === playingPat));
});

/* ------------------------------------------------------------------ */
/*  Szenen-Overlay                                                     */
/* ------------------------------------------------------------------ */

function renderOverlay() {
  clear(overlay);
  overlay.append(
    h('div', { class: 'ov-hint' }, 'Objekte ziehen = im Raum platzieren · Klick = Sound bearbeiten · Ziehen im Leeren = Kamera drehen · Mausrad = Zoom'),
    h('div', { class: 'ov-btns' },
      h('button', {
        class: 'chip' + (store.project.spatialMix ? ' on' : ''),
        title: 'Raum-Mix: links/rechts = Panorama, Entfernung zur Mitte = mehr Hall',
        onclick: () => {
          store.project.spatialMix = !store.project.spatialMix;
          engine.updateMix();
          store.emit('transport');
          renderOverlay();
        },
      }, '◎ Raum-Mix'),
      h('button', {
        class: 'chip' + (scene.autoRotate ? ' on' : ''),
        onclick: () => { scene.autoRotate = !scene.autoRotate; renderOverlay(); },
      }, '⟳ Kamerafahrt'),
      h('button', { class: 'chip', onclick: () => scene.resetCamera() }, '⌖ Kamera zurück'),
    ),
  );
}
store.on('project', renderOverlay);

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
  tabsNav.append(h('div', { class: 'spacer' }), h('span', { class: 'kbd-hint' }, 'Leertaste Play · 1–8 Pattern · A–K Tastatur spielen · Enter Vorhören'));
}
mountSequencer(panes.seq, preview);
mountPianoRoll(panes.piano, preview);
mountMixer(panes.mixer);
mountArrangement(panes.arr, () => exportWav());
mountSoundEditor(editor, preview);
renderTabs();

/* ------------------------------------------------------------------ */
/*  Export, Laden                                                      */
/* ------------------------------------------------------------------ */

function loadProject(p: ReturnType<typeof emptyProject>) {
  const wasPlaying = store.playing;
  if (wasPlaying) stop();
  store.load(p);
}

async function exportWav() {
  const p = store.project;
  const seq = store.mode === 'song' ? p.song : [store.currentPattern, store.currentPattern, store.currentPattern, store.currentPattern];
  const busy = h('div', { class: 'modal' },
    h('div', { class: 'modal-card' },
      h('div', { class: 'spinner' }),
      h('h2', {}, 'Rendere WAV …'),
      h('p', {}, store.mode === 'song' ? `Song mit ${seq.length} Takten` : `Pattern ${PATTERN_NAMES[store.currentPattern]} × 4`),
    ),
  );
  document.body.append(busy);
  try {
    await new Promise((r) => setTimeout(r, 50));
    const blob = await renderToWav(p, seq);
    downloadBlob(blob, `${p.name || 'track'}.wav`);
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
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (store.playing) stop();
    else void play();
  } else if (/^Digit[1-8]$/.test(e.code)) {
    store.currentPattern = parseInt(e.code.slice(5), 10) - 1;
    store.emit('pattern');
    renderTopbar();
  } else if (e.code === 'Enter' && store.selectedTrackId) {
    e.preventDefault();
    preview(store.selectedTrackId);
  } else if (e.code in PIANO && store.selectedTrackId && !e.repeat) {
    preview(store.selectedTrackId, PIANO[e.code]);
  }
});

/* ------------------------------------------------------------------ */
/*  Start-Bildschirm                                                   */
/* ------------------------------------------------------------------ */

function showSplash() {
  const saved = loadAutosave();
  const start = async (p: ReturnType<typeof emptyProject>) => {
    await Tone.start();
    loadProject(p);
    splash.remove();
  };
  const splash = h('div', { class: 'splash' },
    h('div', { class: 'splash-card' },
      h('h1', {}, 'TECHNO', h('b', {}, '//'), 'VIZ'),
      h('p', { class: 'lead' }, 'Baue deinen eigenen Techno-Track – jede Spur lebt als 3D-Objekt im Raum und reagiert in Echtzeit auf den Beat.'),
      saved && saved.tracks.length
        ? h('button', { class: 'btn accent wide', onclick: () => start(saved) }, `▶ Weitermachen: „${saved.name}“`)
        : null,
      h('h3', {}, 'Mit einem Genre starten'),
      h('div', { class: 'genre-grid' },
        GENRES.map((g) =>
          h('button', { class: 'genre-card', onclick: () => start(buildPreset(g)) },
            h('strong', {}, g.name),
            h('span', { class: 'bpm-tag' }, `${g.bpm} BPM`),
            h('small', {}, g.description),
          ),
        ),
      ),
      h('button', { class: 'btn wide', onclick: () => start(emptyProject()) }, 'Leeres Projekt'),
    ),
  );
  document.body.append(splash);
}

renderTopbar();
renderOverlay();
syncScene();
showSplash();

// für Tests / Debugging
Object.assign(window, { __tvm: { store, engine, scene, Tone } });
