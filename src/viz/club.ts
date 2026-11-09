import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { InstrumentType, Track } from '../types';

/*
 * Club-Raum: realistischer, aber flüssiger 3D-Club.
 * Alles prozedural (keine externen Assets): Beton, Ziegel, Truss, Moving Heads mit
 * volumetrischen Lichtkegeln, Spiegelkugel, Laser, Strobo, LED-Wand, PA, DJ-Pult, Crowd.
 * Jede Spur steuert Lichter: Kick → Crowd/Subwoofer/Boden, Snare/Clap → Strobo,
 * Hats → Moving-Head-Flackern, Bass/Acid → Laser, Stab/FM → LED-Wand, Pad → Farbflächen.
 */

/* ------------------------------------------------------------------ */
/*  Raummaße                                                           */
/* ------------------------------------------------------------------ */

const ROOM_W = 24; // x: -12..12
const ROOM_D = 32; // z: -14..18
const ROOM_H = 7.4;
const Z_BACK = -14;
const Z_FRONT = 18;
const STAGE_Z = -10.5;
const STAGE_H = 0.8;
const TRUSS_Y = 6.3;
const LEVELS = 32;

export type ClubView = 'floor' | 'dj' | 'wide';

const VIEWS: Record<ClubView, { pos: [number, number, number]; target: [number, number, number] }> = {
  floor: { pos: [1.4, 1.9, 9.6], target: [0, 2.6, -10] },
  dj: { pos: [-1.9, 2.75, -12.2], target: [0.6, 1.3, 4] },
  wide: { pos: [-3.6, 5.3, 16.6], target: [0, 1.6, -7] },
};

interface ClubCallbacks {
  getBpm: () => number;
  isPlaying: () => boolean;
}

interface TrackLight {
  type: InstrumentType;
  color: THREE.Color;
  energy: number;
  audible: boolean;
}

interface MovingHead {
  pan: THREE.Group;
  tilt: THREE.Group;
  light: THREE.SpotLight | null;
  beam: THREE.Mesh;
  beamMat: THREE.ShaderMaterial;
  lens: THREE.MeshBasicMaterial;
  color: THREE.Color;
  level: number;
}

interface Person {
  x: number;
  z: number;
  rot: number;
  scale: number;
  phase: number;
  amp: number;
  up: boolean;
}

/* ------------------------------------------------------------------ */
/*  Prozedurale Texturen                                               */
/* ------------------------------------------------------------------ */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Fleckiges Rauschen (Beton, Staub, Gebrauchsspuren). */
function grime(g: CanvasRenderingContext2D, w: number, h: number, base: number, spread: number, blotches: number) {
  g.fillStyle = `rgb(${base},${base},${base})`;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < blotches; i++) {
    const r = 10 + Math.random() * w * 0.12;
    const x = Math.random() * w;
    const y = Math.random() * h;
    const v = base + (Math.random() - 0.5) * spread * 2;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.18)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function concreteTextures() {
  const map = canvasTex(512, 512, (g) => {
    grime(g, 512, 512, 52, 26, 140);
    // Dehnungsfugen
    g.strokeStyle = 'rgba(10,10,12,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 1); g.lineTo(512, 1);
    g.moveTo(1, 0); g.lineTo(1, 512);
    g.stroke();
  });
  const rough = canvasTex(512, 512, (g) => grime(g, 512, 512, 95, 70, 220), false);
  return { map, rough };
}

function brickTextures() {
  const W = 1024;
  const H = 512;
  const rows = 16;
  const cols = 8;
  const bh = H / rows;
  const bw = W / cols;
  const drawBricks = (g: CanvasRenderingContext2D, bump: boolean) => {
    g.fillStyle = bump ? '#202020' : '#141210';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let c = -1; c < cols + 1; c++) {
        const x = c * bw + off + 3;
        const y = r * bh + 3;
        if (bump) {
          const v = 150 + Math.random() * 60;
          g.fillStyle = `rgb(${v},${v},${v})`;
        } else {
          // schwarz gestrichener Ziegel mit durchscheinendem Rot
          const v = 26 + Math.random() * 16;
          g.fillStyle = `rgb(${v + 8},${v},${v - 4})`;
        }
        g.fillRect(x, y, bw - 6, bh - 6);
      }
    }
    const img = g.getImageData(0, 0, W, H);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * (bump ? 50 : 14);
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  };
  const map = canvasTex(W, H, (g) => drawBricks(g, false));
  const bump = canvasTex(W, H, (g) => drawBricks(g, true), false);
  return { map, bump };
}

function textTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const t = canvasTex(w, h, draw);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Punktmuster der Spiegelkugel (als Spotlight-Projektion). */
function mirrorDotsTexture() {
  return textTex(512, 512, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 520; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 1.5 + Math.random() * 3.5;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

/** Weicher Lichtfleck (Wand-Uplights, Fake-Bounce). */
function glowTexture() {
  return textTex(128, 256, (g) => {
    const grad = g.createRadialGradient(64, 256, 4, 64, 256, 250);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
  });
}

/* ------------------------------------------------------------------ */
/*  Shader                                                             */
/* ------------------------------------------------------------------ */

const NOISE_GLSL = /* glsl */ `
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

/** Volumetrischer Lichtkegel im Dunst (additiv, weiche Ränder, Abfall mit Distanz). */
function beamMaterial(len: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
      uLen: { value: len },
    },
    vertexShader: /* glsl */ `
      uniform float uLen;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vWorld;
      void main() {
        vAlong = position.z / uLen;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vWorld;
      ${NOISE_GLSL}
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.8);
        float a = clamp(vAlong, 0.0, 1.0);
        float fall = pow(1.0 - a, 1.6) * smoothstep(0.0, 0.04, a);
        float haze = 0.45 + 0.75 * noise3(vWorld * 0.7 + vec3(uTime * 0.12, uTime * 0.05, 0.0));
        // unter dem Boden nichts zeichnen
        float above = smoothstep(-0.05, 0.25, vWorld.y);
        gl_FragColor = vec4(uColor * uIntensity * edge * fall * haze * above * 0.55, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** LED-Wand: echtes Pixelraster, Spektrum, Kick-Ringe, Blitz. */
function ledWallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLevels: { value: new Float32Array(LEVELS) },
      uTime: { value: 0 },
      uBeat: { value: 0 },
      uKick: { value: 0 },
      uFlash: { value: 0 },
      uColA: { value: new THREE.Color(0xff2e9a) },
      uColB: { value: new THREE.Color(0x00e5ff) },
      uMode: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uLevels[${LEVELS}];
      uniform float uTime;
      uniform float uBeat;
      uniform float uKick;
      uniform float uFlash;
      uniform vec3 uColA;
      uniform vec3 uColB;
      uniform float uMode;
      varying vec2 vUv;
      void main() {
        vec2 grid = vec2(160.0, 64.0);
        vec2 cell = floor(vUv * grid);
        vec2 f = fract(vUv * grid) - 0.5;
        float led = smoothstep(0.5, 0.28, length(f));
        vec2 uv = (cell + 0.5) / grid;

        // Spektrum aus der Mitte gespiegelt
        float x = abs(uv.x - 0.5) * 2.0;
        float fi = x * float(${LEVELS - 1});
        int idx = int(fi);
        float lv = uLevels[idx];
        float barGap = step(0.18, fract(fi));
        float h = lv * 0.85;
        float bar = step(abs(uv.y - 0.5) * 2.0, h) * barGap;
        vec3 col = mix(uColA, uColB, abs(uv.y - 0.5) * 2.0 + x * 0.3) * bar * 1.4;

        // Kick-Ringe
        vec2 p = (uv - 0.5) * vec2(2.5, 1.0);
        float d = length(p);
        float ph = fract(uBeat);
        float ring = smoothstep(0.035, 0.0, abs(d - ph * 1.6)) * (1.0 - ph);
        col += uColB * ring * (0.4 + uKick * 2.0);

        // Wandernde Diagonalen im zweiten Modus
        if (uMode > 0.5) {
          float s = step(0.82, fract((uv.x * 2.5 + uv.y) * 3.0 - uBeat * 0.5));
          col += uColA * s * 0.7;
        }
        col += vec3(1.0, 0.95, 0.9) * uFlash * 1.8;
        col *= led;
        col += vec3(0.012) * led; // schwarze LEDs glänzen leicht
        gl_FragColor = vec4(col * 1.8, 1.0);
      }`,
  });
}

/* ------------------------------------------------------------------ */
/*  Geometrie-Helfer                                                   */
/* ------------------------------------------------------------------ */

const UP = new THREE.Vector3(0, 1, 0);

/** Zylinder zwischen zwei Punkten (für Truss, Ketten, Rohre). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

/** Vierpunkt-Traverse entlang X. */
function trussGeometry(x0: number, x1: number, y: number, z: number): THREE.BufferGeometry {
  const s = 0.15;
  const parts: THREE.BufferGeometry[] = [];
  const corners: [number, number][] = [[-s, -s], [s, -s], [s, s], [-s, s]];
  for (const [cy, cz] of corners) {
    parts.push(rod(new THREE.Vector3(x0, y + cy, z + cz), new THREE.Vector3(x1, y + cy, z + cz), 0.024, 8));
  }
  const step = 0.5;
  let flip = false;
  for (let x = x0; x < x1 - 0.01; x += step) {
    const xa = x;
    const xb = Math.min(x1, x + step);
    for (let i = 0; i < 4; i++) {
      const [ay, az] = corners[i];
      const [by, bz] = corners[(i + 1) % 4];
      const p = flip ? [xa, xb] : [xb, xa];
      parts.push(rod(new THREE.Vector3(p[0], y + ay, z + az), new THREE.Vector3(p[1], y + by, z + bz), 0.011, 5));
    }
    flip = !flip;
  }
  return mergeGeometries(parts)!;
}

function personGeometry(armsUp: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z = 0, rz = 0) => {
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
  };
  add(new THREE.CapsuleGeometry(0.075, 0.68, 3, 8), -0.1, 0.43); // Beine
  add(new THREE.CapsuleGeometry(0.075, 0.68, 3, 8), 0.1, 0.43);
  add(new THREE.CapsuleGeometry(0.19, 0.4, 4, 10), 0, 1.15); // Torso
  add(new THREE.SphereGeometry(0.115, 12, 10), 0, 1.6); // Kopf
  if (armsUp) {
    add(new THREE.CapsuleGeometry(0.042, 0.5, 3, 6), -0.25, 1.62, 0, -0.3);
    add(new THREE.CapsuleGeometry(0.042, 0.5, 3, 6), 0.25, 1.62, 0, 0.3);
  } else {
    add(new THREE.CapsuleGeometry(0.048, 0.55, 3, 6), -0.26, 1.08, 0, 0.12);
    add(new THREE.CapsuleGeometry(0.048, 0.55, 3, 6), 0.26, 1.08, 0, -0.12);
  }
  return mergeGeometries(parts)!;
}

/** Lautsprecher-Membran (Drehkörper mit Sicke und Staubkappe). */
function coneGeometry(r: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(r * 0.12, -r * 0.32),
    new THREE.Vector2(r * 0.2, -r * 0.3),
    new THREE.Vector2(r * 0.55, -r * 0.18),
    new THREE.Vector2(r * 0.86, -r * 0.04),
    new THREE.Vector2(r * 0.93, r * 0.02),
    new THREE.Vector2(r * 1.0, 0),
  ];
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateX(Math.PI / 2); // Öffnung nach +Z
  const cap = new THREE.SphereGeometry(r * 0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.5, 1);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, -r * 0.3);
  return mergeGeometries([g.toNonIndexed(), cap.toNonIndexed()])!;
}

/* ------------------------------------------------------------------ */
/*  Club-Szene                                                         */
/* ------------------------------------------------------------------ */

export class ClubScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private timer = new THREE.Timer();
  private active = false;
  private disposed = false;

  analyser: (() => Float32Array | null) | null = null;

  private tracks = new Map<string, TrackLight>();
  private trackOrder: string[] = [];
  private env = { kick: 0, snare: 0, hat: 0, bass: 0, acid: 0, stab: 0, pad: 0, fx: 0, perc: 0 };
  private levels = new Float32Array(LEVELS);
  private fftBass = 0;

  private beat = 0;
  private bar = 0;
  private lastStep = -1;
  private patternMode = 0;

  private heads: MovingHead[] = [];
  private lasers: THREE.Mesh[] = [];
  private laserMat: THREE.MeshBasicMaterial;
  private strobeLight: THREE.PointLight;
  private strobeMats: THREE.MeshBasicMaterial[] = [];
  private strobeLevel = 0;
  private ledMat: THREE.ShaderMaterial;
  private ledLight: THREE.RectAreaLight;
  private washLights: THREE.PointLight[] = [];
  private uplights: THREE.MeshBasicMaterial[] = [];
  private ledStrips: THREE.MeshBasicMaterial[] = [];
  private mirrorBall: THREE.Mesh;
  private mirrorSpot: THREE.SpotLight;
  private mirrorTex: THREE.Texture;
  private cones: { mesh: THREE.Mesh; amp: number; base: number }[] = [];
  private jogs: THREE.Mesh[] = [];
  private vu: THREE.InstancedMesh;
  private crowdDown: THREE.InstancedMesh;
  private crowdUp: THREE.InstancedMesh;
  private people: Person[] = [];
  private dj: THREE.Group;
  private dust: THREE.Points;
  private beamTimeMats: THREE.ShaderMaterial[] = [];

  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private tmpColor2 = new THREE.Color();

  private camFlight = false;
  private flightT = 0;
  strobeEnabled = false;

  private pixelRatio: number;
  private maxPixelRatio: number;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(private container: HTMLElement, private cb: ClubCallbacks) {
    this.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.pixelRatio = this.maxPixelRatio;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    RectAreaLightUniformsLib.init();

    // Umgebung für glaubwürdige PBR-Reflexionen (stark gedimmt: Club ist dunkel)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;
    pmrem.dispose();

    this.scene.background = new THREE.Color(0x020103);
    this.scene.fog = new THREE.FogExp2(0x040306, 0.03);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 80);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 26;
    this.controls.addEventListener('start', () => (this.camFlight = false));
    this.setView('floor');

    this.scene.add(new THREE.HemisphereLight(0x302840, 0x080608, 0.35));

    this.buildRoom();
    this.buildStage();
    this.buildPA();
    this.buildTruss();
    this.ledMat = ledWallMaterial();
    this.ledLight = new THREE.RectAreaLight(0xffffff, 0, 9, 3.6);
    this.buildLedWall();
    this.laserMat = new THREE.MeshBasicMaterial({
      color: 0x22ff66,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.buildLasers();
    this.strobeLight = new THREE.PointLight(0xf4f0ff, 0, 30, 1.6);
    this.buildStrobes();
    this.mirrorTex = mirrorDotsTexture();
    this.mirrorSpot = new THREE.SpotLight(0xffffff, 0, 26, 1.25, 0.15, 1.2);
    this.mirrorBall = this.buildMirrorBall();
    this.buildWash();
    this.buildBar();
    this.vu = this.buildBooth();
    this.dj = this.buildDJ();
    const crowd = this.buildCrowd();
    this.crowdDown = crowd.down;
    this.crowdUp = crowd.up;
    this.dust = this.buildDust();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.6, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  /* ---------------- Öffentliche API ---------------- */

  setActive(on: boolean) {
    if (this.disposed || on === this.active) return;
    this.active = on;
    this.renderer.setAnimationLoop(on ? () => this.frame() : null);
    if (on) {
      this.timer.reset();
      this.resize();
    }
  }

  setView(v: ClubView) {
    const p = VIEWS[v];
    this.camera.position.set(...p.pos);
    this.controls.target.set(...p.target);
    this.camFlight = false;
  }

  get cameraFlight() {
    return this.camFlight;
  }
  set cameraFlight(v: boolean) {
    this.camFlight = v;
    this.flightT = 0;
  }

  syncTracks(tracks: Track[], audible: (t: Track) => boolean) {
    const seen = new Set<string>();
    this.trackOrder = [];
    for (const t of tracks) {
      seen.add(t.id);
      this.trackOrder.push(t.id);
      const cur = this.tracks.get(t.id);
      if (cur) {
        cur.type = t.type;
        cur.color.set(t.color);
        cur.audible = audible(t);
      } else {
        this.tracks.set(t.id, { type: t.type, color: new THREE.Color(t.color), energy: 0, audible: audible(t) });
      }
    }
    for (const id of [...this.tracks.keys()]) if (!seen.has(id)) this.tracks.delete(id);
    this.assignHeadColors();
  }

  trigger(id: string, vel: number) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.energy = Math.max(t.energy, vel);
    const e = this.env;
    switch (t.type) {
      case 'kick': e.kick = Math.max(e.kick, vel); break;
      case 'snare':
      case 'clap':
        e.snare = Math.max(e.snare, vel);
        if (this.strobeEnabled) this.strobeLevel = Math.max(this.strobeLevel, vel);
        break;
      case 'hat':
      case 'openhat': e.hat = Math.max(e.hat, vel); break;
      case 'perc': e.perc = Math.max(e.perc, vel); break;
      case 'bass': e.bass = Math.max(e.bass, vel); break;
      case 'acid': e.acid = Math.max(e.acid, vel); break;
      case 'stab':
      case 'fm':
        e.stab = Math.max(e.stab, vel);
        this.ledMat.uniforms.uColA.value.copy(t.color);
        break;
      case 'pad': e.pad = Math.max(e.pad, vel); break;
      case 'fx': e.fx = Math.max(e.fx, vel); break;
    }
  }

  setPlayStep(step: number) {
    if (step < 0) {
      this.lastStep = -1;
      return;
    }
    if (step < this.lastStep) {
      this.bar++;
      if (this.bar % 8 === 0) this.patternMode = (this.patternMode + 1) % 4;
    }
    this.lastStep = step;
    // Beat-Uhr auf den Sequencer einrasten (sanft, damit nichts springt)
    const target = this.bar * 4 + step / 4;
    this.beat += (target - this.beat) * 0.5;
  }

  /* ---------------- Aufbau ---------------- */

  private std(params: THREE.MeshStandardMaterialParameters) {
    return new THREE.MeshStandardMaterial(params);
  }

  private buildRoom() {
    const con = concreteTextures();
    // Boden: geschliffener, leicht feuchter Beton
    const floorMap = con.map.clone();
    floorMap.repeat.set(6, 8);
    const floorRough = con.rough.clone();
    floorRough.repeat.set(3, 4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_W, ROOM_D),
      this.std({ map: floorMap, roughnessMap: floorRough, roughness: 0.55, metalness: 0.0, color: 0x9a9aa0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = (Z_BACK + Z_FRONT) / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Wände: schwarz gestrichener Ziegel
    const brick = brickTextures();
    const wallMat = (rx: number, ry: number) => {
      const m = brick.map.clone();
      m.repeat.set(rx, ry);
      const b = brick.bump.clone();
      b.repeat.set(rx, ry);
      return this.std({ map: m, bumpMap: b, bumpScale: 2.5, roughness: 0.92, color: 0xb0a8a8 });
    };
    const side = new THREE.PlaneGeometry(ROOM_D, ROOM_H);
    const left = new THREE.Mesh(side, wallMat(8, 2.4));
    left.rotation.y = Math.PI / 2;
    left.position.set(-ROOM_W / 2, ROOM_H / 2, (Z_BACK + Z_FRONT) / 2);
    const right = left.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.x = ROOM_W / 2;
    const endGeo = new THREE.PlaneGeometry(ROOM_W, ROOM_H);
    const back = new THREE.Mesh(endGeo, wallMat(6, 2.4));
    back.position.set(0, ROOM_H / 2, Z_BACK);
    const front = new THREE.Mesh(endGeo, wallMat(6, 2.4));
    front.rotation.y = Math.PI;
    front.position.set(0, ROOM_H / 2, Z_FRONT);
    for (const w of [left, right, back, front]) {
      w.receiveShadow = true;
      this.scene.add(w);
    }

    // Decke: schwarzer Sichtbeton mit Lüftungsrohren
    const ceilMap = con.map.clone();
    ceilMap.repeat.set(4, 5);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), this.std({ map: ceilMap, color: 0x2a2a30, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM_H, (Z_BACK + Z_FRONT) / 2);
    this.scene.add(ceil);
    const ductMat = this.std({ color: 0x8a8d94, metalness: 0.9, roughness: 0.42 });
    for (const x of [-7.5, 7.5]) {
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, ROOM_D, 24, 1, true), ductMat);
      duct.rotation.x = Math.PI / 2;
      duct.position.set(x, ROOM_H - 0.55, (Z_BACK + Z_FRONT) / 2);
      this.scene.add(duct);
      // Rohrschellen
      for (let z = Z_BACK + 2; z < Z_FRONT; z += 4) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 6, 24), ductMat);
        ring.position.set(x, ROOM_H - 0.55, z);
        this.scene.add(ring);
        const hanger = new THREE.Mesh(rod(new THREE.Vector3(x, ROOM_H - 0.12, z), new THREE.Vector3(x, ROOM_H, z), 0.012), ductMat);
        this.scene.add(hanger);
      }
    }

    // Säulen
    const pillarMap = con.map.clone();
    pillarMap.repeat.set(1, 3);
    const pillarMat = this.std({ map: pillarMap, color: 0x6a6a70, roughness: 0.85 });
    for (const x of [-8.5, 8.5]) {
      for (const z of [-1, 9]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, ROOM_H, 0.7), pillarMat);
        p.position.set(x, ROOM_H / 2, z);
        p.castShadow = true;
        p.receiveShadow = true;
        this.scene.add(p);
      }
    }

    // Notausgang-Schilder und Tür
    const exitTex = textTex(256, 96, (g) => {
      g.fillStyle = '#0a9a3c';
      g.fillRect(0, 0, 256, 96);
      g.fillStyle = '#eafff0';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🏃 NOTAUSGANG', 128, 50);
    });
    const exitMat = new THREE.MeshBasicMaterial({ map: exitTex, color: new THREE.Color(1.6, 1.6, 1.6) });
    const doorMat = this.std({ color: 0x1b1d20, metalness: 0.6, roughness: 0.5 });
    for (const [x, ry] of [[-ROOM_W / 2 + 0.02, Math.PI / 2], [ROOM_W / 2 - 0.02, -Math.PI / 2]] as const) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), doorMat);
      door.position.set(x, 1.2, 12);
      door.rotation.y = ry;
      this.scene.add(door);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), exitMat);
      sign.position.set(x + (ry > 0 ? 0.01 : -0.01), 2.75, 12);
      sign.rotation.y = ry;
      this.scene.add(sign);
    }
  }

  private buildStage() {
    const deck = this.std({ color: 0x141416, roughness: 0.75, metalness: 0.1 });
    const stage = new THREE.Mesh(new THREE.BoxGeometry(11, STAGE_H, 6), deck);
    stage.position.set(0, STAGE_H / 2, STAGE_Z - 0.5);
    stage.receiveShadow = true;
    stage.castShadow = true;
    this.scene.add(stage);
    // Bühnenkante: LED-Streifen
    const strip = new THREE.MeshBasicMaterial({ color: 0xff2e9a });
    this.ledStrips.push(strip);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(11, 0.04, 0.02), strip);
    edge.position.set(0, STAGE_H - 0.06, STAGE_Z + 2.51);
    this.scene.add(edge);
    // Absperrgitter vor der Bühne
    const steel = this.std({ color: 0x9aa0a8, metalness: 0.95, roughness: 0.35 });
    const parts: THREE.BufferGeometry[] = [];
    const zf = STAGE_Z + 3.6;
    for (let x = -5; x <= 5.01; x += 1.25) {
      parts.push(rod(new THREE.Vector3(x, 0, zf), new THREE.Vector3(x, 1.1, zf), 0.025));
    }
    parts.push(rod(new THREE.Vector3(-5, 1.1, zf), new THREE.Vector3(5, 1.1, zf), 0.03));
    parts.push(rod(new THREE.Vector3(-5, 0.15, zf), new THREE.Vector3(5, 0.15, zf), 0.025));
    for (let x = -5; x < 5; x += 0.125) {
      parts.push(rod(new THREE.Vector3(x, 0.15, zf), new THREE.Vector3(x, 1.1, zf), 0.008, 4));
    }
    const barrier = new THREE.Mesh(mergeGeometries(parts)!, steel);
    barrier.castShadow = true;
    this.scene.add(barrier);
  }

  private speaker(w: number, hgt: number, d: number, drivers: { x: number; y: number; r: number; sub: boolean }[], horn?: { y: number; w: number; h: number }) {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new RoundedBoxGeometry(w, hgt, d, 2, 0.03), this.std({ color: 0x111113, roughness: 0.88 }));
    cab.castShadow = true;
    cab.receiveShadow = true;
    g.add(cab);
    const rubber = this.std({ color: 0x1e1e20, roughness: 0.65 });
    const metal = this.std({ color: 0x2a2b2e, roughness: 0.4, metalness: 0.8 });
    for (const dr of drivers) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(dr.r * 1.02, dr.r * 0.06, 8, 40), metal);
      ring.position.set(dr.x, dr.y, d / 2 + 0.005);
      g.add(ring);
      const cone = new THREE.Mesh(coneGeometry(dr.r), rubber);
      cone.position.set(dr.x, dr.y, d / 2);
      g.add(cone);
      this.cones.push({ mesh: cone, amp: dr.sub ? dr.r * 0.09 : dr.r * 0.03, base: d / 2 });
    }
    if (horn) {
      const hornMesh = new THREE.Mesh(new THREE.BoxGeometry(horn.w, horn.h, 0.02), this.std({ color: 0x050506, roughness: 0.5 }));
      hornMesh.position.set(0, horn.y, d / 2 + 0.001);
      g.add(hornMesh);
    }
    // Gitter-Andeutung: dunkles Lochblech am Rand
    return g;
  }

  private buildPA() {
    for (const side of [-1, 1]) {
      const x = side * 7.4;
      const z = STAGE_Z + 1.2;
      for (let i = 0; i < 2; i++) {
        const sub = this.speaker(1.3, 0.85, 0.95, [{ x: 0, y: 0, r: 0.34, sub: true }]);
        sub.position.set(x, 0.425 + i * 0.86, z);
        sub.rotation.y = -side * 0.12;
        this.scene.add(sub);
      }
      const top = this.speaker(0.9, 1.3, 0.75, [
        { x: 0, y: -0.33, r: 0.24, sub: false },
        { x: 0, y: 0.08, r: 0.24, sub: false },
      ], { y: 0.44, w: 0.62, h: 0.2 });
      top.position.set(x, 1.72 + 0.65, z);
      top.rotation.y = -side * 0.18;
      this.scene.add(top);
    }
    // Monitorboxen (Wedges) für den DJ
    for (const side of [-1, 1]) {
      const wedge = this.speaker(0.6, 0.45, 0.5, [{ x: 0, y: 0, r: 0.15, sub: false }]);
      wedge.position.set(side * 2.9, STAGE_H + 0.3, STAGE_Z - 0.2);
      wedge.rotation.set(-0.5, Math.PI + side * 0.6, 0, 'YXZ');
      this.scene.add(wedge);
    }
  }

  private buildTruss() {
    const steel = this.std({ color: 0xb8bcc4, metalness: 1, roughness: 0.32 });
    const front = new THREE.Mesh(trussGeometry(-10, 10, TRUSS_Y, -6.5), steel);
    const mid = new THREE.Mesh(trussGeometry(-10, 10, TRUSS_Y, 4), steel);
    const back = new THREE.Mesh(trussGeometry(-6, 6, TRUSS_Y + 0.25, STAGE_Z - 2.5), steel);
    this.scene.add(front, mid, back);
    // Kettenzüge zur Decke
    const chainMat = this.std({ color: 0x555860, metalness: 0.9, roughness: 0.5 });
    const parts: THREE.BufferGeometry[] = [];
    for (const z of [-6.5, 4]) {
      for (const x of [-8, 0, 8]) parts.push(rod(new THREE.Vector3(x, TRUSS_Y + 0.15, z), new THREE.Vector3(x, ROOM_H, z), 0.018));
    }
    for (const x of [-5, 5]) parts.push(rod(new THREE.Vector3(x, TRUSS_Y + 0.4, STAGE_Z - 2.5), new THREE.Vector3(x, ROOM_H, STAGE_Z - 2.5), 0.018));
    this.scene.add(new THREE.Mesh(mergeGeometries(parts)!, chainMat));

    // Moving Heads (hängend)
    const xs = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
    xs.forEach((x, i) => this.heads.push(this.movingHead(x, TRUSS_Y - 0.2, -6.5, true, i === 2 || i === 3)));
    // hintere Reihe: nur sichtbare Lichtkegel (keine echten Lichter → spart GPU)
    for (const x of [-6, -2, 2, 6]) this.heads.push(this.movingHead(x, TRUSS_Y - 0.2, 4, false, false));
  }

  private movingHead(x: number, y: number, z: number, real: boolean, shadow: boolean): MovingHead {
    const body = this.std({ color: 0x18181b, roughness: 0.45, metalness: 0.3 });
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.16, 0.32, 2, 0.03), body);
    root.add(base);
    const pan = new THREE.Group();
    pan.position.y = -0.1;
    root.add(pan);
    for (const sx of [-0.18, 0.18]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.14), body);
      arm.position.set(sx, -0.16, 0);
      pan.add(arm);
    }
    const tilt = new THREE.Group();
    tilt.position.y = -0.3;
    pan.add(tilt);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.36, 20), body);
    head.rotation.x = Math.PI / 2;
    tilt.add(head);
    const lens = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), lens);
    lensMesh.position.z = 0.181;
    tilt.add(lensMesh);

    const len = 16;
    const angle = 0.11;
    const beamGeo = new THREE.CylinderGeometry(0.09, 0.09 + Math.tan(angle) * len, len, 28, 1, true);
    beamGeo.translate(0, -len / 2, 0);
    beamGeo.rotateX(-Math.PI / 2); // entlang +Z
    const beamMat = beamMaterial(len);
    this.beamTimeMats.push(beamMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.z = 0.18;
    beam.frustumCulled = false;
    tilt.add(beam);

    let light: THREE.SpotLight | null = null;
    if (real) {
      light = new THREE.SpotLight(0xffffff, 0, 30, angle * 1.15, 0.35, 1.5);
      light.position.z = 0.2;
      const target = new THREE.Object3D();
      target.position.z = 10;
      tilt.add(light, target);
      light.target = target;
    }
    if (light && shadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0004;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 30;
    }
    this.scene.add(root);
    return { pan, tilt, light, beam, beamMat, lens, color: new THREE.Color(1, 1, 1), level: 0 };
  }

  private buildLedWall() {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9.3, 3.9, 0.2), this.std({ color: 0x0b0b0d, roughness: 0.6, metalness: 0.4 }));
    frame.position.set(0, STAGE_H + 2.35, Z_BACK + 0.25);
    this.scene.add(frame);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.6), this.ledMat);
    wall.position.set(0, STAGE_H + 2.35, Z_BACK + 0.36);
    this.scene.add(wall);
    // Licht der LED-Wand, das auf DJ, Bühne und Publikum fällt
    this.ledLight.position.set(0, STAGE_H + 2.35, Z_BACK + 0.4);
    this.ledLight.lookAt(0, STAGE_H + 1.5, 10);
    this.scene.add(this.ledLight);
  }

  private buildLasers() {
    const emitter = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.22, 0.4, 2, 0.03), this.std({ color: 0x1a1a1d, roughness: 0.5, metalness: 0.5 }));
    emitter.position.set(0, TRUSS_Y + 0.05, STAGE_Z - 2.5);
    this.scene.add(emitter);
    const geo = new THREE.CylinderGeometry(0.008, 0.02, 34, 5, 1, true);
    geo.translate(0, 17, 0);
    geo.rotateX(Math.PI / 2); // entlang +Z
    for (let i = 0; i < 14; i++) {
      const l = new THREE.Mesh(geo, this.laserMat);
      l.position.copy(emitter.position);
      l.position.y -= 0.12;
      l.frustumCulled = false;
      this.lasers.push(l);
      this.scene.add(l);
    }
  }

  private buildStrobes() {
    for (const x of [-9, -3, 3, 9]) {
      const housing = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.22, 0.2, 2, 0.02), this.std({ color: 0x141416, roughness: 0.5 }));
      housing.position.set(x, TRUSS_Y - 0.25, -6.25);
      housing.rotation.x = 0.5;
      this.scene.add(housing);
      const mat = new THREE.MeshBasicMaterial({ color: 0x202024 });
      this.strobeMats.push(mat);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.14), mat);
      face.position.set(0, 0, 0.101);
      housing.add(face);
    }
    this.strobeLight.position.set(0, TRUSS_Y - 0.5, -5.5);
    this.scene.add(this.strobeLight);
  }

  private buildMirrorBall() {
    const ball = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 4),
      this.std({ color: 0xdadde4, metalness: 1, roughness: 0.12, flatShading: true, envMapIntensity: 2 }),
    );
    const pos = new THREE.Vector3(0, ROOM_H - 1.25, 1.5);
    ball.position.copy(pos);
    this.scene.add(ball);
    this.scene.add(new THREE.Mesh(rod(pos, new THREE.Vector3(pos.x, ROOM_H, pos.z), 0.01), this.std({ color: 0x777777, metalness: 1 })));
    // Projektion der Spiegelpunkte in den Raum
    this.mirrorSpot.position.copy(pos);
    this.mirrorSpot.map = this.mirrorTex;
    this.mirrorSpot.castShadow = true; // nötig für Spotlight-Projektionen
    this.mirrorSpot.shadow.mapSize.set(512, 512);
    this.mirrorSpot.shadow.bias = -0.001;
    this.mirrorSpot.target.position.set(0, 0, 2.5);
    this.scene.add(this.mirrorSpot, this.mirrorSpot.target);
    return ball;
  }

  private buildWash() {
    // Farbige Flächenlichter hinter dem DJ und im Raum (ohne Schatten = günstig)
    const spots: [number, number, number][] = [[-4, 2.2, STAGE_Z - 1.5], [4, 2.2, STAGE_Z - 1.5], [0, 4.5, 7]];
    for (const p of spots) {
      const l = new THREE.PointLight(0xff2e9a, 0, 16, 1.6);
      l.position.set(...p);
      this.washLights.push(l);
      this.scene.add(l);
    }
    // Uplights an den Seitenwänden (Fake-Lichtschein)
    const tex = glowTexture();
    for (const x of [-ROOM_W / 2 + 0.03, ROOM_W / 2 - 0.03]) {
      for (const z of [-10, -4, 2, 8, 14]) {
        const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xff2e9a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 });
        this.uplights.push(mat);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 4.2), mat);
        m.position.set(x, 2.1, z);
        m.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(m);
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 14), this.std({ color: 0x111, roughness: 0.5 }));
        can.position.set(x + (x < 0 ? 0.16 : -0.16), 0.11, z);
        this.scene.add(can);
      }
    }
  }

  private buildBar() {
    // Bar an der Rückwand
    const z = Z_FRONT - 1.4;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 0.8), this.std({ color: 0x18120e, roughness: 0.7 }));
    counter.position.set(4, 0.55, z);
    counter.castShadow = true;
    this.scene.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.06, 0.95), this.std({ color: 0x2b2b30, roughness: 0.18, metalness: 0.6 }));
    top.position.set(4, 1.13, z);
    this.scene.add(top);
    const strip = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    this.ledStrips.push(strip);
    const under = new THREE.Mesh(new THREE.BoxGeometry(8, 0.025, 0.02), strip);
    under.position.set(4, 1.08, z - 0.49);
    this.scene.add(under);
    // Regal mit Flaschen, hinterleuchtet
    const shelfGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.55, 0.22).multiplyScalar(0.9) });
    for (const y of [1.6, 2.2]) {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.5), shelfGlow);
      glow.position.set(4, y + 0.25, Z_FRONT - 0.03);
      glow.rotation.y = Math.PI;
      this.scene.add(glow);
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(7, 0.03, 0.3), this.std({ color: 0x222, roughness: 0.4 }));
      shelf.position.set(4, y, Z_FRONT - 0.18);
      this.scene.add(shelf);
    }
    const bottleGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.04, 0.04, 0.22, 10).translate(0, 0.11, 0),
      new THREE.CylinderGeometry(0.014, 0.035, 0.1, 8).translate(0, 0.27, 0),
    ])!;
    const bottles = new THREE.InstancedMesh(bottleGeo, this.std({ roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 }), 60);
    const hues = [0.08, 0.3, 0.55, 0.02, 0.12];
    for (let i = 0; i < 60; i++) {
      this.dummy.position.set(4 - 3.3 + (i % 30) * 0.225, i < 30 ? 1.615 : 2.215, Z_FRONT - 0.18);
      this.dummy.scale.setScalar(0.85 + Math.random() * 0.35);
      this.dummy.updateMatrix();
      bottles.setMatrixAt(i, this.dummy.matrix);
      bottles.setColorAt(i, this.tmpColor.setHSL(hues[i % hues.length], 0.7, 0.25));
    }
    this.scene.add(bottles);
    const barLight = new THREE.PointLight(0xffa040, 6, 6, 2);
    barLight.position.set(4, 2.6, Z_FRONT - 1.2);
    this.scene.add(barLight);
  }

  private buildBooth(): THREE.InstancedMesh {
    const y0 = STAGE_H;
    const z0 = STAGE_Z;
    // Pult-Tisch mit Front-Logo
    const table = new THREE.Mesh(new RoundedBoxGeometry(3.2, 1.0, 0.9, 2, 0.03), this.std({ color: 0x0d0d0f, roughness: 0.55 }));
    table.position.set(0, y0 + 0.5, z0);
    table.castShadow = true;
    table.receiveShadow = true;
    this.scene.add(table);
    const logo = textTex(1024, 128, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 1024, 128);
      g.font = 'bold 84px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.fillText('TECHNO // VIZ', 512, 68);
    });
    const logoMat = new THREE.MeshBasicMaterial({ map: logo, color: 0xff2e9a });
    this.ledStrips.push(logoMat);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.35), logoMat);
    front.position.set(0, y0 + 0.55, z0 + 0.452);
    this.scene.add(front);

    const deckTop = y0 + 1.0;
    const casing = this.std({ color: 0x1a1b1e, roughness: 0.4, metalness: 0.6 });
    const black = this.std({ color: 0x08080a, roughness: 0.3, metalness: 0.2 });
    // Zwei Player (Jogwheel-Decks)
    for (const sx of [-0.95, 0.95]) {
      const player = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.11, 0.62, 2, 0.02), casing);
      player.position.set(sx, deckTop + 0.055, z0 - 0.02);
      player.castShadow = true;
      this.scene.add(player);
      const jog = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 40), this.std({ color: 0x3a3c40, metalness: 0.9, roughness: 0.25 }));
      jog.position.set(sx, deckTop + 0.125, z0 + 0.05);
      this.scene.add(jog);
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      mark.position.set(0, 0.017, 0.08);
      jog.add(mark);
      this.jogs.push(jog);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.006, 6, 48), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(sx, deckTop + 0.115, z0 + 0.05);
      this.scene.add(ring);
      // Display mit Wellenform
      const scr = textTex(256, 128, (g) => {
        g.fillStyle = '#04070c';
        g.fillRect(0, 0, 256, 128);
        g.strokeStyle = '#3ab0ff';
        g.lineWidth = 2;
        g.beginPath();
        for (let x = 0; x < 256; x += 2) {
          const a = (Math.sin(x * 0.21) * 0.5 + Math.sin(x * 0.047) * 0.5) * 28 * (0.4 + Math.random() * 0.6);
          g.moveTo(x, 40 - a);
          g.lineTo(x, 40 + a);
        }
        g.stroke();
        g.fillStyle = '#ff7a2e';
        g.fillRect(126, 4, 3, 72);
        g.fillStyle = '#9fd8ff';
        g.font = '20px monospace';
        g.fillText('128.00  A-04', 10, 112);
      });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshBasicMaterial({ map: scr }));
      screen.rotation.x = -Math.PI / 2 + 0.25;
      screen.position.set(sx, deckTop + 0.13, z0 - 0.22);
      this.scene.add(screen);
      // Pads
      for (let i = 0; i < 4; i++) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.05), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2e9a : 0xb8ff3c }));
        pad.position.set(sx - 0.12 + i * 0.08, deckTop + 0.115, z0 + 0.27);
        this.scene.add(pad);
      }
    }
    // Mixer
    const mixer = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.62, 2, 0.02), casing);
    mixer.position.set(0, deckTop + 0.05, z0 - 0.02);
    this.scene.add(mixer);
    const knobGeo = new THREE.CylinderGeometry(0.016, 0.018, 0.03, 12);
    const knobs = new THREE.InstancedMesh(knobGeo, black, 4 * 5);
    let k = 0;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 5; r++) {
        this.dummy.position.set(-0.165 + c * 0.11, deckTop + 0.115, z0 - 0.27 + r * 0.075);
        this.dummy.scale.setScalar(1);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        knobs.setMatrixAt(k++, this.dummy.matrix);
      }
    }
    this.scene.add(knobs);
    const fader = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.025, 0.04), this.std({ color: 0xcfd2d8, metalness: 0.6, roughness: 0.3 }), 5);
    for (let c = 0; c < 4; c++) {
      this.dummy.position.set(-0.165 + c * 0.11, deckTop + 0.11, z0 + 0.16);
      this.dummy.updateMatrix();
      fader.setMatrixAt(c, this.dummy.matrix);
    }
    this.dummy.position.set(0, deckTop + 0.11, z0 + 0.26);
    this.dummy.scale.set(1.4, 1, 0.8);
    this.dummy.updateMatrix();
    fader.setMatrixAt(4, this.dummy.matrix);
    this.dummy.scale.setScalar(1);
    this.scene.add(fader);
    // VU-Meter: 4 Kanäle × 10 Segmente
    const vu = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.006, 0.01), new THREE.MeshBasicMaterial(), 40);
    for (let c = 0; c < 4; c++) {
      for (let s = 0; s < 10; s++) {
        this.dummy.position.set(-0.11 + c * 0.012 + (c > 1 ? 0.196 : 0), deckTop + 0.103, z0 + 0.06 - s * 0.013);
        this.dummy.updateMatrix();
        vu.setMatrixAt(c * 10 + s, this.dummy.matrix);
        vu.setColorAt(c * 10 + s, this.tmpColor.set(0x101010));
      }
    }
    this.scene.add(vu);
    // Laptop
    const lap = new THREE.Group();
    const lapMat = this.std({ color: 0x6e7278, metalness: 0.5, roughness: 0.55 });
    const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), lapMat);
    lap.add(baseL);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.01), lapMat);
    lid.position.set(0, 0.12, -0.12);
    lid.rotation.x = -0.25;
    lap.add(lid);
    const lscr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ color: 0x1a3550 }));
    lscr.position.set(0, 0.12, -0.113);
    lscr.rotation.x = -0.25;
    lscr.rotation.y = Math.PI;
    lap.add(lscr);
    lap.position.set(1.35, deckTop + 0.01, z0 - 0.3);
    lap.rotation.y = Math.PI - 0.4;
    this.scene.add(lap);
    return vu;
  }

  private buildDJ(): THREE.Group {
    const g = new THREE.Group();
    const mat = this.std({ color: 0x15151a, roughness: 0.85 });
    const body = new THREE.Mesh(personGeometry(false), mat);
    body.castShadow = true;
    g.add(body);
    // Kopfhörer
    const hp = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.015, 6, 20, Math.PI), this.std({ color: 0x050505, roughness: 0.4 }));
    hp.position.y = 1.62;
    g.add(hp);
    g.scale.setScalar(1.04);
    g.position.set(0, STAGE_H, STAGE_Z - 0.75);
    this.scene.add(g);
    return g;
  }

  private buildCrowd() {
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (let z = STAGE_Z + 4.1; z < 12.5; z += 0.62) {
      const density = z < 0 ? 1 : z < 6 ? 0.8 : 0.45; // vorne dichter
      for (let x = -9.6; x < 9.6; x += 0.62) {
        if (Math.random() > density) continue;
        const px = x + rnd(-0.2, 0.2);
        const pz = z + rnd(-0.2, 0.2);
        if (Math.hypot(px - VIEWS.floor.pos[0], pz - VIEWS.floor.pos[2]) < 2.2) continue; // Platz für die Kamera
        if (Math.abs(Math.abs(px) - 8.5) < 0.6 && (Math.abs(pz + 1) < 0.6 || Math.abs(pz - 9) < 0.6)) continue; // Säulen
        this.people.push({
          x: px,
          z: pz,
          rot: Math.PI + rnd(-0.5, 0.5),
          scale: rnd(0.9, 1.1),
          phase: rnd(0, Math.PI * 2),
          amp: rnd(0.4, 1),
          up: Math.random() < 0.12,
        });
      }
    }
    const mat = this.std({ roughness: 0.9, metalness: 0, envMapIntensity: 0.3 });
    const nDown = this.people.filter((p) => !p.up).length;
    const nUp = this.people.length - nDown;
    const down = new THREE.InstancedMesh(personGeometry(false), mat, nDown);
    const up = new THREE.InstancedMesh(personGeometry(true), mat, nUp);
    let a = 0;
    let b = 0;
    for (const p of this.people) {
      const l = 0.015 + Math.random() * 0.05;
      this.tmpColor.setHSL(Math.random(), Math.random() * 0.25, l);
      if (p.up) up.setColorAt(b++, this.tmpColor);
      else down.setColorAt(a++, this.tmpColor);
    }
    for (const m of [down, up]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
    }
    return { down, up };
  }

  private buildDust(): THREE.Points {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * (ROOM_W - 1);
      pos[i * 3 + 1] = Math.random() * ROOM_H;
      pos[i * 3 + 2] = Z_BACK + 1 + Math.random() * (ROOM_D - 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0x8a8090, size: 0.022, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(pts);
    return pts;
  }

  /* ---------------- Steuerung ---------------- */

  private assignHeadColors() {
    // Jeder Moving Head bekommt die Farbe einer Spur; ohne Spuren: warmweiß
    const ids = this.trackOrder.filter((id) => this.tracks.get(id)?.audible);
    this.heads.forEach((h, i) => {
      if (!ids.length) h.color.set(0xfff0e0);
      else h.color.copy(this.tracks.get(ids[i % ids.length])!.color);
    });
  }

  private headEnergy(i: number): number {
    const ids = this.trackOrder.filter((id) => this.tracks.get(id)?.audible);
    if (!ids.length) return 0;
    return this.tracks.get(ids[i % ids.length])!.energy;
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

  get shadows() {
    return this.renderer.shadowMap.enabled;
  }

  setShadows(on: boolean) {
    this.renderer.shadowMap.enabled = on;
    // Materialien neu kompilieren lassen
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
  }

  /** Auflösung passt sich der Bildrate an, damit es flüssig bleibt. */
  private adaptQuality(dt: number) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 2) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    let next = this.pixelRatio;
    if (fps < 30 && this.pixelRatio <= 0.61 && this.renderer.shadowMap.enabled) {
      // letzte Stufe: Schatten aus
      this.setShadows(false);
      return;
    }
    if (fps < 42) next = Math.max(0.6, this.pixelRatio - 0.2);
    else if (fps > 57) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.composer.setPixelRatio(next);
      this.resize();
    }
  }

  /* ---------------- Render-Loop ---------------- */

  private frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const t = this.timer.getElapsed();
    const playing = this.cb.isPlaying();
    const bpm = this.cb.getBpm();
    this.beat += dt * (bpm / 60) * (playing ? 1 : 0.35);
    const beat = this.beat;
    const e = this.env;

    // Spektrum
    const fft = this.analyser?.();
    if (fft) {
      const usable = Math.floor(fft.length * 0.7);
      for (let i = 0; i < LEVELS; i++) {
        const idx = Math.min(usable - 1, Math.floor(Math.pow(i / LEVELS, 1.8) * usable));
        const v = Math.min(1, Math.max(0, (fft[idx] + 90) / 75));
        this.levels[i] += (v - this.levels[i]) * Math.min(1, dt * 16);
      }
      const b = Math.max(0, ((fft[1] + fft[2] + fft[3]) / 3 + 60) / 50);
      this.fftBass += (b - this.fftBass) * Math.min(1, dt * 18);
    } else {
      for (let i = 0; i < LEVELS; i++) this.levels[i] *= 0.9;
      this.fftBass *= 0.9;
    }

    // Hüllkurven abklingen lassen
    const dec = (v: number, rate: number) => v * Math.exp(-dt * rate);
    e.kick = dec(e.kick, 7);
    e.snare = dec(e.snare, 9);
    e.hat = dec(e.hat, 14);
    e.perc = dec(e.perc, 8);
    e.bass = dec(e.bass, 5);
    e.acid = dec(e.acid, 3);
    e.stab = dec(e.stab, 4);
    e.pad = dec(e.pad, 0.8);
    e.fx = dec(e.fx, 1.2);
    this.strobeLevel = dec(this.strobeLevel, 28);
    for (const tr of this.tracks.values()) {
      const r = tr.type === 'pad' ? 1.2 : tr.type === 'openhat' || tr.type === 'stab' || tr.type === 'acid' ? 4 : 8;
      tr.energy = dec(tr.energy, r);
    }
    const kick = Math.max(e.kick, Math.min(1, this.fftBass) * 0.5);
    const groove = playing ? 1 : 0.25;

    // Moving Heads: Bewegungsmuster wechseln alle 8 Takte
    const sweep = beat * 0.25 * Math.PI * 2;
    this.heads.forEach((hd, i) => {
      const rear = i >= 6;
      const n = rear ? i - 6 : i;
      const side = n % 2 ? 1 : -1;
      let pan = 0;
      let tilt = 1.1;
      switch (this.patternMode) {
        case 0: // Fächer
          pan = (n - 2.5) * 0.22 + Math.sin(sweep) * 0.35;
          tilt = 1.0 + Math.sin(sweep * 0.5 + n) * 0.25;
          break;
        case 1: // Kreuzen
          pan = side * Math.sin(sweep) * 0.7;
          tilt = 0.9 + Math.cos(sweep) * 0.3;
          break;
        case 2: // Kreise
          pan = Math.sin(sweep + n * 0.9) * 0.55;
          tilt = 1.05 + Math.cos(sweep + n * 0.9) * 0.35;
          break;
        default: // Ballyhoo: schnell, chaotisch
          pan = Math.sin(sweep * 2 + n * 2.1) * 0.9;
          tilt = 1.0 + Math.sin(sweep * 1.5 + n * 1.3) * 0.45;
      }
      if (rear) tilt = Math.PI - tilt + 0.3; // hintere Truss leuchtet Richtung Bühne/Publikum
      hd.pan.rotation.y = pan;
      hd.tilt.rotation.x = tilt;

      const en = this.headEnergy(i);
      const flicker = e.hat * (0.5 + 0.5 * Math.sin(t * 60 + i));
      const target = (0.18 + en * 1.1 + flicker * 0.4) * groove + (playing ? 0 : 0.12);
      hd.level += (target - hd.level) * Math.min(1, dt * 25);
      const lv = hd.level;
      if (hd.light) {
        hd.light.color.copy(hd.color);
        hd.light.intensity = lv * 650;
      }
      hd.beamMat.uniforms.uColor.value.copy(hd.color);
      hd.beamMat.uniforms.uIntensity.value = lv * 1.4;
      hd.lens.color.copy(hd.color).multiplyScalar(0.5 + lv * 6);
    });
    for (const m of this.beamTimeMats) m.uniforms.uTime.value = t;

    // Laser: Bass + Acid
    const laserLv = Math.min(1, e.bass * 0.6 + e.acid * 0.9);
    this.laserMat.opacity = laserLv * 0.85;
    const acidTrack = this.trackOrder.map((id) => this.tracks.get(id)!).find((tr) => tr && (tr.type === 'acid' || tr.type === 'bass'));
    if (acidTrack) this.laserMat.color.copy(acidTrack.color).lerp(this.tmpColor2.set(0x22ff66), 0.5).multiplyScalar(2.2);
    this.lasers.forEach((l, i) => {
      const spread = (i / (this.lasers.length - 1) - 0.5) * (1.2 + Math.sin(beat * 0.5) * 0.4);
      const tiltL = -0.05 - Math.sin(beat * Math.PI * 0.5 + e.acid * 2) * 0.12;
      l.rotation.set(-tiltL, spread, 0, 'YXZ');
      l.visible = laserLv > 0.02;
    });

    // Strobo
    const sb = this.strobeLevel;
    this.strobeLight.intensity = sb * 900;
    for (const m of this.strobeMats) m.color.setScalar(0.03 + sb * 8);

    // LED-Wand
    const u = this.ledMat.uniforms;
    (u.uLevels.value as Float32Array).set(this.levels);
    u.uTime.value = t;
    u.uBeat.value = beat;
    u.uKick.value = kick;
    u.uFlash.value = e.stab * 0.35 + sb * 0.5;
    u.uMode.value = this.patternMode % 2;
    const colA = u.uColA.value as THREE.Color;
    const colB = u.uColB.value as THREE.Color;
    const padTrack = this.trackOrder.map((id) => this.tracks.get(id)!).find((tr) => tr && tr.type === 'pad');
    if (padTrack) colB.lerp(padTrack.color, dt * 0.5);
    let avgLv = 0;
    for (let i = 0; i < LEVELS; i++) avgLv += this.levels[i];
    avgLv /= LEVELS;
    this.ledLight.color.copy(colA).lerp(colB, 0.5);
    this.ledLight.intensity = 1.2 + avgLv * 8 + e.stab * 5 + sb * 12;

    // Wash-Lichter und Uplights: Pad + Kick
    const washCol = this.tmpColor.copy(padTrack ? padTrack.color : colA);
    this.washLights.forEach((l, i) => {
      l.color.copy(i % 2 ? colB : washCol);
      l.intensity = (i < 2 ? 18 : 4) * (0.35 + e.pad * 0.8 + kick * 0.6) * (0.4 + groove * 0.6);
    });
    this.uplights.forEach((m, i) => {
      m.color.copy(i % 2 ? colB : washCol);
      m.opacity = 0.18 + kick * 0.45 + e.pad * 0.3;
    });
    for (const m of this.ledStrips.slice(0, 1)) m.color.copy(colA).multiplyScalar(0.6 + kick * 3);
    this.ledStrips[2]?.color.copy(colA).multiplyScalar(0.8 + kick * 2.5);

    // Spiegelkugel
    this.mirrorBall.rotation.y += dt * 0.35;
    this.mirrorTex.rotation = t * 0.35;
    this.mirrorTex.center.set(0.5, 0.5);
    this.mirrorSpot.intensity = 90 + e.fx * 300 + e.pad * 120;

    // Lautsprecher-Membranen pumpen mit
    const coneDrive = kick * 0.9 + e.bass * 0.4;
    for (const c of this.cones) c.mesh.position.z = c.base + c.amp * coneDrive * (0.6 + Math.sin(t * 90) * 0.4);

    // Jogwheels drehen sich mit 33⅓ U/min
    if (playing) for (const j of this.jogs) j.rotation.y -= dt * 3.49;

    // VU-Meter
    const ch = [kick, Math.max(e.bass, e.acid), Math.max(e.hat, e.perc), Math.max(e.stab, e.pad, e.snare)];
    for (let c = 0; c < 4; c++) {
      const lit = Math.round(Math.min(1, ch[c]) * 10);
      for (let s = 0; s < 10; s++) {
        if (s < lit) this.tmpColor.set(s > 7 ? 0xff3030 : s > 5 ? 0xffc020 : 0x40ff60).multiplyScalar(2);
        else this.tmpColor.set(0x0c0c0c);
        this.vu.setColorAt(c * 10 + s, this.tmpColor);
      }
    }
    if (this.vu.instanceColor) this.vu.instanceColor.needsUpdate = true;

    // DJ nickt im Takt
    const nod = Math.pow(Math.abs(Math.sin(beat * Math.PI)), 3);
    this.dj.position.y = STAGE_H - nod * 0.04 * groove;
    this.dj.rotation.x = nod * 0.06 * groove;

    // Crowd
    let a = 0;
    let b = 0;
    for (const p of this.people) {
      const bounce = Math.pow(Math.abs(Math.sin(beat * Math.PI + p.phase * 0.15)), 2) * 0.06 * groove;
      const jump = kick * 0.09 * p.amp * groove;
      this.dummy.position.set(p.x, bounce + jump - 0.02, p.z);
      this.dummy.rotation.set(0, p.rot + Math.sin(t * 0.7 + p.phase) * 0.15, Math.sin(beat * Math.PI + p.phase) * 0.04 * groove);
      this.dummy.scale.setScalar(p.scale);
      this.dummy.updateMatrix();
      if (p.up) this.crowdUp.setMatrixAt(b++, this.dummy.matrix);
      else this.crowdDown.setMatrixAt(a++, this.dummy.matrix);
    }
    this.crowdDown.instanceMatrix.needsUpdate = true;
    this.crowdUp.instanceMatrix.needsUpdate = true;

    // Staub treibt langsam
    this.dust.rotation.y = Math.sin(t * 0.03) * 0.05;
    this.dust.position.y = Math.sin(t * 0.1) * 0.15;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.35 + e.fx * 0.6;
    this.scene.fog!.color.setRGB(0.016 + sb * 0.4, 0.012 + sb * 0.4, 0.024 + sb * 0.4);

    // Kamerafahrt
    if (this.camFlight) {
      this.flightT += dt;
      const ft = this.flightT * 0.06;
      this.camera.position.set(Math.sin(ft) * 8, 2.4 + Math.sin(ft * 1.7) * 1.4, 4 + Math.cos(ft) * 7);
      this.controls.target.set(Math.sin(ft * 0.6) * 2, 2, -8);
    }
    this.controls.update();
    // Kamera im Raum halten
    const cp = this.camera.position;
    cp.x = THREE.MathUtils.clamp(cp.x, -ROOM_W / 2 + 0.4, ROOM_W / 2 - 0.4);
    cp.y = THREE.MathUtils.clamp(cp.y, 0.3, ROOM_H - 0.3);
    cp.z = THREE.MathUtils.clamp(cp.z, Z_BACK + 0.6, Z_FRONT - 0.4);

    this.composer.render();
    this.adaptQuality(dt);
  }
}
