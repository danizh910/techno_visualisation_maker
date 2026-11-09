import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { InstrumentType, SceneName, Step, Track } from '../types';
import { STEPS } from '../types';

const RING_RADIUS = 1.75;
const MAX_RADIUS = 13;
const BODY_Y = 1.75;
const WALL_BARS = 56;
const LINE_POINTS = 96;
const BASE_FOV = 45;

/** wie ein Instrument sich bewegt: Kick bewegt den Raum, Hats nur Details, Bass Masse */
type Role = 'kick' | 'detail' | 'mass' | 'breath' | 'hit';
const ROLE: Record<InstrumentType, Role> = {
  kick: 'kick', hat: 'detail', openhat: 'detail', ride: 'detail', shaker: 'detail',
  bass: 'mass', pad: 'breath',
  snare: 'hit', clap: 'hit', perc: 'hit', acid: 'hit', stab: 'hit', fm: 'hit', fx: 'hit',
};
const DECAY: Record<Role, number> = { kick: 9, detail: 14, mass: 3.2, breath: 1.1, hit: 6 };

interface LookDef {
  bg: number;
  fog: () => THREE.Fog | THREE.FogExp2;
  solid: boolean;
  /** Helligkeit der Skulpturen relativ zur Spurfarbe */
  bodyMul: number;
  edgeOpacity: number;
  label: string;
  ringOff: number;
  exposure: number;
}

const LOOKS: Record<SceneName, LookDef> = {
  halle: {
    bg: 0x070708,
    fog: () => new THREE.FogExp2(0x0b0b0d, 0.03),
    solid: true,
    bodyMul: 0.62,
    edgeOpacity: 0,
    label: '#9d9992',
    ringOff: 0.06,
    exposure: 1.05,
  },
  linien: {
    bg: 0x000000,
    fog: () => new THREE.Fog(0x000000, 22, 62),
    solid: false,
    bodyMul: 1,
    edgeOpacity: 0.85,
    label: '#d8d5cf',
    ringOff: 0.1,
    exposure: 1,
  },
  studio: {
    bg: 0xe8e6e1,
    fog: () => new THREE.Fog(0xe8e6e1, 34, 85),
    solid: true,
    bodyMul: 1.05,
    edgeOpacity: 0,
    label: '#3b3935',
    ringOff: 0.55,
    exposure: 1,
  },
};

interface TrackObject {
  id: string;
  type: InstrumentType;
  role: Role;
  group: THREE.Group;
  plinth: THREE.Mesh;
  body: THREE.Mesh;
  edges: THREE.LineSegments;
  proxy: THREE.Mesh;
  ring: THREE.InstancedMesh;
  label: THREE.Sprite;
  color: THREE.Color;
  energy: number;
  noteTarget: number;
  noteY: number;
  spin: number;
  audible: boolean;
  steps: Step[];
  name: string;
}

function geometryFor(type: InstrumentType): THREE.BufferGeometry {
  switch (type) {
    case 'kick':
      return new THREE.IcosahedronGeometry(1, 0);
    case 'snare':
      return new THREE.TorusGeometry(0.72, 0.26, 12, 32);
    case 'clap':
      return new THREE.OctahedronGeometry(0.9);
    case 'hat':
      return new THREE.ConeGeometry(0.62, 1.2, 6);
    case 'openhat':
      return new THREE.ConeGeometry(0.92, 0.75, 8);
    case 'ride':
      return new THREE.CylinderGeometry(1.05, 1.05, 0.12, 24);
    case 'shaker':
      return new THREE.CapsuleGeometry(0.38, 0.9, 4, 12);
    case 'perc':
      return new THREE.CylinderGeometry(0.6, 0.6, 0.8, 10);
    case 'bass':
      return new THREE.BoxGeometry(1.3, 1.3, 1.3);
    case 'acid':
      return new THREE.TorusKnotGeometry(0.55, 0.17, 96, 10);
    case 'stab':
      return new THREE.DodecahedronGeometry(0.9);
    case 'pad':
      return new THREE.SphereGeometry(1.1, 32, 20);
    case 'fm':
      return new THREE.TetrahedronGeometry(1.05);
    case 'fx':
      return new THREE.TorusGeometry(1, 0.06, 8, 48);
  }
}

function makeLabel(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = '600 34px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), 256, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }));
  s.scale.set(4, 0.5, 1);
  s.position.y = 3.6;
  return s;
}

/** prozedurale Beton-Textur */
function concreteTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7a7a78';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const r = 10 + Math.random() * 90;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const v = Math.random() < 0.5 ? 0 : 255;
    g.addColorStop(0, `rgba(${v},${v},${v},${0.035 + Math.random() * 0.04})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.save();
    ctx.translate(Math.random() * size, Math.random() * size);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // Fugen
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function softDot(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** weicher volumetrischer Lichtkegel (additiv) */
function coneMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: color }, intensity: { value: 0.3 } },
    vertexShader: `
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        vY = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color; uniform float intensity;
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(vN, vV)), 2.0);
        float fall = pow(vY, 1.4);
        gl_FragColor = vec4(color * intensity * edge * fall, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

interface Spot {
  light: THREE.SpotLight;
  cone: THREE.Mesh;
  base: THREE.Vector3;
  phase: number;
  accent: boolean;
}

export interface SceneCallbacks {
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  onMoving?: (id: string, x: number, z: number) => void;
}

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private objects = new Map<string, TrackObject>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private selectRing: THREE.Mesh;
  private selectedId: string | null = null;
  private dragging: { id: string; moved: boolean; start: THREE.Vector3; offset: THREE.Vector3 } | null = null;
  private timer = new THREE.Timer();
  private playStep = -1;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private tmpV = new THREE.Vector3();
  private accent = new THREE.Color('#ff3b1f');
  private look: SceneName = 'halle';
  private envs: Record<SceneName, THREE.Group> = { halle: new THREE.Group(), linien: new THREE.Group(), studio: new THREE.Group() };
  private plinthMats: Record<SceneName, THREE.MeshStandardMaterial>;
  private spots: Spot[] = [];
  private hemi: THREE.HemisphereLight;
  private fill: THREE.DirectionalLight;
  private studioKey: THREE.DirectionalLight;
  private haze!: THREE.Points;
  private wallBars!: THREE.InstancedMesh;
  private lineSpec!: THREE.Line;
  private lineGrid!: THREE.GridHelper;
  private specLevels = new Float32Array(WALL_BARS);
  private lineLevels = new Float32Array(LINE_POINTS);
  /** Kick-Puls (bewegt Licht + Kamera), Bass-Gewicht, Hat-Funkeln */
  private pulse = 0;
  private weight = 0;
  private sparkle = 0;
  private loopRunning = true;
  /* Auto-Kamera (VJ-Modus, Video) */
  private auto = false;
  private snapCam = false;
  private shotOffset = 0;
  private camTarget = new THREE.Vector3(0, 1.4, -2);
  private camPos = new THREE.Vector3();
  /** Sekunden pro Kamera-Einstellung */
  shotLen = 12;
  analyser: (() => Float32Array | null) | null = null;

  constructor(private container: HTMLElement, private cb: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 45;
    this.controls.autoRotateSpeed = 0.5;
    this.resetCamera();

    const conc = concreteTexture();
    this.plinthMats = {
      halle: new THREE.MeshStandardMaterial({ color: 0x4a4a49, roughness: 0.95, map: conc }),
      linien: new THREE.MeshStandardMaterial({ visible: false }),
      studio: new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.9 }),
    };

    // gemeinsame Grundbeleuchtung
    this.hemi = new THREE.HemisphereLight(0x5a5a64, 0x080808, 0.35);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.12);
    this.fill.position.set(0, 8, 20);
    this.studioKey = new THREE.DirectionalLight(0xffffff, 2.2);
    this.studioKey.position.set(-8, 18, 10);
    this.studioKey.castShadow = true;
    this.studioKey.shadow.mapSize.set(2048, 2048);
    this.studioKey.shadow.radius = 8;
    this.studioKey.shadow.bias = -0.0004;
    Object.assign(this.studioKey.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
    this.scene.add(this.hemi, this.fill);

    this.buildHalle(conc);
    this.buildLinien();
    this.buildStudio();
    for (const g of Object.values(this.envs)) this.scene.add(g);

    // Auswahl-Ring
    this.selectRing = new THREE.Mesh(
      new THREE.RingGeometry(RING_RADIUS + 0.32, RING_RADIUS + 0.38, 96),
      new THREE.MeshBasicMaterial({ color: this.accent, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.position.y = 0.025;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.5, 0.82);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.setLook('halle');
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      if (!this.loopRunning) return;
      this.timer.update();
      this.step(Math.min(0.05, this.timer.getDelta()), this.timer.getElapsed());
    });
  }

  /* ---------------- Umgebungen ---------------- */

  private buildHalle(conc: THREE.CanvasTexture) {
    const env = this.envs.halle;
    const floorTex = conc.clone();
    floorTex.repeat.set(14, 14);
    floorTex.needsUpdate = true;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: 0x5a5a59, roughness: 0.88, metalness: 0.02, map: floorTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    env.add(floor);

    const wallTex = conc.clone();
    wallTex.repeat.set(6, 2);
    wallTex.needsUpdate = true;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3c3c3c, roughness: 1, map: wallTex });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(80, 26), wallMat);
    back.position.set(0, 13, -27);
    back.receiveShadow = true;
    const left = back.clone();
    left.rotation.y = Math.PI / 2;
    left.position.set(-32, 13, 0);
    const right = back.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.set(32, 13, 0);
    env.add(back, left, right);

    // Pfeiler und Deckenträger
    const pillarGeo = new THREE.BoxGeometry(1.6, 24, 1.6);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x484847, roughness: 0.95, map: conc });
    for (const x of [-19, 19]) {
      for (let z = -21; z <= 15; z += 9) {
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.position.set(x, 12, z);
        p.castShadow = true;
        p.receiveShadow = true;
        env.add(p);
      }
    }
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, metalness: 0.4 });
    for (let z = -21; z <= 15; z += 9) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(40, 0.8, 0.5), beamMat);
      beam.position.set(0, 16.5, z);
      env.add(beam);
    }

    // Spots mit sichtbaren Lichtkegeln
    const defs: [number, number, number, boolean][] = [
      [-7, 15, 3, false], [7, 15, 3, false], [-4, 15, -9, false], [4, 15, -9, true], [0, 15, -2, false],
    ];
    defs.forEach(([x, y, z, accent], i) => {
      const color = accent ? this.accent : new THREE.Color(0xfff1e0);
      const light = new THREE.SpotLight(color, 120, 0, 0.3, 0.75, 1);
      light.position.set(x, y, z);
      light.castShadow = i < 3;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0005;
      light.shadow.radius = 6;
      env.add(light, light.target);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 1, true), coneMaterial(color));
      cone.frustumCulled = false;
      env.add(cone);
      this.spots.push({ light, cone, base: new THREE.Vector3(x * 0.6, 0, z * 0.6), phase: i * 1.7, accent });
    });

    // Dunst
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = 0.5 + Math.random() * 13;
      pos[i * 3 + 2] = -24 + Math.random() * 40;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.haze = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 9, map: softDot(), color: 0x8a8a92, transparent: true, opacity: 0.045, depthWrite: false, sizeAttenuation: true }),
    );
    env.add(this.haze);

    // LED-Leiste an der Rückwand (Spektrum, dezent)
    const barGeo = new THREE.BoxGeometry(0.42, 1, 0.08);
    barGeo.translate(0, 0.5, 0);
    this.wallBars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), WALL_BARS);
    for (let i = 0; i < WALL_BARS; i++) this.wallBars.setColorAt(i, this.tmpColor.setRGB(0, 0, 0));
    env.add(this.wallBars);
  }

  private buildLinien() {
    const env = this.envs.linien;
    this.lineGrid = new THREE.GridHelper(90, 45, 0x4a4a4a, 0x1c1c1c);
    const gm = this.lineGrid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    env.add(this.lineGrid);
    const circle = (r: number, op: number) => {
      const pts = Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * r, 0.01, Math.sin(a) * r);
      });
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: op }));
    };
    env.add(circle(MAX_RADIUS + 0.6, 0.35), circle(MAX_RADIUS + 1.1, 0.12), circle(3, 0.12));
    // Horizontlinien an der Rückseite
    for (let i = 0; i < 8; i++) {
      const y = 1 + i * 1.6;
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30, y, -24), new THREE.Vector3(30, y, -24)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05 + (i === 0 ? 0.1 : 0) }),
      );
      env.add(l);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
    this.lineSpec = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.accent }));
    this.lineSpec.frustumCulled = false;
    env.add(this.lineSpec);
  }

  private buildStudio() {
    const env = this.envs.studio;
    const mat = new THREE.MeshStandardMaterial({ color: 0xeceae5, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    // Hohlkehle: Boden geht weich in die Rückwand über (Fotostudio)
    const cove = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 140, 32, 1, true, 0, Math.PI / 2), mat);
    cove.rotation.z = Math.PI / 2;
    cove.rotation.y = Math.PI;
    cove.position.set(0, 10, -24);
    cove.material = mat.clone();
    (cove.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(140, 40), mat);
    wall.position.set(0, 30, -34);
    env.add(floor, cove, wall, this.studioKey, this.studioKey.target);
  }

  /* ---------------- Look ---------------- */

  setLook(name: SceneName) {
    this.look = name;
    const L = LOOKS[name];
    for (const [k, g] of Object.entries(this.envs)) g.visible = k === name;
    this.scene.background = new THREE.Color(L.bg);
    this.scene.fog = L.fog();
    this.renderer.toneMappingExposure = L.exposure;
    this.hemi.intensity = name === 'studio' ? 1.6 : name === 'halle' ? 0.35 : 0.2;
    this.hemi.color.set(name === 'studio' ? 0xffffff : 0x5a5a64);
    this.hemi.groundColor.set(name === 'studio' ? 0xb9b4aa : 0x080808);
    this.fill.intensity = name === 'studio' ? 0.4 : 0.12;
    for (const o of this.objects.values()) this.styleObject(o);
    (this.selectRing.material as THREE.MeshBasicMaterial).color.copy(this.accent);
  }

  get currentLook() {
    return this.look;
  }

  setAccent(hex: string) {
    this.accent.set(hex);
    // Farb-Objekte sind geteilt (Spots, Kegel, Linien), daher reicht das Setzen
    for (const s of this.spots) if (s.accent) s.light.color.copy(this.accent);
    (this.lineSpec.material as THREE.LineBasicMaterial).color.copy(this.accent);
    for (const o of this.objects.values()) (o.body.material as THREE.MeshStandardMaterial).emissive.copy(this.accent);
    (this.selectRing.material as THREE.MeshBasicMaterial).color.copy(this.accent);
  }

  /** automatische Kamerafahrten statt Maus-Steuerung */
  set autoCam(v: boolean) {
    if (v && !this.auto) this.snapCam = true;
    if (!v && this.auto) this.controls.target.copy(this.camTarget);
    this.auto = v;
    this.controls.enabled = !v;
  }
  get autoCam() {
    return this.auto;
  }

  /** nächste Kamera-Einstellung (Taste C) */
  nextShot() {
    this.shotOffset++;
  }

  private autoCamera(dt: number, t: number) {
    const shots = 5;
    const idx = Math.floor(t / this.shotLen) + this.shotOffset;
    const shot = ((idx % shots) + shots) % shots;
    const pos = this.camPos;
    const tgt = this.tmpV;
    const objs = [...this.objects.values()];
    switch (shot) {
      case 0: { // weiter Orbit
        const a = t * 0.06;
        pos.set(Math.sin(a) * 21, 8, Math.cos(a) * 21);
        tgt.set(0, 1.5, 0);
        break;
      }
      case 1: { // tiefe Fahrt auf Augenhöhe der Skulpturen
        const x = Math.sin(t * 0.07) * 15;
        pos.set(x, 2.1, 10.5);
        tgt.set(x * 0.3, 1.8, -3);
        break;
      }
      case 2: { // Draufsicht, langsam drehend
        const a = t * 0.04;
        pos.set(Math.sin(a) * 2, 26, Math.cos(a) * 2);
        tgt.set(0, 0, 0);
        break;
      }
      case 3: { // Nahaufnahme einer Skulptur
        const c = objs.length ? objs[((idx % objs.length) + objs.length) % objs.length].group.position : new THREE.Vector3();
        const a = t * 0.22;
        pos.set(c.x + Math.sin(a) * 5.5, 3.2, c.z + Math.cos(a) * 5.5);
        tgt.set(c.x, 1.8, c.z);
        break;
      }
      default: { // hohe Diagonale
        const a = Math.PI * 0.25 + Math.sin(t * 0.05) * 0.6;
        pos.set(Math.sin(a) * 16, 14, Math.cos(a) * 16);
        tgt.set(0, 0.5, 0);
      }
    }
    const k = this.snapCam ? 1 : 1 - Math.exp(-dt * 1.2);
    this.snapCam = false;
    this.camera.position.lerp(pos, k);
    this.camTarget.lerp(tgt, k);
    this.camera.lookAt(this.camTarget);
  }

  set bloom(v: boolean) {
    this.bloomPass.enabled = v;
  }
  get bloom() {
    return this.bloomPass.enabled;
  }

  set autoRotate(v: boolean) {
    this.controls.autoRotate = v;
  }
  get autoRotate() {
    return this.controls.autoRotate;
  }

  resetCamera() {
    this.camera.position.set(0, 7, 15.5);
    this.controls.target.set(0, 1.4, -2);
  }

  private resize() {
    if (!this.loopRunning) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.setRenderSize(w, h);
  }

  /** Render-Auflösung setzen (Video-Export nutzt feste Größe) */
  setRenderSize(w: number, h: number, pixelRatio = Math.min(window.devicePixelRatio, 2)) {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w / 2, h / 2);
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
      if (o.name !== t.name || o.color.getHexString() !== new THREE.Color(t.color).getHexString()) {
        o.name = t.name;
        o.color.set(t.color);
        this.styleObject(o);
      }
      if (!this.dragging || this.dragging.id !== t.id) o.group.position.set(t.pos.x, 0, t.pos.z);
      o.audible = audible(t);
      o.steps = stepsFor(t.id);
    }
    this.setSelected(this.selectedId);
  }

  private addObject(t: Track): TrackObject {
    const group = new THREE.Group();
    const geo = geometryFor(t.type);
    const body = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.08, emissive: this.accent.clone(), emissiveIntensity: 0, flatShading: t.type !== 'pad' }),
    );
    body.position.y = BODY_Y;
    body.castShadow = true;
    body.receiveShadow = true;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 18),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }),
    );
    body.add(edges);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 1.5), this.plinthMats.halle);
    plinth.position.y = 0.275;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 3.4, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    proxy.position.y = 1.7;
    proxy.userData.trackId = t.id;

    const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.02, 0.07), new THREE.MeshBasicMaterial({ fog: true }), STEPS);
    for (let i = 0; i < STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2 - Math.PI / 2;
      this.dummy.position.set(Math.cos(a) * RING_RADIUS, 0.02, Math.sin(a) * RING_RADIUS);
      this.dummy.rotation.set(0, -a + Math.PI / 2, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      ring.setMatrixAt(i, this.dummy.matrix);
      ring.setColorAt(i, this.tmpColor.setRGB(0.1, 0.1, 0.1));
    }

    const label = makeLabel(t.name, LOOKS[this.look].label);
    group.add(plinth, body, proxy, ring, label);
    this.scene.add(group);
    const o: TrackObject = {
      id: t.id, type: t.type, role: ROLE[t.type], group, plinth, body, edges, proxy, ring, label,
      color: new THREE.Color(t.color), energy: 0, noteTarget: 0, noteY: 0, spin: 0, audible: true, steps: [], name: t.name,
    };
    this.objects.set(t.id, o);
    this.styleObject(o);
    return o;
  }

  /** Material, Sockel und Beschriftung an die aktuelle Szene anpassen */
  private styleObject(o: TrackObject) {
    const L = LOOKS[this.look];
    const mat = o.body.material as THREE.MeshStandardMaterial;
    mat.visible = L.solid;
    mat.color.copy(o.color).multiplyScalar(L.bodyMul);
    (o.edges.material as THREE.LineBasicMaterial).opacity = L.edgeOpacity;
    o.plinth.material = this.plinthMats[this.look];
    o.plinth.visible = L.solid;
    o.group.remove(o.label);
    o.label.material.map?.dispose();
    o.label.material.dispose();
    o.label = makeLabel(o.name, L.label);
    o.group.add(o.label);
  }

  private removeObject(id: string) {
    const o = this.objects.get(id);
    if (!o) return;
    this.scene.remove(o.group);
    o.group.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m === o.plinth) return; // Sockel-Material ist geteilt
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    o.plinth.geometry.dispose();
    this.objects.delete(id);
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    this.selectRing.visible = !!(id && this.objects.get(id));
  }

  trigger(id: string, vel: number, note: number) {
    const o = this.objects.get(id);
    if (!o) return;
    o.energy = Math.min(1.3, Math.max(o.energy, vel));
    o.noteTarget = note;
    if (o.role === 'kick') this.pulse = Math.max(this.pulse, vel);
    else if (o.role === 'mass') this.weight = Math.max(this.weight, vel);
    else if (o.role === 'detail') this.sparkle = Math.max(this.sparkle, vel * 0.6);
  }

  setPlayStep(step: number) {
    this.playStep = step;
  }

  /** Visuelle Reaktionen zurücksetzen (z.B. vor dem Video-Export) */
  resetEnergy() {
    this.pulse = this.weight = this.sparkle = 0;
    for (const o of this.objects.values()) o.energy = 0;
    this.specLevels.fill(0);
    this.lineLevels.fill(0);
  }

  /** eigenen Render-Loop anhalten (Video-Export rendert Frame für Frame) */
  pauseLoop(v: boolean) {
    this.loopRunning = !v;
    if (!v) this.resize();
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
      if (!this.controls.enabled && !this.dragging) return;
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

  /* ---------------- Frame ---------------- */

  /** einen Frame berechnen und rendern (dt, t in Sekunden) */
  step(dt: number, t: number) {
    const L = LOOKS[this.look];

    // Rollen-Pulse abklingen lassen
    this.pulse *= Math.exp(-dt * 7);
    this.weight *= Math.exp(-dt * 2.5);
    this.sparkle *= Math.exp(-dt * 12);

    // Spektrum
    const fft = this.analyser?.();
    this.updateSpectrum(fft, dt);

    if (this.look === 'halle') this.stepHalle(dt, t);
    else if (this.look === 'linien') this.stepLinien();
    else this.stepStudio();

    // Objekte
    for (const o of this.objects.values()) {
      o.energy *= Math.exp(-dt * DECAY[o.role]);
      o.noteY += (o.noteTarget / 24 - o.noteY) * Math.min(1, dt * 10);
      const e = o.energy;
      const b = o.body;
      b.position.y = BODY_Y + o.noteY * 1.2;
      switch (o.role) {
        case 'kick':
          b.scale.setScalar(1 + e * 0.22);
          o.spin += dt * (0.15 + e * 0.8);
          break;
        case 'detail':
          // nur feines Zittern, kein Pumpen
          b.scale.setScalar(1);
          b.position.y += Math.sin(t * 40) * e * 0.03;
          o.spin += dt * (0.2 + e * 2.5);
          break;
        case 'mass':
          // Gewicht: staucht sich in den Boden, kommt träge zurück
          b.scale.set(1 + e * 0.16, 1 - e * 0.22, 1 + e * 0.16);
          b.position.y -= e * 0.3;
          o.spin += dt * 0.1;
          break;
        case 'breath':
          b.scale.setScalar(1 + e * 0.1 + Math.sin(t * 0.8) * 0.02);
          o.spin += dt * 0.06;
          break;
        default:
          b.scale.setScalar(1 + e * 0.28);
          o.spin += dt * (0.2 + e * 2);
      }
      b.rotation.y = o.spin;
      b.rotation.x = o.type === 'acid' || o.type === 'fm' || o.type === 'fx' ? o.spin * 0.6 : 0;
      const mat = b.material as THREE.MeshStandardMaterial;
      const dim = o.audible ? 1 : 0.3;
      mat.color.copy(o.color).multiplyScalar(L.bodyMul * dim);
      mat.emissiveIntensity = (this.look === 'studio' ? 0.12 : o.role === 'detail' || o.role === 'breath' ? 0.07 : 0.22) * e * dim;
      (o.edges.material as THREE.LineBasicMaterial).opacity = L.edgeOpacity ? (0.35 + e * 0.65) * dim : 0;

      // Step-Markierungen auf dem Boden
      for (let i = 0; i < STEPS; i++) {
        const st = o.steps[i];
        if (i === this.playStep && st?.on) this.tmpColor.copy(this.accent);
        else if (i === this.playStep) this.tmpColor.setScalar(this.look === 'studio' ? 0.3 : 0.55);
        else if (st?.on) this.tmpColor.setScalar((this.look === 'studio' ? 0.25 : 0.25 + st.vel * 0.45) * dim);
        else this.tmpColor.setScalar(L.ringOff);
        o.ring.setColorAt(i, this.tmpColor);
      }
      if (o.ring.instanceColor) o.ring.instanceColor.needsUpdate = true;
    }

    const sel = this.selectedId ? this.objects.get(this.selectedId) : undefined;
    if (sel) {
      this.selectRing.position.x = sel.group.position.x;
      this.selectRing.position.z = sel.group.position.z;
    }

    if (this.auto) this.autoCamera(dt, t);
    else this.controls.update();
    // Kick bewegt die ganze Szene: kurzer Zoom-Punch
    this.camera.fov = BASE_FOV - this.pulse * 1.1 - this.weight * 0.3;
    this.camera.updateProjectionMatrix();
    this.composer.render();
  }

  private updateSpectrum(fft: Float32Array | null | undefined, dt: number) {
    const k = Math.min(1, dt * 16);
    const sample = (norm: number) => {
      if (!fft) return 0;
      const usable = Math.floor(fft.length * 0.7);
      const idx = Math.min(usable - 1, Math.floor(Math.pow(norm, 1.8) * usable));
      return Math.max(0, (fft[idx] + 90) / 80);
    };
    for (let i = 0; i < WALL_BARS; i++) {
      const m = Math.abs(i - (WALL_BARS - 1) / 2) / (WALL_BARS / 2);
      this.specLevels[i] += (sample(m) - this.specLevels[i]) * k;
    }
    for (let i = 0; i < LINE_POINTS; i++) {
      const m = Math.abs(i - (LINE_POINTS - 1) / 2) / (LINE_POINTS / 2);
      this.lineLevels[i] += (sample(m) - this.lineLevels[i]) * k;
    }
  }

  private stepHalle(dt: number, t: number) {
    const up = new THREE.Vector3(0, 1, 0);
    for (const s of this.spots) {
      // langsames Schwenken, Kick schlägt aufs Licht
      const tx = s.base.x + Math.sin(t * 0.23 + s.phase) * 3.5;
      const tz = s.base.z + Math.cos(t * 0.17 + s.phase) * 2.5;
      s.light.target.position.set(tx, 0, tz);
      const kick = s.accent ? this.pulse : this.pulse * 0.6;
      s.light.intensity = (s.accent ? 40 : 70) + kick * (s.accent ? 220 : 150);
      const from = s.light.position;
      const len = from.distanceTo(s.light.target.position);
      const dir = this.tmpV.copy(from).sub(s.light.target.position).normalize();
      s.cone.position.copy(s.light.target.position).addScaledVector(dir, len / 2);
      s.cone.quaternion.setFromUnitVectors(up, dir);
      const r = Math.tan(s.light.angle) * len;
      s.cone.scale.set(r, len, r);
      (s.cone.material as THREE.ShaderMaterial).uniforms.intensity.value = (s.accent ? 0.03 : 0.04) + kick * (s.accent ? 0.16 : 0.12);
    }
    // Dunst driftet, Hats lassen ihn kaum merklich funkeln
    this.haze.rotation.y += dt * 0.01;
    (this.haze.material as THREE.PointsMaterial).opacity = 0.04 + this.pulse * 0.025 + this.sparkle * 0.01;
    for (let i = 0; i < WALL_BARS; i++) {
      const lv = this.specLevels[i];
      this.dummy.position.set((i - (WALL_BARS - 1) / 2) * 0.62, 3.2, -26.85);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 0.06 + lv * lv * 5, 1);
      this.dummy.updateMatrix();
      this.wallBars.setMatrixAt(i, this.dummy.matrix);
      this.wallBars.setColorAt(i, this.tmpColor.copy(this.accent).multiplyScalar(0.08 + lv * 0.9));
    }
    this.wallBars.instanceMatrix.needsUpdate = true;
    if (this.wallBars.instanceColor) this.wallBars.instanceColor.needsUpdate = true;
  }

  private stepLinien() {
    (this.lineGrid.material as THREE.LineBasicMaterial).opacity = 0.55 + this.pulse * 0.45;
    const pos = this.lineSpec.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < LINE_POINTS; i++) {
      const lv = this.lineLevels[i];
      pos.setXYZ(i, (i / (LINE_POINTS - 1) - 0.5) * 44, 0.3 + lv * lv * 6, -22);
    }
    pos.needsUpdate = true;
  }

  private stepStudio() {
    this.studioKey.intensity = 2.2 + this.pulse * 0.5;
  }
}
