import { store } from '../store';
import { STEPS, emptySteps, type Step, type StyleName } from '../types';
import { INSTRUMENTS, INSTRUMENT_ORDER } from '../audio/instruments';
import { SCALES } from '../music';
import { STYLES, STYLE_ORDER, generate, mutate } from '../groove';
import { clear, keepScroll, h, icon, scheduler } from './dom';

let clipboard: Record<string, Step[]> | null = null;
type Pen = 'on' | 'vel' | 'prob';
let pen: Pen = 'on';
let strength = 0.35;

const VEL_CYCLE = (v: number) => (v > 0.9 ? 0.65 : v > 0.5 ? 0.38 : 1);
const PROB_CYCLE = (p: number) => (p > 0.9 ? 0.75 : p > 0.6 ? 0.5 : p > 0.3 ? 0.25 : 1);

export interface SequencerActions {
  preview: (id: string, note?: number) => void;
  loopToTrack: () => void;
}

/** Würfeln bzw. Mutieren für alle ungesperrten Spuren (oder eine einzelne) */
export function rollTracks(kind: 'dice' | 'mutate', onlyId?: string) {
  const p = store.project;
  const pat = p.patterns[store.currentPattern];
  const scale = SCALES[p.scale].steps;
  for (const t of p.tracks) {
    if (onlyId ? t.id !== onlyId : t.locked) continue;
    pat.steps[t.id] = kind === 'dice'
      ? generate(p.style, t.type, scale)
      : mutate(store.steps(t.id), p.style, t.type, scale, strength);
  }
  store.emit('steps');
}

export function mountSequencer(root: HTMLElement, actions: SequencerActions) {
  const { preview } = actions;
  let cells: HTMLElement[][] = [];
  let headCells: HTMLElement[] = [];

  const render = scheduler(root, () => keepScroll(root, renderRaw));

  function renderRaw() {
    clear(root);
    cells = [];
    headCells = [];
    const p = store.project;

    const addSel = h(
      'select',
      {
        class: 'add-instrument',
        title: 'Instrument hinzufügen',
        onchange: (e: Event) => {
          const sel = e.target as HTMLSelectElement;
          if (sel.value) store.addTrack(sel.value as never);
          sel.value = '';
        },
      },
      h('option', { value: '' }, '+ Instrument'),
      INSTRUMENT_ORDER.map((t) => h('option', { value: t }, `${INSTRUMENTS[t].label} – ${INSTRUMENTS[t].description}`)),
    );

    const styleSel = h('select', {
      class: 'style-sel',
      title: 'Stil-Regeln für Würfeln und Mutieren',
      onchange: (e: Event) => {
        p.style = (e.target as HTMLSelectElement).value as StyleName;
        store.emit('transport');
      },
    }, STYLE_ORDER.map((s) => h('option', { value: s, selected: s === p.style }, STYLES[s].label)));

    const strengthIn = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(strength), title: 'Mutations-Stärke: wenig ↔ viel' });
    strengthIn.addEventListener('input', () => (strength = parseFloat(strengthIn.value)));
    strengthIn.addEventListener('change', () => strengthIn.blur());

    const penBtn = (id: Pen, label: string, title: string) =>
      h('button', { class: 'seg' + (pen === id ? ' on' : ''), title, onclick: () => { pen = id; render(); } }, label);

    root.append(
      h('div', { class: 'seq-toolbar' },
        addSel,
        h('span', { class: 'tb-sep' }),
        h('label', { class: 'mini' }, 'Stil', styleSel),
        h('button', { class: 'btn small', 'data-hint': 'dice', title: 'Alle ungesperrten Spuren neu würfeln – folgt den Regeln des Stils', onclick: () => rollTracks('dice') }, icon('dice'), 'Würfeln'),
        h('button', { class: 'btn small', title: 'Aktuelles Pattern leicht variieren (Stärke rechts)', onclick: () => rollTracks('mutate') }, icon('mutate'), 'Mutieren'),
        h('label', { class: 'mini strength' }, strengthIn),
        h('button', { class: 'btn small accent', 'data-hint': 'song', title: 'Aus diesem Loop eine komplette Song-Struktur bauen (überschreibt Patterns A–H)', onclick: actions.loopToTrack }, icon('song'), 'Loop → Track'),
        h('div', { class: 'spacer' }),
        h('div', { class: 'segs', title: 'Was ein Klick auf einen Step macht' },
          penBtn('on', 'An/Aus', 'Klick schaltet Steps an/aus'),
          penBtn('vel', 'Lautstärke', 'Klick wechselt 100 / 65 / 38 % (auch: Rechtsklick)'),
          penBtn('prob', 'Chance', 'Klick wechselt 100 / 75 / 50 / 25 % Wahrscheinlichkeit (auch: Shift+Klick)'),
        ),
        h('button', {
          class: 'btn small ghost',
          title: 'Aktuelles Pattern kopieren',
          onclick: () => (clipboard = JSON.parse(JSON.stringify(p.patterns[store.currentPattern].steps))),
        }, 'Kopieren'),
        h('button', {
          class: 'btn small ghost',
          title: 'In aktuelles Pattern einfügen',
          onclick: () => {
            if (!clipboard) return;
            p.patterns[store.currentPattern].steps = JSON.parse(JSON.stringify(clipboard));
            store.emit('steps');
          },
        }, 'Einfügen'),
        h('button', {
          class: 'btn small ghost',
          title: 'Aktuelles Pattern leeren (gesperrte Spuren bleiben)',
          onclick: () => {
            const pat = p.patterns[store.currentPattern];
            for (const t of p.tracks) if (!t.locked) pat.steps[t.id] = emptySteps();
            store.emit('steps');
          },
        }, 'Leeren'),
      ),
    );

    const grid = h('div', { class: 'seq-grid' });
    const head = h('div', { class: 'seq-row head' }, h('div', { class: 'seq-name' }, ''), h('div', { class: 'seq-ms' }));
    const headSteps = h('div', { class: 'seq-steps' });
    for (let i = 0; i < STEPS; i++) {
      const c = h('div', { class: 'seq-head-cell' + (i % 4 === 0 ? ' beat' : '') }, String(i + 1));
      headCells.push(c);
      headSteps.append(c);
    }
    head.append(headSteps, h('div', { class: 'seq-actions' }));
    grid.append(head);

    if (!p.tracks.length) {
      grid.append(h('div', { class: 'empty' }, 'Noch keine Spuren. Wähle oben ein Genre-Preset oder füge ein Instrument hinzu.'));
    }

    for (const t of p.tracks) {
      const def = INSTRUMENTS[t.type];
      const steps = store.steps(t.id);
      const row = h('div', {
        class: 'seq-row' + (store.selectedTrackId === t.id ? ' selected' : '') + (t.locked ? ' locked' : ''),
        style: `--c:${t.color}`,
      });
      const nameBtn = h(
        'button',
        { class: 'seq-name', title: def.description, onclick: () => { store.select(t.id); preview(t.id); } },
        h('span', { class: 'dot' }),
        h('span', { class: 'nm' }, t.name),
        h('span', { class: 'tag' }, def.short),
      );
      const ms = h(
        'div',
        { class: 'seq-ms' },
        h('button', { class: 'tog' + (t.mute ? ' on mute' : ''), title: 'Stumm', onclick: () => store.updateTrack(t.id, { mute: !t.mute }) }, 'M'),
        h('button', { class: 'tog' + (t.solo ? ' on solo' : ''), title: 'Solo', onclick: () => store.updateTrack(t.id, { solo: !t.solo }) }, 'S'),
        h('button', {
          class: 'tog lock' + (t.locked ? ' on' : ''),
          'data-hint': t === p.tracks[0] ? 'lock' : null,
          title: t.locked ? 'Gesperrt – Würfeln/Mutieren lassen diese Spur in Ruhe' : 'Sperren: beim Würfeln/Mutieren unangetastet',
          onclick: () => store.updateTrack(t.id, { locked: !t.locked }),
        }, icon(t.locked ? 'lock' : 'unlock')),
      );
      const stepWrap = h('div', { class: 'seq-steps' });
      const rowCells: HTMLElement[] = [];
      steps.forEach((s, i) => {
        const c = h('button', {
          class: 'step' + (i % 4 === 0 ? ' beat' : '') + (s.on ? ' on' : '') + (s.accent ? ' accent' : '') + (s.on && s.prob < 1 ? ' chance' : ''),
          style: s.on ? `--v:${s.vel}` : '',
          title: s.on ? `${def.melodic ? `Note +${s.note} · ` : ''}${Math.round(s.vel * 100)} %${s.prob < 1 ? ` · Chance ${Math.round(s.prob * 100)} %` : ''}` : '',
        });
        if (s.on && s.prob < 1) c.append(h('span', { class: 'pct' }, String(Math.round(s.prob * 100))));
        else if (def.melodic && s.on) c.textContent = String(s.note);
        c.addEventListener('click', (e) => {
          const mode: Pen = e.shiftKey ? 'prob' : pen;
          if (mode === 'on' || !s.on) {
            if (mode === 'on') s.on = !s.on;
            else s.on = true;
            if (s.on && mode === 'on' && store.selectedTrackId === t.id) preview(t.id, s.note);
          } else if (mode === 'vel') s.vel = VEL_CYCLE(s.vel);
          else s.prob = PROB_CYCLE(s.prob);
          store.emit('steps');
        });
        c.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!s.on) Object.assign(s, { on: true, vel: 1 });
          else s.vel = VEL_CYCLE(s.vel);
          store.emit('steps');
        });
        rowCells.push(c);
        stepWrap.append(c);
      });
      cells.push(rowCells);
      const actionsEl = h(
        'div',
        { class: 'seq-actions' },
        h('button', { class: 'icon', title: 'Nur diese Spur neu würfeln', onclick: () => rollTracks('dice', t.id) }, icon('dice')),
        h('button', {
          class: 'icon',
          title: 'Spur leeren',
          onclick: () => {
            p.patterns[store.currentPattern].steps[t.id] = emptySteps();
            store.emit('steps');
          },
        }, icon('clear')),
      );
      row.append(nameBtn, ms, stepWrap, actionsEl);
      grid.append(row);
    }
    root.append(grid);
    highlight();
  }

  function highlight() {
    const ps = store.playing && (store.mode === 'pattern' || store.project.song[store.playBar % store.project.song.length] === store.currentPattern) ? store.playStep : -1;
    headCells.forEach((c, i) => c.classList.toggle('play', i === ps));
    for (const row of cells) row.forEach((c, i) => c.classList.toggle('play', i === ps));
  }

  store.on(['project', 'tracks', 'steps', 'pattern', 'selection', 'transport'], () => render());
  // Klang-Regler im Seitenpanel: erst nach dem Loslassen neu aufbauen
  store.on('track', () => render(true));
  store.on('playstate', highlight);
  render();
}
