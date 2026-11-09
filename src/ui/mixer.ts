import { store } from '../store';
import { spatial } from '../audio/engine';
import { clear, keepScroll, editingIn, fmt, h, slider } from './dom';

function vfader(value: number, min: number, max: number, step: number, onInput: (v: number) => void, unit = 'dB') {
  const out = h('span', { class: 'val' }, fmt(value, unit));
  const input = h('input', { type: 'range', class: 'vertical', min, max, step, value: String(value) });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = fmt(v, unit);
    onInput(v);
  });
  input.addEventListener('change', () => input.blur());
  return h('div', { class: 'vfader' }, input, out);
}

export function mountMixer(root: HTMLElement) {
  const render = () => keepScroll(root, renderRaw);

  function renderRaw() {
    clear(root);
    const p = store.project;
    const strips = h('div', { class: 'mixer' });
    for (const t of p.tracks) {
      const sp = spatial(t);
      const strip = h('div', {
        class: 'strip' + (store.selectedTrackId === t.id ? ' selected' : ''),
        style: `--c:${t.color}`,
      });
      strip.append(
        h('button', { class: 'strip-name', onclick: () => store.select(t.id) }, t.name),
        slider({
          label: 'Pan',
          min: -1,
          max: 1,
          step: 0.01,
          value: p.spatialMix ? sp.pan : t.pan,
          disabled: p.spatialMix,
          title: p.spatialMix ? 'Raum-Mix aktiv: Panorama folgt der Position in der 3D-Szene' : '',
          onInput: (v) => store.updateTrack(t.id, { pan: v }),
        }),
        slider({ label: 'Hall', min: 0, max: 1, step: 0.01, value: t.reverb, onInput: (v) => store.updateTrack(t.id, { reverb: v }) }),
        slider({ label: 'Delay', min: 0, max: 1, step: 0.01, value: t.delay, onInput: (v) => store.updateTrack(t.id, { delay: v }) }),
        t.type === 'kick'
          ? h('div', { class: 'slider-spacer' })
          : slider({ label: 'Duck', min: 0, max: 1, step: 0.01, value: t.sidechain, title: 'Sidechain: duckt unter die Kick', onInput: (v) => store.updateTrack(t.id, { sidechain: v }) }),
        vfader(t.volume, -40, 6, 0.5, (v) => store.updateTrack(t.id, { volume: v })),
        h('div', { class: 'strip-ms' },
          h('button', { class: 'tog' + (t.mute ? ' on mute' : ''), onclick: () => store.updateTrack(t.id, { mute: !t.mute }) }, 'M'),
          h('button', { class: 'tog' + (t.solo ? ' on solo' : ''), onclick: () => store.updateTrack(t.id, { solo: !t.solo }) }, 'S'),
        ),
      );
      strips.append(strip);
    }

    const m = p.master;
    const master = h('div', { class: 'strip master' },
      h('div', { class: 'strip-name' }, 'MASTER'),
      slider({ label: 'Kompressor', min: -40, max: 0, step: 0.5, value: m.compThreshold, unit: 'dB', onInput: (v) => { m.compThreshold = v; store.emit('master'); } }),
      slider({ label: 'Hall-Länge', min: 0.5, max: 12, step: 0.1, value: m.reverbDecay, unit: 's', onInput: (v) => { m.reverbDecay = v; store.emit('master'); } }),
      slider({ label: 'Delay-FB', min: 0, max: 0.9, step: 0.01, value: m.delayFeedback, onInput: (v) => { m.delayFeedback = v; store.emit('master'); } }),
      h('label', { class: 'slider' },
        h('span', { class: 'lbl' }, 'Delay-Zeit'),
        h('select', {
          onchange: (e: Event) => { m.delayTime = (e.target as HTMLSelectElement).value; store.emit('master'); },
        }, ['16n', '8n', '8n.', '4n', '8t', '4n.'].map((d) => h('option', { value: d, selected: d === m.delayTime }, d))),
      ),
      vfader(m.volume, -30, 6, 0.5, (v) => { m.volume = v; store.emit('master'); }),
    );
    strips.append(master);
    if (!p.tracks.length) root.append(h('div', { class: 'empty' }, 'Noch keine Spuren.'));
    root.append(strips);
  }

  store.on(['project', 'tracks', 'selection', 'position'], () => {
    if (!editingIn(root)) render();
  });
  store.on('track', () => {
    if (!editingIn(root)) render();
  });
  store.on('transport', render);
  render();
}
