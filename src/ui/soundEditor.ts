import { store } from '../store';
import { INSTRUMENTS, defaultParams, isSelect } from '../audio/instruments';
import type { FilterType } from '../types';
import { clear, keepScroll, editingIn, h, slider } from './dom';

const PALETTE = ['#ff2e63', '#ffb400', '#f9ed69', '#08d9d6', '#00adb5', '#ff8a5b', '#6a2cff', '#b8ff3c', '#ff5ef0', '#3d8bff', '#00ff9c', '#ffffff'];

export function mountSoundEditor(root: HTMLElement, preview: (id: string, note?: number) => void) {
  const render = () => keepScroll(root, renderRaw);

  function renderRaw() {
    clear(root);
    const t = store.selected;
    if (!t) {
      root.append(
        h('div', { class: 'panel-head' }, h('h2', {}, 'Sound-Design')),
        h('div', { class: 'empty' }, 'Klicke ein 3D-Objekt oder einen Spurnamen an, um den Klang zu formen.'),
      );
      return;
    }
    const def = INSTRUMENTS[t.type];

    const nameInput = h('input', { class: 'name-input', value: t.name, maxlength: 24 });
    nameInput.addEventListener('change', () => {
      store.updateTrack(t.id, { name: nameInput.value.trim() || def.label });
      nameInput.blur();
    });

    root.append(
      h('div', { class: 'panel-head', style: `--c:${t.color}` },
        h('span', { class: 'big-dot' }),
        nameInput,
        h('button', { class: 'btn small accent', title: 'Anhören (oder Taste Enter)', onclick: () => preview(t.id) }, '▶ Hören'),
      ),
      h('p', { class: 'desc' }, `${def.label}: ${def.description}`),
      h('div', { class: 'colors' },
        PALETTE.map((c) =>
          h('button', {
            class: 'swatch' + (c === t.color ? ' on' : ''),
            style: `background:${c}`,
            title: 'Farbe',
            onclick: () => store.updateTrack(t.id, { color: c }),
          }),
        ),
      ),
    );

    const sec = h('div', { class: 'section' }, h('h3', {}, 'Klangerzeugung'));
    for (const p of def.params) {
      if (isSelect(p)) {
        const sel = h('select', {
          onchange: (e: Event) => {
            store.setParam(t.id, p.key, (e.target as HTMLSelectElement).value);
            preview(t.id);
            (e.target as HTMLSelectElement).blur();
          },
        }, p.options.map((o) => h('option', { value: o.value, selected: t.params[p.key] === o.value }, o.label)));
        sec.append(h('label', { class: 'slider' }, h('span', { class: 'lbl' }, p.label), sel));
      } else {
        sec.append(
          slider({
            label: p.label,
            min: p.min,
            max: p.max,
            step: p.step,
            log: p.log,
            unit: p.unit,
            value: Number(t.params[p.key] ?? p.def),
            onInput: (v) => store.setParam(t.id, p.key, v),
          }),
        );
      }
    }
    sec.append(
      h('div', { class: 'row-btns' },
        h('button', {
          class: 'btn small',
          title: 'Alle Klang-Parameter zufällig setzen',
          onclick: () => {
            for (const p of def.params) {
              if (p.key === 'octave' || p.key === 'gate') continue;
              if (isSelect(p)) t.params[p.key] = p.options[Math.floor(Math.random() * p.options.length)].value;
              else {
                const r = Math.random();
                const v = p.log ? p.min * Math.pow(p.max / p.min, r) : p.min + (p.max - p.min) * r;
                t.params[p.key] = Math.round(v / p.step) * p.step;
              }
            }
            store.emit('track', t.id);
            render();
            preview(t.id);
          },
        }, '🎲 Zufallsklang'),
        h('button', {
          class: 'btn small',
          onclick: () => {
            t.params = defaultParams(t.type);
            store.emit('track', t.id);
            render();
            preview(t.id);
          },
        }, 'Zurücksetzen'),
      ),
    );
    root.append(sec);

    const shape = h('div', { class: 'section' }, h('h3', {}, 'Klangformung (Spur)'));
    shape.append(
      h('label', { class: 'slider' },
        h('span', { class: 'lbl' }, 'Filtertyp'),
        h('select', {
          onchange: (e: Event) => store.updateTrack(t.id, { filterType: (e.target as HTMLSelectElement).value as FilterType }),
        },
          h('option', { value: 'lowpass', selected: t.filterType === 'lowpass' }, 'Tiefpass'),
          h('option', { value: 'highpass', selected: t.filterType === 'highpass' }, 'Hochpass'),
          h('option', { value: 'bandpass', selected: t.filterType === 'bandpass' }, 'Bandpass'),
        ),
      ),
      slider({ label: 'Cutoff', min: 20, max: 20000, step: 1, log: true, unit: 'Hz', value: t.cutoff, onInput: (v) => store.updateTrack(t.id, { cutoff: v }) }),
      slider({ label: 'Resonanz', min: 0.1, max: 18, step: 0.1, value: t.resonance, onInput: (v) => store.updateTrack(t.id, { resonance: v }) }),
      slider({ label: 'Drive', min: 0, max: 1, step: 0.01, value: t.drive, onInput: (v) => store.updateTrack(t.id, { drive: v }) }),
    );
    root.append(shape);

    root.append(
      h('div', { class: 'section' },
        h('button', {
          class: 'btn small danger',
          onclick: () => {
            if (confirm(`Spur „${t.name}“ wirklich löschen?`)) store.removeTrack(t.id);
          },
        }, 'Spur löschen'),
      ),
    );
  }

  store.on(['project', 'tracks', 'selection'], render);
  store.on('track', (id) => {
    if (id === store.selectedTrackId && !editingIn(root)) render();
  });
  render();
}
