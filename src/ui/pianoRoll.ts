import { store } from '../store';
import { STEPS } from '../types';
import { INSTRUMENTS } from '../audio/instruments';
import { inScale, midiName, rootMidi } from '../music';
import { trackOctave } from '../audio/engine';
import { clear, keepScroll, editingIn, h } from './dom';

const ROWS = 25; // zwei Oktaven + 1

export function mountPianoRoll(root: HTMLElement, preview: (id: string, note?: number) => void) {
  let cols: HTMLElement[][] = [];

  const render = () => keepScroll(root, renderRaw);

  function renderRaw() {
    clear(root);
    cols = [];
    const t = store.selected;
    if (!t || !INSTRUMENTS[t.type].melodic) {
      root.append(
        h('div', { class: 'empty' },
          'Wähle eine melodische Spur (Bass, Acid, Stab, Pad, FM, Perc) – in der 3D-Szene oder im Sequencer –, um hier Noten zu setzen.'),
      );
      return;
    }
    const p = store.project;
    const steps = store.steps(t.id);
    const base = rootMidi(p.key, trackOctave(t));

    root.append(
      h('div', { class: 'seq-toolbar' },
        h('span', { class: 'pr-title', style: `--c:${t.color}` }, `● ${t.name}`),
        h('span', { class: 'hint' }, `Grundton ${midiName(base)} · Tonart-Töne sind hervorgehoben · Klick setzt/entfernt Note`),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => shift(1) }, 'Transponieren +1'),
        h('button', { class: 'btn small', onclick: () => shift(-1) }, '−1'),
        h('button', { class: 'btn small', onclick: () => shift(12) }, '+Okt'),
        h('button', { class: 'btn small', onclick: () => shift(-12) }, '−Okt'),
      ),
    );

    const grid = h('div', { class: 'pr-grid', style: `--c:${t.color}` });
    for (let r = ROWS - 1; r >= 0; r--) {
      const isScale = inScale(r, p.scale);
      const isRoot = r % 12 === 0;
      const row = h('div', { class: 'pr-row' + (isScale ? ' scale' : '') + (isRoot ? ' root' : '') });
      row.append(
        h('button', { class: 'pr-key', onclick: () => preview(t.id, r) }, midiName(base + r)),
      );
      for (let i = 0; i < STEPS; i++) {
        const s = steps[i];
        const active = s.on && s.note === r;
        const c = h('button', {
          class: 'pr-cell' + (i % 4 === 0 ? ' beat' : '') + (active ? ' on' : '') + (active && s.slide ? ' slide' : '') + (active && s.accent ? ' accent' : ''),
          style: active ? `--v:${s.vel}` : '',
        });
        c.addEventListener('click', () => {
          if (s.on && s.note === r) s.on = false;
          else {
            s.on = true;
            s.note = r;
            preview(t.id, r);
          }
          store.emit('steps');
        });
        (cols[i] ??= []).push(c);
        row.append(c);
      }
      grid.append(row);
    }

    // Zusatzzeilen: Lautstärke, Akzent, Slide
    const extra = (label: string, title: string, get: (i: number) => string, toggle: (i: number) => void) => {
      const row = h('div', { class: 'pr-row extra' }, h('div', { class: 'pr-key', title }, label));
      for (let i = 0; i < STEPS; i++) {
        const c = h('button', { class: 'pr-cell small' + (i % 4 === 0 ? ' beat' : '') }, get(i));
        c.addEventListener('click', () => {
          toggle(i);
          store.emit('steps');
        });
        (cols[i] ??= []).push(c);
        row.append(c);
      }
      grid.append(row);
    };
    extra('Vel', 'Anschlagstärke (Klick wechselt 100 / 65 / 35 %)', (i) => (steps[i].on ? String(Math.round(steps[i].vel * 100)) : ''), (i) => {
      const s = steps[i];
      s.vel = s.vel > 0.9 ? 0.65 : s.vel > 0.5 ? 0.35 : 1;
    });
    extra('Akzent', 'Akzent: lauter und mit offenerem Filter (v.a. Acid)', (i) => (steps[i].accent ? '●' : '·'), (i) => {
      steps[i].accent = !steps[i].accent;
    });
    extra('Slide', 'Slide: Ton gleitet in den nächsten Step (Acid / Glide)', (i) => (steps[i].slide ? '⟿' : '·'), (i) => {
      steps[i].slide = !steps[i].slide;
    });
    root.append(grid);
    highlight();

    function shift(n: number) {
      for (const s of steps) if (s.on) s.note = Math.max(0, Math.min(24, s.note + n));
      store.emit('steps');
    }
  }

  function highlight() {
    const ps = store.playing && (store.mode === 'pattern' || store.project.song[store.playBar % store.project.song.length] === store.currentPattern) ? store.playStep : -1;
    cols.forEach((col, i) => col.forEach((c) => c.classList.toggle('play', i === ps)));
  }

  store.on(['project', 'tracks', 'steps', 'pattern', 'selection', 'transport'], render);
  store.on('track', (id) => {
    if (id === store.selectedTrackId && !editingIn(root)) render();
  });
  // bei Spurwechsel nach unten scrollen, damit der Grundton sichtbar ist
  store.on('selection', () => {
    root.scrollTop = root.scrollHeight;
  });
  store.on('playstate', highlight);
  render();
}
