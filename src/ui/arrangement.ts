import { store } from '../store';
import { PATTERN_NAMES, STEPS } from '../types';
import { clear, keepScroll, h, icon, scheduler } from './dom';

/** Graustufen statt Neon: Pattern unterscheiden sich über Helligkeit */
const PATTERN_SHADE = [0.82, 0.62, 0.92, 0.42, 0.55, 1, 0.72, 0.35];
/** Rollen, die „Loop → Track“ den Patterns gibt */
export const SECTION_NAMES = ['Intro', 'Aufbau', 'Main', 'Break', 'Build-up', 'Drop', 'Fill', 'Outro'];
const FILTER_CYCLE = (v: number) => (v > 0.9 ? 0.75 : v > 0.6 ? 0.5 : v > 0.35 ? 0.25 : 1);

function patternDensity(i: number): number {
  let n = 0;
  for (const steps of Object.values(store.project.patterns[i].steps)) n += steps.filter((s) => s.on).length;
  return n;
}

export function mountArrangement(root: HTMLElement, actions: { onExport: () => void; loopToTrack: () => void }) {
  let blocks: HTMLElement[] = [];

  const render = scheduler(root, () => keepScroll(root, renderRaw));

  function renderRaw() {
    clear(root);
    blocks = [];
    const p = store.project;
    const bars = p.song.length;
    const secs = (bars * STEPS * 60) / p.bpm / 4;
    const shade = (i: number) => `--s:${PATTERN_SHADE[i]}`;

    root.append(
      h('div', { class: 'seq-toolbar' },
        h('button', { class: 'btn small accent', onclick: actions.loopToTrack, title: 'Aus dem aktuellen Loop eine komplette Song-Struktur erzeugen' }, icon('song'), 'Loop → Track'),
        h('span', { class: 'hint' }, 'Pattern anklicken = anhängen · Block: Klick = nächstes Pattern, Rechtsklick = vorheriges · Balken darunter = Filter (Klick)'),
        h('div', { class: 'spacer' }),
        h('span', { class: 'hint mono' }, `${bars} Takte · ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`),
        h('button', { class: 'btn small ghost', onclick: () => store.setSong([...p.song, ...p.song], [...p.songFilter, ...p.songFilter]) }, 'Verdoppeln'),
        h('button', { class: 'btn small ghost', onclick: () => confirm('Arrangement zurücksetzen?') && store.setSong([0]) }, 'Zurücksetzen'),
        h('button', { class: 'btn small', onclick: actions.onExport }, 'WAV exportieren'),
      ),
    );

    root.append(
      h('div', { class: 'arr-palette' },
        PATTERN_NAMES.map((name, i) => {
          const dens = patternDensity(i);
          return h('button', {
            class: 'arr-pal' + (dens ? '' : ' empty-pat'),
            style: shade(i),
            title: dens ? `${dens} Noten` : 'leeres Pattern',
            onclick: () => store.setSong([...p.song, i], [...p.songFilter, 1]),
          }, h('b', {}, name), h('small', {}, SECTION_NAMES[i]));
        }),
      ),
    );

    const lane = h('div', { class: 'arr-lane' });
    p.song.forEach((pi, idx) => {
      const f = p.songFilter[idx] ?? 1;
      const b = h('div', { class: 'arr-cell' },
        h('div', { class: 'arr-block', style: shade(pi), title: `Takt ${idx + 1}: Pattern ${PATTERN_NAMES[pi]}` },
          h('span', { class: 'bar-no' }, String(idx + 1)),
          h('span', { class: 'pat' }, PATTERN_NAMES[pi]),
          h('button', {
            class: 'x',
            title: 'Entfernen',
            onclick: (e: Event) => {
              e.stopPropagation();
              if (p.song.length <= 1) return;
              store.setSong(p.song.filter((_, i) => i !== idx), p.songFilter.filter((_, i) => i !== idx));
            },
          }, '×'),
        ),
        h('button', {
          class: 'arr-filter',
          title: `Master-Filter ${Math.round(f * 100)} % (Klick wechselt, Fahrt läuft zum nächsten Takt)`,
          onclick: () => {
            p.songFilter[idx] = FILTER_CYCLE(f);
            store.emit('song');
          },
        }, h('span', { style: `height:${Math.round(f * 100)}%` })),
      );
      const blk = b.firstElementChild as HTMLElement;
      blk.addEventListener('click', () => {
        p.song[idx] = (pi + 1) % PATTERN_NAMES.length;
        store.emit('song');
      });
      blk.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        p.song[idx] = (pi + PATTERN_NAMES.length - 1) % PATTERN_NAMES.length;
        store.emit('song');
      });
      blocks.push(blk);
      lane.append(b);
    });
    root.append(lane);
    highlight();
  }

  function highlight() {
    const bar = store.playing && store.mode === 'song' ? store.playBar % store.project.song.length : -1;
    blocks.forEach((b, i) => b.classList.toggle('play', i === bar));
  }

  store.on(['project', 'song', 'steps', 'transport'], () => render());
  store.on('playstate', highlight);
  render();
}
