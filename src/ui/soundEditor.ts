import { store, loadLibrary, saveLibrary, uid, type SavedSound } from '../store';
import { INSTRUMENTS, NEUTRAL_MACROS, defaultParams, isSelect, randomSound, type MacroKey } from '../audio/instruments';
import { applyEuclid } from '../groove';
import type { FilterType, Track } from '../types';
import { clear, keepScroll, editingIn, h, slider, icon } from './dom';

const GREYS = ['#f2efe9', '#d4d0c8', '#b8b3aa', '#9c978e', '#807b73', '#625e58'];
let expertOpen = false;

const MACROS: { key: MacroKey; left: string; right: string }[] = [
  { key: 'tone', left: 'Dunkel', right: 'Hell' },
  { key: 'length', left: 'Kurz', right: 'Lang' },
  { key: 'dirt', left: 'Sauber', right: 'Dreckig' },
];

function macroSlider(t: Track, key: MacroKey, left: string, right: string) {
  const input = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: String(t.macros[key]) });
  input.addEventListener('input', () => {
    t.macros[key] = parseFloat(input.value);
    store.emit('track', t.id);
  });
  input.addEventListener('change', () => input.blur());
  // Doppelklick = zurück auf neutral
  input.addEventListener('dblclick', () => {
    t.macros[key] = 0.5;
    input.value = '0.5';
    store.emit('track', t.id);
  });
  return h('div', { class: 'macro' }, h('span', { class: 'm-l' }, left), input, h('span', { class: 'm-r' }, right));
}

export function mountSoundEditor(root: HTMLElement, preview: (id: string, note?: number) => void) {
  const render = () => keepScroll(root, renderRaw);

  function renderRaw() {
    clear(root);
    const t = store.selected;
    if (!t) {
      root.append(
        h('div', { class: 'panel-head' }, h('h2', {}, 'Sound')),
        h('div', { class: 'empty' }, 'Klicke ein Objekt in der Szene oder einen Spurnamen an, um den Klang zu formen.'),
      );
      return;
    }
    const def = INSTRUMENTS[t.type];
    const accent = store.project.accent;

    const nameInput = h('input', { class: 'name-input', value: t.name, maxlength: 24 });
    nameInput.addEventListener('change', () => {
      store.updateTrack(t.id, { name: nameInput.value.trim() || def.label });
      nameInput.blur();
    });

    root.append(
      h('div', { class: 'panel-head', style: `--c:${t.color}` },
        h('span', { class: 'big-dot' }),
        nameInput,
        h('button', { class: 'btn small accent', title: 'Anhören (oder Taste Enter)', onclick: () => preview(t.id) }, icon('play'), 'Hören'),
      ),
      h('p', { class: 'desc' }, def.description),
      h('div', { class: 'colors' },
        [...GREYS, accent].map((c) =>
          h('button', {
            class: 'swatch' + (c === t.color ? ' on' : ''),
            style: `background:${c}`,
            title: c === accent ? 'Akzentfarbe' : 'Farbton',
            onclick: () => store.updateTrack(t.id, { color: c }),
          }),
        ),
      ),
    );

    /* ---------- Makros ---------- */
    const macros = h('div', { class: 'section', 'data-hint': 'macros' }, h('h3', {}, 'Klang'));
    for (const m of MACROS) macros.append(macroSlider(t, m.key, m.left, m.right));
    macros.append(
      h('div', { class: 'row-btns' },
        h('button', {
          class: 'btn small',
          title: 'Einen neuen Klang für diese Spur würfeln',
          onclick: () => {
            const next = randomSound(t.type);
            for (const k of ['octave', 'gate', 'rumble']) if (k in t.params) next[k] = t.params[k];
            t.params = next;
            store.emit('track', t.id);
            render();
            preview(t.id);
          },
        }, icon('dice'), 'Klang würfeln'),
        h('button', {
          class: 'btn small ghost',
          title: 'Makros auf neutral',
          onclick: () => {
            t.macros = { ...NEUTRAL_MACROS };
            store.emit('track', t.id);
            render();
          },
        }, 'Neutral'),
      ),
    );
    root.append(macros);

    /* ---------- Groove ---------- */
    const groove = h('div', { class: 'section' }, h('h3', {}, 'Groove'));
    groove.append(
      slider({
        label: 'Swing',
        min: 0, max: 1, step: 0.01, value: t.swing,
        title: 'Verschiebt jede 2. Sechzehntel nach hinten – Shuffle nur für diese Spur',
        onInput: (v) => store.updateTrack(t.id, { swing: v }),
      }),
    );
    if (t.type === 'kick') {
      groove.append(
        slider({
          label: 'Rumble',
          min: 0, max: 1, step: 0.01, value: Number(t.params.rumble ?? 0),
          title: 'Dunkler, verhallter Sub-Tail im Berlin-Stil (0 = aus)',
          onInput: (v) => store.setParam(t.id, 'rumble', v),
        }),
      );
    } else {
      groove.append(
        slider({
          label: 'Sidechain',
          min: 0, max: 1, step: 0.01, value: t.sidechain,
          title: 'Wie stark sich die Spur unter die Kick duckt (Pumpen)',
          onInput: (v) => store.updateTrack(t.id, { sidechain: v }),
        }),
      );
    }
    const euclidApply = () => {
      store.project.patterns[store.currentPattern].steps[t.id] = applyEuclid(store.steps(t.id), t.euclid.hits, t.euclid.rot);
      store.emit('steps');
    };
    groove.append(
      h('div', { class: 'sub' }, 'Euklid – Schläge gleichmäßig verteilen'),
      slider({ label: 'Schläge', min: 0, max: 16, step: 1, value: t.euclid.hits, onInput: (v) => { t.euclid.hits = Math.round(v); euclidApply(); } }),
      slider({ label: 'Verschiebung', min: 0, max: 15, step: 1, value: t.euclid.rot, onInput: (v) => { t.euclid.rot = Math.round(v); euclidApply(); } }),
    );
    root.append(groove);

    /* ---------- Sound-Bibliothek ---------- */
    const lib = loadLibrary();
    const mine = lib.filter((s) => s.type === t.type);
    const libSec = h('div', { class: 'section' }, h('h3', {}, `Meine ${def.label}-Sounds`));
    libSec.append(
      h('button', {
        class: 'btn small',
        onclick: () => {
          const name = prompt('Name für diesen Sound:', `${t.name} ${mine.length + 1}`)?.trim();
          if (!name) return;
          const s: SavedSound = {
            id: uid(), name: name.slice(0, 32), type: t.type, params: { ...t.params }, macros: { ...t.macros },
            filterType: t.filterType, cutoff: t.cutoff, resonance: t.resonance, drive: t.drive,
          };
          if (!saveLibrary([...lib, s])) alert('Speichern im Browser nicht möglich (privates Fenster?).');
          render();
        },
      }, '+ Als Favorit speichern'),
    );
    if (mine.length) {
      libSec.append(
        h('div', { class: 'lib-list' },
          mine.map((s) =>
            h('div', { class: 'lib-item' },
              h('button', {
                class: 'lib-name',
                title: 'Laden',
                onclick: () => {
                  store.updateTrack(t.id, {
                    params: { ...defaultParams(t.type), ...s.params }, macros: { ...NEUTRAL_MACROS, ...s.macros },
                    filterType: s.filterType, cutoff: s.cutoff, resonance: s.resonance, drive: s.drive,
                  });
                  render();
                  preview(t.id);
                },
              }, s.name),
              h('button', {
                class: 'icon',
                title: 'Löschen',
                onclick: () => {
                  if (!confirm(`Sound „${s.name}“ löschen?`)) return;
                  saveLibrary(lib.filter((x) => x.id !== s.id));
                  render();
                },
              }, icon('clear')),
            ),
          ),
        ),
      );
    } else {
      libSec.append(h('p', { class: 'desc' }, 'Gefällt dir ein Sound? Speichere ihn – er steht dann in jedem Projekt bereit.'));
    }
    root.append(libSec);

    /* ---------- Experte ---------- */
    const expert = h('details', { class: 'section expert', open: expertOpen });
    expert.addEventListener('toggle', () => (expertOpen = expert.open));
    expert.append(h('summary', {}, 'Experte: alle Parameter'));
    for (const p of def.params) {
      if (isSelect(p)) {
        const sel = h('select', {
          onchange: (e: Event) => {
            store.setParam(t.id, p.key, (e.target as HTMLSelectElement).value);
            preview(t.id);
            (e.target as HTMLSelectElement).blur();
          },
        }, p.options.map((o) => h('option', { value: o.value, selected: t.params[p.key] === o.value }, o.label)));
        expert.append(h('label', { class: 'slider' }, h('span', { class: 'lbl' }, p.label), sel));
      } else {
        expert.append(
          slider({
            label: p.label, min: p.min, max: p.max, step: p.step, log: p.log, unit: p.unit,
            title: p.macro ? `wird auch vom Makro „${MACROS.find((m) => m.key === p.macro)!.left} ↔ ${MACROS.find((m) => m.key === p.macro)!.right}“ bewegt` : '',
            value: Number(t.params[p.key] ?? p.def),
            onInput: (v) => store.setParam(t.id, p.key, v),
          }),
        );
      }
    }
    expert.append(
      h('div', { class: 'sub' }, 'Spur-Filter'),
      h('label', { class: 'slider' },
        h('span', { class: 'lbl' }, 'Filtertyp'),
        h('select', { onchange: (e: Event) => store.updateTrack(t.id, { filterType: (e.target as HTMLSelectElement).value as FilterType }) },
          h('option', { value: 'lowpass', selected: t.filterType === 'lowpass' }, 'Tiefpass'),
          h('option', { value: 'highpass', selected: t.filterType === 'highpass' }, 'Hochpass'),
          h('option', { value: 'bandpass', selected: t.filterType === 'bandpass' }, 'Bandpass'),
        ),
      ),
      slider({ label: 'Cutoff', min: 20, max: 20000, step: 1, log: true, unit: 'Hz', value: t.cutoff, onInput: (v) => store.updateTrack(t.id, { cutoff: v }) }),
      slider({ label: 'Resonanz', min: 0.1, max: 18, step: 0.1, value: t.resonance, onInput: (v) => store.updateTrack(t.id, { resonance: v }) }),
      slider({ label: 'Drive', min: 0, max: 1, step: 0.01, value: t.drive, onInput: (v) => store.updateTrack(t.id, { drive: v }) }),
      h('div', { class: 'row-btns' },
        h('button', {
          class: 'btn small ghost',
          onclick: () => {
            t.params = defaultParams(t.type);
            store.emit('track', t.id);
            render();
            preview(t.id);
          },
        }, 'Werkseinstellung'),
      ),
    );
    root.append(expert);

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

  store.on(['project', 'tracks', 'selection', 'look'], render);
  store.on('track', (id) => {
    if (id === store.selectedTrackId && !editingIn(root)) render();
  });
  render();
}
