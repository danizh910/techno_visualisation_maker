type Attrs = Record<string, unknown> & { class?: string; style?: string };
type Child = Node | string | number | null | undefined | false;

/** Kleiner Helfer zum Erzeugen von DOM-Elementen */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'style') {
      el.setAttribute('style', String(v));
    } else if (k in el && typeof v !== 'string') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const ICONS: Record<string, string> = {
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  mutate: '<path d="M3 12c2.5-6 5.5-6 9 0s6.5 6 9 0"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  clear: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none"/>',
  song: '<path d="M3 6h5v12H3zM10 9h5v9h-5zM17 4h4v14h-4z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
};

/** schlichtes Linien-Icon */
export function icon(name: keyof typeof ICONS | string): HTMLElement {
  const s = h('span', { class: 'ico', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
  return s;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Wertebereich logarithmisch auf 0..1 abbilden (für Frequenz-Regler) */
export function toSlider(v: number, min: number, max: number, log?: boolean) {
  if (!log) return v;
  return (Math.log(v / min) / Math.log(max / min)) * 1000;
}
export function fromSlider(s: number, min: number, max: number, log?: boolean) {
  if (!log) return s;
  return min * Math.pow(max / min, s / 1000);
}

export function fmt(v: number, unit?: string) {
  let s: string;
  if (unit === 'Hz' && v >= 1000) s = (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz';
  else if (Math.abs(v) >= 100) s = v.toFixed(0) + (unit ? ' ' + unit : '');
  else if (Math.abs(v) >= 10) s = v.toFixed(1) + (unit ? ' ' + unit : '');
  else s = v.toFixed(2) + (unit ? ' ' + unit : '');
  return s;
}

export interface KnobOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  log?: boolean;
  onInput: (v: number) => void;
  disabled?: boolean;
  title?: string;
}

/** Horizontaler Regler mit Wertanzeige */
export function slider(o: KnobOpts): HTMLElement {
  const out = h('span', { class: 'val' }, fmt(o.value, o.unit));
  const input = h('input', {
    type: 'range',
    min: o.log ? 0 : o.min,
    max: o.log ? 1000 : o.max,
    step: o.log ? 1 : o.step,
    value: String(toSlider(o.value, o.min, o.max, o.log)),
    disabled: !!o.disabled,
  });
  input.addEventListener('input', () => {
    let v = fromSlider(parseFloat(input.value), o.min, o.max, o.log);
    if (o.log) v = Math.round(v / o.step) * o.step;
    out.textContent = fmt(v, o.unit);
    o.onInput(v);
  });
  // nach dem Loslassen Fokus abgeben, damit andere Ansichten wieder aktualisieren
  input.addEventListener('change', () => input.blur());
  return h('label', { class: 'slider', title: o.title ?? '' }, h('span', { class: 'lbl' }, o.label), input, out);
}

/** true, wenn der Nutzer gerade einen Regler/ein Feld in diesem Bereich bedient */
export function editingIn(root: HTMLElement): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && root.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA');
}

const rangeDragging = () => {
  const a = document.activeElement;
  return a instanceof HTMLInputElement && a.type === 'range';
};

/**
 * Render-Planer: bündelt viele Aufrufe zu einem pro Frame, überspringt unsichtbare Bereiche
 * (holt sie nach, sobald sie sichtbar werden) und wartet mit `deferWhileDragging`,
 * bis ein Regler woanders losgelassen wird.
 */
export function scheduler(root: HTMLElement, fn: () => void) {
  let queued = false;
  let dirty = false;
  let defer = false;
  const run = () => {
    queued = false;
    if (!root.offsetParent) {
      dirty = true;
      return;
    }
    if (defer && rangeDragging() && !root.contains(document.activeElement)) {
      queued = true;
      window.addEventListener('pointerup', () => requestAnimationFrame(run), { once: true });
      return;
    }
    dirty = defer = false;
    fn();
  };
  new ResizeObserver(() => {
    if (dirty && root.offsetParent) run();
  }).observe(root);
  const schedule = (deferWhileDragging = false) => {
    defer ||= deferWhileDragging;
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  return schedule;
}

/** führt fn aus und stellt danach die Scroll-Position von root wieder her */
export function keepScroll(root: HTMLElement, fn: () => void) {
  const top = root.scrollTop;
  const left = root.scrollLeft;
  fn();
  root.scrollTop = top;
  root.scrollLeft = left;
}
