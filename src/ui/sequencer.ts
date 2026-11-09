import { store } from '../store';
import { STEPS, emptySteps, type Step } from '../types';
import { INSTRUMENTS, INSTRUMENT_ORDER } from '../audio/instruments';
import { SCALES } from '../music';
import { randomDrumSteps, randomMelodicSteps } from '../presets';
import { clear, keepScroll, h } from './dom';

let clipboard: Record<string, Step[]> | null = null;

export function mountSequencer(root: HTMLElement, preview: (id: string, note?: number) => void) {
  let cells: HTMLElement[][] = [];
  let headCells: HTMLElement[] = [];

  const render = () => keepScroll(root, renderRaw);

  function renderRaw() {
    clear(root);
    cells = [];
    headCells = [];
    const p = store.project;

    const addSel = h(
      'select',
      {
        class: 'add-instrument',
        onchange: (e: Event) => {
          const sel = e.target as HTMLSelectElement;
          if (sel.value) store.addTrack(sel.value as never);
          sel.value = '';
        },
      },
      h('option', { value: '' }, '+ Instrument hinzufügen'),
      INSTRUMENT_ORDER.map((t) => h('option', { value: t }, `${INSTRUMENTS[t].label} – ${INSTRUMENTS[t].description}`)),
    );

    const toolbar = h(
      'div',
      { class: 'seq-toolbar' },
      addSel,
      h('div', { class: 'spacer' }),
      h('span', { class: 'hint' }, 'Klick = an/aus · Rechtsklick = Lautstärke · Name = Sound bearbeiten'),
      h('button', {
        class: 'btn small',
        title: 'Aktuelles Pattern kopieren',
        onclick: () => {
          clipboard = JSON.parse(JSON.stringify(p.patterns[store.currentPattern].steps));
        },
      }, 'Kopieren'),
      h('button', {
        class: 'btn small',
        title: 'In aktuelles Pattern einfügen',
        onclick: () => {
          if (!clipboard) return;
          p.patterns[store.currentPattern].steps = JSON.parse(JSON.stringify(clipboard));
          store.emit('steps');
        },
      }, 'Einfügen'),
      h('button', {
        class: 'btn small',
        title: 'Aktuelles Pattern leeren',
        onclick: () => {
          p.patterns[store.currentPattern].steps = {};
          store.emit('steps');
        },
      }, 'Leeren'),
    );
    root.append(toolbar);

    const grid = h('div', { class: 'seq-grid' });
    // Kopfzeile mit Step-Nummern
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
        class: 'seq-row' + (store.selectedTrackId === t.id ? ' selected' : ''),
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
        h('button', {
          class: 'tog' + (t.mute ? ' on mute' : ''),
          title: 'Stumm',
          onclick: () => store.updateTrack(t.id, { mute: !t.mute }),
        }, 'M'),
        h('button', {
          class: 'tog' + (t.solo ? ' on solo' : ''),
          title: 'Solo',
          onclick: () => store.updateTrack(t.id, { solo: !t.solo }),
        }, 'S'),
      );
      const stepWrap = h('div', { class: 'seq-steps' });
      const rowCells: HTMLElement[] = [];
      steps.forEach((s, i) => {
        const c = h('button', {
          class: 'step' + (i % 4 === 0 ? ' beat' : '') + (s.on ? ' on' : '') + (s.accent ? ' accent' : ''),
          style: s.on ? `--v:${s.vel}` : '',
          title: def.melodic && s.on ? `Note +${s.note}` : '',
        });
        if (def.melodic && s.on) c.textContent = String(s.note);
        c.addEventListener('click', () => {
          s.on = !s.on;
          if (s.on) {
            s.vel = s.vel || 1;
            if (store.selectedTrackId === t.id) preview(t.id, s.note);
          }
          store.emit('steps');
        });
        c.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!s.on) {
            s.on = true;
            s.vel = 1;
          } else s.vel = s.vel > 0.9 ? 0.65 : s.vel > 0.5 ? 0.35 : 1;
          store.emit('steps');
        });
        rowCells.push(c);
        stepWrap.append(c);
      });
      cells.push(rowCells);
      const actions = h(
        'div',
        { class: 'seq-actions' },
        h('button', {
          class: 'icon',
          title: 'Zufälliges Pattern',
          onclick: () => {
            const pat = p.patterns[store.currentPattern];
            pat.steps[t.id] = def.melodic
              ? randomMelodicSteps(SCALES[p.scale].steps, t.type === 'pad' ? 0.1 : t.type === 'acid' ? 0.7 : 0.4)
              : randomDrumSteps(t.type);
            store.emit('steps');
          },
        }, '🎲'),
        h('button', {
          class: 'icon',
          title: 'Spur leeren',
          onclick: () => {
            p.patterns[store.currentPattern].steps[t.id] = emptySteps();
            store.emit('steps');
          },
        }, '⌫'),
      );
      row.append(nameBtn, ms, stepWrap, actions);
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

  store.on(['project', 'tracks', 'steps', 'pattern', 'selection', 'track', 'transport'], render);
  store.on('playstate', highlight);
  render();
}
