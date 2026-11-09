import { store } from '../store';
import { PATTERN_NAMES, STEPS } from '../types';
import { clear, keepScroll, h } from './dom';

const PATTERN_COLORS = ['#ff2e63', '#ffb400', '#08d9d6', '#b8ff3c', '#ff5ef0', '#3d8bff', '#00ff9c', '#ff8a5b'];

function patternDensity(i: number): number {
  const pat = store.project.patterns[i];
  let n = 0;
  for (const steps of Object.values(pat.steps)) n += steps.filter((s) => s.on).length;
  return n;
}

export function mountArrangement(root: HTMLElement, onExport: () => void) {
  let blocks: HTMLElement[] = [];

  const render = () => keepScroll(root, renderRaw);

  function renderRaw() {
    clear(root);
    blocks = [];
    const p = store.project;
    const bars = p.song.length;
    const secs = (bars * STEPS * 60) / p.bpm / 4;

    root.append(
      h('div', { class: 'seq-toolbar' },
        h('span', { class: 'hint' }, 'Pattern anklicken = hinzufügen · Block anklicken = Pattern wechseln · × = entfernen · Modus „Song“ spielt die Kette ab'),
        h('div', { class: 'spacer' }),
        h('span', { class: 'hint' }, `${bars} Takte · ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')} min`),
        h('button', { class: 'btn small', onclick: () => { p.song = [...p.song, ...p.song]; store.emit('song'); } }, 'Verdoppeln'),
        h('button', { class: 'btn small', onclick: () => { p.song = [0]; store.emit('song'); } }, 'Zurücksetzen'),
        h('button', { class: 'btn small accent', onclick: onExport }, '⬇ WAV exportieren'),
      ),
    );

    const palette = h('div', { class: 'arr-palette' });
    PATTERN_NAMES.forEach((name, i) => {
      const dens = patternDensity(i);
      palette.append(
        h('button', {
          class: 'arr-pal' + (dens ? '' : ' empty-pat'),
          style: `--c:${PATTERN_COLORS[i]}`,
          title: dens ? `${dens} Noten` : 'leeres Pattern',
          onclick: () => {
            if (p.song.length >= 128) return;
            p.song.push(i);
            store.emit('song');
          },
        }, `+ ${name}`),
      );
    });
    root.append(palette);

    const lane = h('div', { class: 'arr-lane' });
    p.song.forEach((pi, idx) => {
      const b = h('div', {
        class: 'arr-block',
        style: `--c:${PATTERN_COLORS[pi]}`,
        title: 'Klick: nächstes Pattern · Rechtsklick: vorheriges',
      },
        h('span', { class: 'bar-no' }, String(idx + 1)),
        h('span', { class: 'pat' }, PATTERN_NAMES[pi]),
        h('button', {
          class: 'x',
          title: 'Entfernen',
          onclick: (e: Event) => {
            e.stopPropagation();
            if (p.song.length > 1) p.song.splice(idx, 1);
            store.emit('song');
          },
        }, '×'),
      );
      b.addEventListener('click', () => {
        p.song[idx] = (pi + 1) % PATTERN_NAMES.length;
        store.emit('song');
      });
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        p.song[idx] = (pi + PATTERN_NAMES.length - 1) % PATTERN_NAMES.length;
        store.emit('song');
      });
      blocks.push(b);
      lane.append(b);
    });
    root.append(lane);
    highlight();
  }

  function highlight() {
    const bar = store.playing && store.mode === 'song' ? store.playBar % store.project.song.length : -1;
    blocks.forEach((b, i) => b.classList.toggle('play', i === bar));
  }

  store.on(['project', 'song', 'steps', 'transport'], render);
  store.on('playstate', highlight);
  render();
}
