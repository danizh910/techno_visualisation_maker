import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { InstrumentType, Step, Track } from '../types';
import { STEPS } from '../types';

const RING_RADIUS = 1.75;
const MAX_RADIUS = 13;
const SPECTRUM_BARS = 72;

interface TrackObject {
  id: string;
  type: InstrumentType;
  group: THREE.Group;
  body: THREE.Mesh;
  edges: THREE.LineSegments;
  proxy: THREE.Mesh;
  ring: THREE.InstancedMesh;
  label: THREE.Sprite;
  shadow: THREE.Mesh;
  color: THREE.Color;
  energy: number;
  noteTarget: number;
  noteY: number;
  audible: boolean;
  steps: Step[];
  name: string;
}

function geometryFor(type: InstrumentType): THREE.BufferGeometry {
  switch (type) {
    case 'kick':
      return new THREE.IcosahedronGeometry(1, 1);
    case 'snare':
      return new THREE.TorusGeometry(0.75, 0.28, 14, 36);
    case 'clap':
      return new THREE.OctahedronGeometry(0.9);
    case 'hat':
      return new THREE.ConeGeometry(0.65, 1.2, 6);
    case 'openhat':
      return new THREE.ConeGeometry(0.95, 0.8, 10);
    case 'perc':
      return new THREE.CylinderGeometry(0.6, 0.6, 0.8, 12);
    case 'bass':
      return new THREE.BoxGeometry(1.25, 1.25, 1.25);
    case 'acid':
      return new THREE.TorusKnotGeometry(0.55, 0.18, 90, 10);
    case 'stab':
      return new THREE.DodecahedronGeometry(0.9);
    case 'pad':
      return new THREE.SphereGeometry(1.15, 20, 14);
    case 'fm':
      return new THREE.TetrahedronGeometry(1.05);
    case 'fx':
      return new THREE.TorusGeometry(1, 0.07, 8, 48);
  }
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.font = '700 48px "Space Grotesk", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text.toUpperCase(), 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(4.4, 0.83, 1);
  return s;
}

export interface SceneCallbacks {
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onMoving?: (id: string, x: number, z: number) => void;
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private objects = new Map<string, TrackObject>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private selectRing: THREE.Mesh;
  private selectedId: string | null = null;
  private dragging: { id: string; moved: boolean; start: THREE.Vector3; offset: THREE.Vector3 } | null = null;
  private spectrum: THREE.InstancedMesh;
  private spectrumLevels = new Float32Array(SPECTRUM_BARS);
  private grid: THREE.GridHelper;
  private lasers: THREE.Mesh[] = [];
  private core: THREE.Mesh;
  private timer = new THREE.Timer();
  private playStep = -1;
  private bassLevel = 0;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  analyser: (() => Float32Array | null) | null = null;

  constructor(private container: HTMLElement, private cb: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x05020c);
    this.scene.fog = new THREE.FogExp2(0x05020c, 0.028);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(0, 11, 19);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 45;
    this.controls.target.set(0, 0.8, -1.5);
    this.controls.autoRotateSpeed = 0.6;

    // Licht
    this.scene.add(new THREE.AmbientLight(0x6040a0, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(5, 12, 8);
    this.scene.add(key);
    const rim = new THREE.PointLight(0xff2e9a, 40, 40);
    rim.position.set(-10, 6, -10);
    this.scene.add(rim);
    const rim2 = new THREE.PointLight(0x00e5ff, 40, 40);
    rim2.position.set(10, 6, -8);
    this.scene.add(rim2);

    // Boden
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(60, 64),
      new THREE.MeshStandardMaterial({ color: 0x07030f, roughness: 0.35, metalness: 0.8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.scene.add(floor);
    this.grid = new THREE.GridHelper(80, 80, 0xff2e9a, 0x3a1466);
    const gm = this.grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.35;
    this.scene.add(this.grid);

    // Bühnen-Kreis
    const stage = new THREE.Mesh(
      new THREE.RingGeometry(MAX_RADIUS + 0.4, MAX_RADIUS + 0.55, 128),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7a3cff).multiplyScalar(1.6), toneMapped: false, side: THREE.DoubleSide }),
    );
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = 0.01;
    this.scene.add(stage);

    // Spektrum-Ring
    const barGeo = new THREE.BoxGeometry(0.35, 1, 0.35);
    barGeo.translate(0, 0.5, 0);
    this.spectrum = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), SPECTRUM_BARS);
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      const a = (i / SPECTRUM_BARS) * Math.PI * 2;
      this.dummy.position.set(Math.cos(a) * (MAX_RADIUS + 2.5), 0, Math.sin(a) * (MAX_RADIUS + 2.5));
      this.dummy.rotation.set(0, -a, 0);
      this.dummy.scale.set(1, 0.05, 1);
      this.dummy.updateMatrix();
      this.spectrum.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.setHSL(0.83 - (i / SPECTRUM_BARS) * 0.35, 1, 0.55);
      this.spectrum.setColorAt(i, this.tmpColor);
    }
    this.scene.add(this.spectrum);

    // Laser
    for (let i = 0; i < 6; i++) {
      const laser = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 60, 6),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(i % 2 ? 0x00e5ff : 0xff2e9a).multiplyScalar(2),
          toneMapped: false,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      laser.geometry.translate(0, 30, 0);
      laser.position.set(0, 0.2, -26);
      this.lasers.push(laser);
      this.scene.add(laser);
    }

    // Zentrum (reagiert auf Master-Bass)
    this.core = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.55, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff), toneMapped: false, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
    );
    this.core.rotation.x = -Math.PI / 2;
    this.core.position.y = 0.02;
    this.scene.add(this.core);

    // Auswahl-Ring
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(RING_RADIUS + 0.3, RING_RADIUS + 0.42, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.5), toneMapped: false, side: THREE.DoubleSide }),
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.position.y = 0.03;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);

    // Post-Processing (Neon-Glow)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 1.05, 0.55, 0.18);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Render-Loop an/aus (z. B. wenn die Club-Ansicht aktiv ist). */
  setActive(on: boolean) {
    this.renderer.setAnimationLoop(on ? () => this.frame() : null);
    if (on) this.resize();
  }

  set autoRotate(v: boolean) {
    this.controls.autoRotate = v;
  }
  get autoRotate() {
    return this.controls.autoRotate;
  }

  resetCamera() {
    this.camera.position.set(0, 11, 19);
    this.controls.target.set(0, 0.8, -1.5);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- Spuren ---------------- */

  syncTracks(tracks: Track[], stepsFor: (id: string) => Step[], audible: (t: Track) => boolean) {
    const ids = new Set(tracks.map((t) => t.id));
    for (const [id, o] of this.objects) {
      if (!ids.has(id) || o.type !== tracks.find((t) => t.id === id)?.type) this.removeObject(id);
    }
    for (const t of tracks) {
      let o = this.objects.get(t.id);
      if (!o) o = this.addObject(t);
      if (o.name !== t.name || !o.color.equals(new THREE.Color(t.color))) this.restyle(o, t);
      if (!this.dragging || this.dragging.id !== t.id) o.group.position.set(t.pos.x, 0, t.pos.z);
      o.audible = audible(t);
      o.steps = stepsFor(t.id);
    }
    this.setSelected(this.selectedId);
  }

  private addObject(t: Track): TrackObject {
    const color = new THREE.Color(t.color);
    const group = new THREE.Group();
    const geo = geometryFor(t.type);
    const isWire = t.type === 'pad';
    const body = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.15),
        emissive: color,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.4,
        wireframe: isWire,
        transparent: true,
        opacity: isWire ? 0.8 : 0.92,
      }),
    );
    body.position.y = 1.4;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 20),
      new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(2), toneMapped: false, transparent: true }),
    );
    body.add(edges);
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 3, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    proxy.position.y = 1.5;
    proxy.userData.trackId = t.id;

    const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.08, 0.26), new THREE.MeshBasicMaterial({ toneMapped: false }), STEPS);
    for (let i = 0; i < STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
      this.dummy.position.set(Math.cos(a) * RING_RADIUS, 0.05, Math.sin(a) * RING_RADIUS);
      this.dummy.rotation.set(0, -a, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      ring.setMatrixAt(i, this.dummy.matrix);
      ring.setColorAt(i, color);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.15, toneMapped: false, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;

    const label = makeLabel(t.name, t.color);
    label.position.y = 3.3;

    group.add(body, proxy, ring, shadow, label);
    this.scene.add(group);
    const o: TrackObject = {
      id: t.id, type: t.type, group, body, edges, proxy, ring, label, shadow, color,
      energy: 0, noteTarget: 0, noteY: 0, audible: true, steps: [], name: t.name,
    };
    this.objects.set(t.id, o);
    return o;
  }

  private restyle(o: TrackObject, t: Track) {
    o.name = t.name;
    o.color.set(t.color);
    const mat = o.body.material as THREE.MeshStandardMaterial;
    mat.emissive.copy(o.color);
    mat.color.copy(o.color).multiplyScalar(0.15);
    (o.edges.material as THREE.LineBasicMaterial).color.copy(o.color).multiplyScalar(2);
    (o.shadow.material as THREE.MeshBasicMaterial).color.copy(o.color);
    o.group.remove(o.label);
    o.label.material.map?.dispose();
    o.label.material.dispose();
    o.label = makeLabel(t.name, t.color);
    o.label.position.y = 3.3;
    o.group.add(o.label);
  }

  private removeObject(id: string) {
    const o = this.objects.get(id);
    if (!o) return;
    this.scene.remove(o.group);
    o.group.traverse((c) => {
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.objects.delete(id);
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    const o = id ? this.objects.get(id) : undefined;
    this.selectRing.visible = !!o;
    if (o) (this.selectRing.material as THREE.MeshBasicMaterial).color.copy(o.color).multiplyScalar(2.5);
  }

  trigger(id: string, vel: number, note: number) {
    const o = this.objects.get(id);
    if (!o) return;
    o.energy = Math.min(1.4, Math.max(o.energy, vel));
    o.noteTarget = note;
  }

  setPlayStep(step: number) {
    this.playStep = step;
  }

  /* ---------------- Interaktion ---------------- */

  private setPointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private pick(): string | null {
    const proxies = [...this.objects.values()].map((o) => o.proxy);
    const hit = this.raycaster.intersectObjects(proxies, false)[0];
    return hit ? (hit.object.userData.trackId as string) : null;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    let downAt = { x: 0, y: 0 };
    el.addEventListener('pointerdown', (e) => {
      downAt = { x: e.clientX, y: e.clientY };
      this.setPointer(e);
      const id = this.pick();
      if (!id) return;
      const o = this.objects.get(id)!;
      const p = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(this.floorPlane, p);
      this.dragging = { id, moved: false, start: o.group.position.clone(), offset: o.group.position.clone().sub(p) };
      this.controls.enabled = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      this.setPointer(e);
      if (!this.dragging) {
        el.style.cursor = this.pick() ? 'grab' : '';
        return;
      }
      el.style.cursor = 'grabbing';
      const p = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.floorPlane, p)) return;
      p.add(this.dragging.offset);
      p.y = 0;
      if (p.length() > MAX_RADIUS) p.setLength(MAX_RADIUS);
      const o = this.objects.get(this.dragging.id);
      if (!o) return;
      if (p.distanceTo(this.dragging.start) > 0.15) this.dragging.moved = true;
      o.group.position.copy(p);
      if (this.dragging.moved) this.cb.onMoving?.(this.dragging.id, p.x, p.z);
    });
    const end = (e: PointerEvent) => {
      const clickLike = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5;
      if (this.dragging) {
        const d = this.dragging;
        this.dragging = null;
        this.controls.enabled = true;
        el.style.cursor = '';
        const o = this.objects.get(d.id);
        if (d.moved && o) {
          const r = (v: number) => Math.round(v * 10) / 10;
          this.cb.onMove(d.id, r(o.group.position.x), r(o.group.position.z));
        }
        this.cb.onSelect(d.id);
      } else if (clickLike && e.type === 'pointerup') {
        this.setPointer(e);
        if (!this.pick()) this.cb.onSelect(null);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ---------------- Render-Loop ---------------- */

  private frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();

    // Spektrum
    const fft = this.analyser?.();
    let bass = 0;
    if (fft) {
      const usable = Math.floor(fft.length * 0.7);
      for (let i = 0; i < SPECTRUM_BARS; i++) {
        // spiegeln: links/rechts symmetrisch, tiefe Frequenzen vorne
        const mirrored = i < SPECTRUM_BARS / 2 ? i : SPECTRUM_BARS - 1 - i;
        const norm = mirrored / (SPECTRUM_BARS / 2);
        const idx = Math.min(usable - 1, Math.floor(Math.pow(norm, 1.8) * usable));
        const v = Math.max(0, (fft[idx] + 90) / 80);
        this.spectrumLevels[i] += (v - this.spectrumLevels[i]) * Math.min(1, dt * 18);
      }
      bass = Math.max(0, ((fft[1] + fft[2] + fft[3]) / 3 + 60) / 50);
    } else {
      for (let i = 0; i < SPECTRUM_BARS; i++) this.spectrumLevels[i] *= 0.92;
    }
    this.bassLevel += (bass - this.bassLevel) * Math.min(1, dt * 20);
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      const a = (i / SPECTRUM_BARS) * Math.PI * 2 + Math.PI / 2;
      const lv = this.spectrumLevels[i];
      this.dummy.position.set(Math.cos(a) * (MAX_RADIUS + 2.5), 0, Math.sin(a) * (MAX_RADIUS + 2.5));
      this.dummy.rotation.set(0, -a, 0);
      this.dummy.scale.set(1, 0.05 + lv * lv * 7, 1);
      this.dummy.updateMatrix();
      this.spectrum.setMatrixAt(i, this.dummy.matrix);
      this.tmpColor.setHSL(0.83 - (i / SPECTRUM_BARS) * 0.35, 1, 0.45).multiplyScalar(0.6 + lv * 2.2);
      this.spectrum.setColorAt(i, this.tmpColor);
    }
    this.spectrum.instanceMatrix.needsUpdate = true;
    if (this.spectrum.instanceColor) this.spectrum.instanceColor.needsUpdate = true;

    // Grid + Zentrum + Laser
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.opacity = 0.25 + this.bassLevel * 0.35;
    const cs = 1 + this.bassLevel * 6;
    this.core.scale.set(cs, cs, 1);
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0.15 + this.bassLevel * 0.5;
    this.lasers.forEach((l, i) => {
      const phase = t * 0.4 + i * 1.05;
      // Laser schießen hinter der Bühne fächerförmig nach oben
      l.rotation.set(-0.35 - Math.sin(phase * 0.7) * 0.15, 0, Math.sin(phase) * 0.75);
      const mat = l.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(0.45, this.bassLevel * 0.5);
    });

    // Spuren
    for (const o of this.objects.values()) {
      const decay = o.type === 'pad' ? 1.2 : o.type === 'openhat' || o.type === 'stab' ? 4 : 7;
      o.energy *= Math.exp(-dt * decay);
      o.noteY += (o.noteTarget / 24 - o.noteY) * Math.min(1, dt * 12);
      const e = o.energy;
      const s = 1 + e * 0.5;
      o.body.scale.setScalar(s);
      o.body.position.y = 1.4 + o.noteY * 1.6 + e * 0.35;
      o.body.rotation.y += dt * (0.25 + e * 4);
      o.body.rotation.x += dt * (o.type === 'acid' || o.type === 'fm' ? 0.6 : 0.08) * (1 + e * 3);
      const mat = o.body.material as THREE.MeshStandardMaterial;
      const dim = o.audible ? 1 : 0.15;
      mat.emissiveIntensity = (0.35 + e * 3.2) * dim;
      mat.opacity = o.audible ? (o.type === 'pad' ? 0.8 : 0.92) : 0.35;
      (o.edges.material as THREE.LineBasicMaterial).opacity = o.audible ? 0.6 + e * 0.4 : 0.15;
      const sh = o.shadow.material as THREE.MeshBasicMaterial;
      sh.opacity = (0.08 + e * 0.5) * dim;
      o.shadow.scale.setScalar(1 + e * 0.8);

      for (let i = 0; i < STEPS; i++) {
        const st = o.steps[i];
        if (i === this.playStep) {
          this.tmpColor.setRGB(1, 1, 1).multiplyScalar(st?.on ? 3 : 1.2);
        } else if (st?.on) {
          this.tmpColor.copy(o.color).multiplyScalar((0.6 + st.vel * 1.2) * dim);
        } else {
          this.tmpColor.copy(o.color).multiplyScalar(0.07);
        }
        o.ring.setColorAt(i, this.tmpColor);
      }
      if (o.ring.instanceColor) o.ring.instanceColor.needsUpdate = true;
    }

    const sel = this.selectedId ? this.objects.get(this.selectedId) : undefined;
    if (sel) {
      this.selectRing.position.x = sel.group.position.x;
      this.selectRing.position.z = sel.group.position.z;
      this.selectRing.rotation.z += dt * 0.8;
    }

    this.controls.update();
    this.composer.render();
  }
}
