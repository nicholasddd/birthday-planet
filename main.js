import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { buildPlanet, R, mulberry32, randDir, softify } from './planet.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeChibi, animateCharacter } from './characters.js';
import { makeCabbageChicken } from './chickens.js';
import { bake } from './perf.js';
import { createMusic } from './music.js';
import { makeStarWand, makeParasol, makeFloat, makeCupcake } from './props.js';
import { LETTERS_TH, SIGN_TH } from './letters-th.js';
import { DEMO_CONFIG } from './demo.js';

// DEMO (?demo): a ten-minute taste for friends and strangers — 3 chouchous, a whole day squeezed into
// ten minutes, its own words (nothing personal), and its own progress kept per browser tab.
const DEMO = new URLSearchParams(location.search).has('demo');
if (DEMO) Object.assign(CONFIG, DEMO_CONFIG);
const THAI = DEMO ? DEMO_CONFIG.lettersTh : LETTERS_TH, SIGN = DEMO ? { en: DEMO_CONFIG.signEn, th: DEMO_CONFIG.signTh } : { en: 'With all my love,', th: SIGN_TH };
import { makeFireflies, makeButterflies, makeRain, makeRainbow, makeBottle, zTex, noteTex } from './life.js';

// ============================================================ utils
const TOTAL = DEMO ? 3 : 24;
const HOUR = 3600 * 1000;
const SLOT = DEMO ? 150 * 1000 : HOUR;        // time between chouchous
const SKY_HOUR = DEMO ? 25 * 1000 : HOUR;     // one hour of sky (the demo runs a whole day in 10 minutes)
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AY = V(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const $ = id => document.getElementById(id);

// progress is remembered in this browser; the demo keeps its own, per tab, so every visit starts fresh
const store = (() => {
  const S = () => (DEMO ? sessionStorage : localStorage), pre = DEMO ? 'demo:' : '';
  return {
    get(k) { try { return S().getItem(pre + k); } catch { return null; } },
    set(k, v) { try { S().setItem(pre + k, v); } catch {} },
  };
})();

// ============================================================ time + progress
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
let timeOffset = DEBUG ? Number(store.get('bday-offset') || 0) : 0;
let startMs = new Date(CONFIG.startTime).getTime();
let openMs = new Date(CONFIG.openTime || CONFIG.startTime).getTime();   // the waiting page ends here
if (DEMO) {   // a 10-second countdown from arriving; the first chouchou 30 s after stepping inside
  openMs = Number(store.get('open')) || Date.now() + 10000; store.set('open', String(openMs));
  startMs = Number(store.get('start')) || Infinity;
}
const now = () => Date.now() + timeOffset;
const unlockTime = i => startMs + i * SLOT;
function unlockedCount() {
  const t = now() - startMs;
  if (!(t >= 0)) return 0;
  return Math.min(TOTAL, Math.floor(t / SLOT) + 1);
}
let collected = new Set();
try { collected = new Set(JSON.parse(store.get('bday-collected') || '[]')); } catch {}
let pulled = new Set();      // chickens pulled out of the ground (letter may not be taken yet)
try { pulled = new Set(JSON.parse(store.get('bday-pulled') || '[]')); } catch {}
for (const i of collected) pulled.add(i);
// Letters always arrive in order, 1 → 24, whichever chouchou hands one over: letterOf[chouchou] = letter number.
let letterOf = {};
try { letterOf = JSON.parse(store.get('bday-letterof') || '{}'); } catch {}
const lettersGiven = () => Object.keys(letterOf).length;
for (const i of [...collected].sort((a, b) => a - b)) if (!(i in letterOf)) letterOf[i] = lettersGiven();   // older saves
const chouchouOf = k => +Object.keys(letterOf).find(i => letterOf[i] === k);   // which chouchou brought letter k
function takeLetter(i) {   // chouchou i hands over its letter: it gets the next one in sequence
  if (!(i in letterOf)) letterOf[i] = lettersGiven();
  collected.add(i);
  return letterOf[i];
}
const saveProgress = () => {
  store.set('bday-collected', JSON.stringify([...collected]));
  store.set('bday-pulled', JSON.stringify([...pulled]));
  store.set('bday-letterof', JSON.stringify(letterOf));
};

// ============================================================ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCF + radius = soft, blurry shadows
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
// soft gradient sky that always follows "up" for wherever she stands
const SKY = {
  dayTop: new THREE.Color(0x2a7fd4), dayBottom: new THREE.Color(0x9fd2fb),
  nightTop: new THREE.Color(0x15123f), nightBottom: new THREE.Color(0x3a3478),
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTop: { value: SKY.dayTop.clone() }, uBottom: { value: SKY.dayBottom.clone() }, uUp: { value: new THREE.Vector3(0, 1, 0) },
    uNebA: { value: new THREE.Color(0x6a3fa0) }, uNebB: { value: new THREE.Color(0xd06aa8) }, uNeb: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main() { vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  // plus, at night, soft drifting nebula clouds and a faint Milky Way band (uNeb = how strong)
  fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uUp; uniform vec3 uNebA; uniform vec3 uNebB; uniform float uNeb; uniform float uTime; varying vec3 vDir;
    float lobe(vec3 d, vec3 c, float k) { return exp(-k * (1.0 - dot(d, normalize(c)))); }
    void main() {
      vec3 d = normalize(vDir);
      vec3 col = mix(uBottom, uTop, smoothstep(-0.2, 0.55, dot(d, uUp)));
      if (uNeb > 0.001) {
        float t = uTime * 0.015;
        float n1 = lobe(d, vec3(cos(t), 0.35, sin(t)), 2.2), n2 = lobe(d, vec3(-sin(t * 0.7), -0.25, cos(t * 0.7)), 1.8), n3 = lobe(d, vec3(0.35, 0.9, -0.4), 3.2);
        vec3 nb = normalize(vec3(0.3, 0.55, 0.78));
        float wob = 0.55 + 0.45 * sin(dot(d, vec3(7.0, 3.0, 5.0)) + uTime * 0.04) * sin(dot(d, vec3(-4.0, 9.0, 2.0)) - uTime * 0.03);
        float band = exp(-pow(dot(d, nb) * 4.5, 2.0)) * wob;
        col += uNeb * (uNebA * (n1 * 0.8 + band * 0.55) + uNebB * (n2 * 0.75 + n3 * 0.45));
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
}));
sky.renderOrder = -1;
scene.add(sky);
scene.fog = new THREE.FogExp2(SKY.dayBottom.clone(), 0.0045);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.55, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const hemi = new THREE.HemisphereLight(0xeaf5ff, 0x8fb872, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e6, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 200 });
sun.shadow.bias = -0.0005;
sun.shadow.radius = 5;
scene.add(sun, sun.target);

// stars: a field of small ones plus a few big bright ones that catch the glow (shown at night)
const starDot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const starsMat = new THREE.PointsMaterial({ color: 0xfff6e0, map: starDot, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false });
const starsBigMat = starsMat.clone(); starsBigMat.size = 8; starsBigMat.color.setRGB(1.9, 1.85, 1.7);
{
  const rng = mulberry32(7);
  for (const [n, mat] of [[1400, starsMat], [140, starsBigMat]]) {
    const g = new THREE.BufferGeometry(), pts = [];
    for (let i = 0; i < n; i++) pts.push(...randDir(rng).multiplyScalar(250 + rng() * 100).toArray());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const p = new THREE.Points(g, mat); p.renderOrder = -1; scene.add(p);
  }
}
// now and then at night, a shooting star streaks across whatever part of the sky she's looking at
const shooting = new THREE.Sprite(new THREE.SpriteMaterial({
  map: (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 16;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,250,235,.7)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 8); x.lineTo(250, 3); x.arc(250, 8, 5, -Math.PI / 2, Math.PI / 2); x.lineTo(0, 8); x.fill();
    return new THREE.CanvasTexture(c);
  })(),
  color: new THREE.Color(2, 1.95, 1.8), transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0,
}));
shooting.center.set(1, 0.5);   // the bright head sits on the position, the tail trails behind
shooting.visible = false;
scene.add(shooting);
const shoot = { wait: 4, t: 0, life: 0, vel: V() };

// ============================================================ textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = canvasTex(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});
const beamTex = canvasTex(4, 128, (x) => {
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.9)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128);
});
const heartTex = canvasTex(128, 128, (x) => {
  x.font = '100px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ff5c98'; x.fillText('❤', 64, 70);
});

// ============================================================ planet
const world = buildPlanet(CONFIG.seed || 1);
const planetGroup = world.group;
scene.add(planetGroup);
const { flowerDirs, obstacles, cloudPivot, placeOnSurface, shadowAll } = world;

// ============================================================ characters
const girl = makeChibi(CONFIG.girl, true);
girl.root.visible = false;   // she only appears once she steps inside
scene.add(girl.root);
const boy = makeChibi(CONFIG.boy, false);
boy.root.visible = false;
scene.add(boy.root);
// afterwards (free roam) he's out of the strawberry: his everyday self, black hair, walking with her
const boyPal = makeChibi({ ...CONFIG.boy, hair: 0x231915, hairSheen: 0x6e5a4e }, false);
boyPal.root.visible = false;
scene.add(boyPal.root);

// arrow above her head pointing at the nearest stuck chicken
const arrowPivot = new THREE.Group(); arrowPivot.position.y = 3.1; girl.root.add(arrowPivot);
{
  const g = new THREE.ConeGeometry(0.22, 0.6, 12); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.9);
  arrowPivot.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc400, emissiveIntensity: 1.5 })));
}

// ============================================================ things she can carry: star wand (I), parasol (P), pool float (O)
const gear = { wand: false, parasol: false, floating: false };
const wand = makeStarWand(glowTex), parasol = makeParasol(), floatRing = makeFloat();
// each hangs from a hand, in a holder that cancels the arm's own tilt, so the prop stays upright
const wandHolder = new THREE.Group(), parasolHolder = new THREE.Group();
wandHolder.rotation.order = parasolHolder.rotation.order = 'ZYX';
wandHolder.position.y = parasolHolder.position.y = -0.44;
wandHolder.add(wand.root); parasolHolder.add(parasol.root);
girl.parts.shR.add(wandHolder); girl.parts.shL.add(parasolHolder);
parasol.root.rotation.set(-0.17, 0, 0.12);   // leaning back over her head
wandHolder.visible = parasolHolder.visible = false;
floatRing.root.position.y = 0.32; floatRing.root.visible = false; girl.root.add(floatRing.root);
const cupcake = makeCupcake();   // her sunny-day snack, held up in both hands when she sits for a while
cupcake.root.position.set(0, 0.86, 0.5); cupcake.root.rotation.x = -0.25; cupcake.root.visible = false; girl.rig.add(cupcake.root);
let nomT = 0;
// the wand's light is always in the scene (just dark when put away), so switching it on never stalls to rebuild shaders
// I: she raises the wand, its star lifts off and floats up above her head, lighting a soft pool around her like a
// spotlight; I again calls it back down. The light is always in the scene (just dark when off) so switching never stalls.
const wandLight = new THREE.SpotLight(0xffdc96, 0, 16, 0.62, 0.85, 1.2);
scene.add(wandLight, wandLight.target);
const sky1 = new THREE.Group();   // the floating star (shares the wand star's geometry + material)
sky1.add(new THREE.Mesh(wand.star.geometry, wand.star.material), wand.halo.clone());
sky1.children[1].position.set(0, 0, 0); sky1.children[1].scale.setScalar(1.1);
sky1.visible = false; scene.add(sky1);
const starFx = { phase: 'off', t: 0, from: V() };   // off → raise → rise → on → fall → off
const ARM = { wand: [-1.35, -0.4], parasol: [-0.85, 0.25] };   // [forward tilt, outward tilt] of the holding arm
function toggleGear(k) {
  if (state !== 'play' || modalOpen || introLock) return;
  if (k === 'wand') {
    if (starFx.phase === 'off') { starFx.phase = 'raise'; starFx.t = 0; gear.wand = true; wandHolder.visible = true; wand.star.visible = wand.halo.visible = true; [1318.5, 1568, 2093].forEach((f, j) => tone(f, j * 0.06, 0.5, 0.05, 'sine')); }
    else if (starFx.phase === 'on' || starFx.phase === 'rise') { starFx.phase = 'fall'; starFx.t = 0; starFx.from.copy(sky1.position); tone(1046, 0, 0.3, 0.04, 'sine'); tone(784, 0.1, 0.4, 0.04, 'sine'); }
    return;
  }
  gear[k] = !gear[k];
  (k === 'wand' ? wandHolder : parasolHolder).visible = gear[k];
  if (gear[k]) {
    const at = (k === 'wand' ? wand.star : parasol.root).getWorldPosition(V());
    burst(at, k === 'wand' ? 0xffe27a : 0xffffff, 14, 3, 0.5, 0.8);
    if (k === 'wand') [1318.5, 1568, 2093].forEach((f, j) => tone(f, j * 0.06, 0.5, 0.05, 'sine'));
    else { tone(520, 0, 0.12, 0.08, 'triangle'); tone(780, 0.08, 0.2, 0.06, 'triangle'); }
  } else tone(400, 0, 0.1, 0.05, 'sine');
}
// the float: hop on at the lagoon's edge, paddle anywhere on the lagoon, hop off at the shore
const onLagoon = d => world.standHeight(d).wet && d.angleTo(world.lake.c) < world.lake.r * 1.35;
function stepToward(d, sign, maxAng, test) {   // walk across the surface toward (+1) or away from (-1) the lagoon's middle until test passes
  const axis = V().crossVectors(d, world.lake.c).normalize().multiplyScalar(sign);
  for (let a = 0.01; a < maxAng; a += 0.01) { const nd = d.clone().applyAxisAngle(axis, a); if (test(nd)) return new THREE.Quaternion().setFromAxisAngle(axis, a + 0.012); }
  return null;
}
let floatHint = '';
const hoverAt = t => girl.root.localToWorld(V(0, 3.4 + Math.sin(t * 1.6) * 0.15, 0.35));   // where the star hovers, just above her head
function updateStar(dt, t) {
  starFx.t += dt;
  const T = starFx.t, ph = starFx.phase;
  if (ph === 'raise') {   // she lifts the wand up high...
    if (T > 0.55) {
      starFx.phase = 'rise'; starFx.t = 0;
      wand.star.getWorldPosition(starFx.from); sky1.position.copy(starFx.from); sky1.visible = true;
      wand.star.visible = wand.halo.visible = false;
      burst(starFx.from.clone(), 0xffe9a8, 12, 2.5, 0.4, 0.9);
    }
  } else if (ph === 'rise') {   // ...the star lifts off and drifts slowly up above her
    const e = ease(clamp(T / 1.8, 0, 1));
    sky1.position.copy(starFx.from).lerp(hoverAt(t), e);
    if (T > 0.4) { wandHolder.visible = false; gear.wand = false; }   // the wand is tucked away again, arm back down
    if (T > 1.8) starFx.phase = 'on';
  } else if (ph === 'on') {   // it follows her, a little lazily
    sky1.position.lerp(hoverAt(t), 1 - Math.exp(-dt * 3));
  } else if (ph === 'fall') {   // called back: it drifts down to her and fades away
    const e = ease(clamp(T / 0.9, 0, 1));
    sky1.position.copy(starFx.from).lerp(girl.root.localToWorld(V(0, 1.2, 0.5)), e);
    sky1.scale.setScalar(Math.max(0.01, 1 - e));
    if (T > 0.9) { starFx.phase = 'off'; sky1.visible = false; sky1.scale.setScalar(1); burst(girl.root.localToWorld(V(0, 1.2, 0.5)), 0xffe9a8, 10, 2, 0.35, 0.8); }
  }
  if (sky1.visible) {
    sky1.children[0].rotation.y += dt * 1.2;
    sky1.children[1].material.opacity = 0.45 + Math.sin(t * 3) * 0.08;
    wandLight.position.copy(sky1.position);
    girl.root.getWorldPosition(wandLight.target.position);   // a soft pool of light around her feet
    if (Math.random() < dt * 3) burst(sky1.position.clone(), 0xffe9a8, 1, 0.6, 0.22, 1);   // twinkles
  }
}
function floatPress() {
  if (state !== 'play' || modalOpen || introLock || airborne) return;
  const here = AY.clone().applyQuaternion(pq);
  if (!gear.floating) {
    const q = onLagoon(here) ? new THREE.Quaternion() : stepToward(here, 1, 3 / R, onLagoon);
    if (!q) return;
    pq.premultiply(q); gear.floating = true; floatRing.root.visible = true; floatRing.root.scale.setScalar(0.01);
    burst(here.multiplyScalar(R + world.lake.water), 0xffffff, 18, 4, 0.5, 0.8);
    tone(330, 0, 0.15, 0.08, 'sine'); tone(660, 0.08, 0.25, 0.06, 'sine');
  } else {
    const q = stepToward(here, -1, 3 / R, d => !world.standHeight(d).wet);
    if (!q) { toast('🛟 Paddle a little closer to the shore to hop off'); return; }
    pq.premultiply(q); gear.floating = false; floatRing.root.visible = false;
    girlH = world.standHeight(AY.clone().applyQuaternion(pq)).h;
    burst(girl.root.position.clone(), 0xffffff, 14, 4, 0.5, 0.8); tone(500, 0, 0.12, 0.07, 'triangle');
  }
}

// ============================================================ chouchous (cabbage chickens)
// Each hour a chouchou gets stuck in the ground (glowing so it's easy to find).
// She spams SPACE to pull it out; it hands over the letter in its beak, keeps its flower,
// and then waddles around the planet freely.
const PALETTE = [0xff6fa8, 0xffb347, 0xb084ff, 0x6fd3ff, 0xff8a80, 0xfff176, 0x81f5c1, 0xff9de2];
const EMOJI = ['🌸', '🌼', '🌺', '🌷', '🪻', '🌻', '💮', '🏵️'];
const buried = new Map();   // i -> holder group (still stuck)
const roamers = [];         // freed chickens
const dirtM = new THREE.MeshStandardMaterial({ color: 0x8a5f3f, roughness: 1 });
const holeM = new THREE.MeshStandardMaterial({ color: 0x4e3424, roughness: 1 });
const SINK = -0.95;

function makeBuried(i) {
  const color = new THREE.Color(PALETTE[i % PALETTE.length]);
  const holder = new THREE.Group();
  const ch = makeCabbageChicken(color); ch.root.position.y = SINK; holder.add(ch.root);
  if (typeof showShells === 'function') showShells(ch.root);
  const mound = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.17, 10, 28), dirtM);
  mound.rotation.x = -Math.PI / 2; mound.scale.z = 0.55; mound.position.y = 0.02; mound.receiveShadow = true; holder.add(mound);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.66, 28), holeM); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.03; holder.add(hole);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(3.2); halo.position.y = 0.7; holder.add(halo);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ map: beamTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.6 }));
  beam.position.y = 20.5; holder.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; holder.add(ring);
  holder.userData = { i, ch, halo, ring, beam, spawn: 0, pull: 0 };
  placeOnSurface(holder, flowerDirs[i], 0, i * 1.7);
  return holder;
}
function syncChickens() {
  if (state === 'finale') return;
  const u = unlockedCount();
  for (let i = 0; i < u; i++) {
    if (!pulled.has(i) && !buried.has(i)) { const b = makeBuried(i); buried.set(i, b); planetGroup.add(b); }
  }
}
// a freed chicken that wanders the planet
function addRoamer(i, q, ch, popping) {
  const group = new THREE.Group(); group.add(ch.root); planetGroup.add(group);
  if (typeof showShells === 'function') showShells(group);
  const r = { i, q: q.clone(), ch, group, mode: popping ? 'pop' : 'roam', t: 0, turnRate: 0, turnT: 0, pause: 0, phase: Math.random() * 6 };
  if (!popping) {
    ch.root.position.y = 0;
    if (collected.has(i)) { ch.envelope.visible = false; ch.flower.visible = false; } else r.mode = 'present';
  }
  roamers.push(r);
  placeRoamer(r);
  return r;
}
function placeRoamer(r) {
  if (r.mode !== 'float' && r.mode !== 'leaveWater' && r.ch.shades.visible) { r.ch.shades.visible = false; r.ch.root.position.z = 0; }
  const d = AY.clone().applyQuaternion(r.q), st = world.standHeight(d);
  // chouchous heading out to (or floating in) the deep water bob on the surface instead of walking the lake bed
  const floating = st.wet && ((r.home?.float && (r.mode === 'float' || r.mode === 'toWater')) || (r.wasFloat && r.mode === 'leaveWater'));
  const h = floating ? world.lake.water - 0.32 + Math.sin(lastT * 2 + r.phase) * 0.05 : st.h;
  r.group.position.copy(d).multiplyScalar(R + h);
  r.group.quaternion.copy(r.q);
}

// ============================================================ the waterhole
// Up to 8 chouchous gather at the lagoon: some along the shore, some floating in the deep middle.
function lakeSpot(angle, dist) {
  const c = world.lake.c, t1 = V(0, 1, 0).cross(c).normalize(), t2 = c.clone().cross(t1).normalize();
  const T = t1.multiplyScalar(Math.cos(angle)).addScaledVector(t2, Math.sin(angle));
  return c.clone().applyAxisAngle(c.clone().cross(T).normalize(), dist);
}
// the lagoon's shore wobbles, so walk outward from the middle until the ground is dry, then step just past the edge
function shoreSpot(angle) {
  for (let f = 0.75; f < 1.5; f += 0.01) if (!world.standHeight(lakeSpot(angle, world.lake.r * f)).wet) return lakeSpot(angle, world.lake.r * f + 0.012);
  return lakeSpot(angle, world.lake.r * 1.02);
}
const WATER_SPOTS = [
  ...[0, 1, 2, 3, 4].map(k => ({ dir: shoreSpot(k * 1.2566 + 0.3), float: false, taken: null })),
  ...[0, 1].map(k => ({ dir: lakeSpot(k * 3.1 + 1, world.lake.r * (0.2 + 0.15 * k)), float: true, taken: null })),   // at most 2 floating at once
];
let waterT = 2;
function sendToWater(r, spot, teleport = false) {
  spot.taken = r; r.home = spot; r.t = 0;
  r.stay = spot.float ? 180 + Math.random() * 240 : 120 + Math.random() * 180;   // a good long while (3–7 min floating, 2–5 by the shore), but never forever
  if (teleport) { r.q.setFromUnitVectors(AY, spot.dir).multiply(tq.setFromAxisAngle(AY, Math.random() * 6)); r.mode = spot.float ? 'float' : 'water'; placeRoamer(r); }
  else r.mode = 'toWater';
}
function updateWaterhole(dt) {
  waterT -= dt; if (waterT > 0) return; waterT = 1.5;
  // they take turns: after a while each one climbs out and wanders off, and stays away for a bit
  for (const r of roamers) {
    if ((r.mode !== 'water' && r.mode !== 'float') || (r.stay -= 1.5) > 0) continue;
    r.wasFloat = r.mode === 'float';
    r.home.taken = null; r.home = null; r.mode = 'leaveWater'; r.t = 0;
    r.noWaterUntil = lastT + 40 + Math.random() * 50;
  }
  const free = WATER_SPOTS.filter(sp => !sp.taken); if (!free.length) return;   // all spots taken: the rest stay where they are
  const cands = roamers.filter(r => r.mode === 'roam' && !r.home && (r.noWaterUntil || 0) < lastT); if (!cands.length) return;
  sendToWater(cands[Math.floor(Math.random() * cands.length)], free[Math.floor(Math.random() * free.length)]);
}

// ============================================================ the stone stage's carved chouchou
// Once all 24 letters are found it glows softly; when she comes back it wakes up as a giant chouchou.
const statue = { group: new THREE.Group(), stone: null, mat: null, giant: null, glow: null, dir: null, state: 'stone', armed: true };
{
  const st = makeCabbageChicken(new THREE.Color(0xffffff));
  const statueM = softify(new THREE.MeshStandardMaterial({ color: 0xb6b0bc, roughness: 0.92, emissive: 0xffe2a8, emissiveIntensity: 0 }), { scale: 1.1, strength: 0.6 });
  const shells = []; st.root.traverse(o => { if (o.userData.fuzzShell) shells.push(o); });
  shells.forEach(o => o.parent.remove(o));
  st.envelope.visible = false; st.flower.visible = false;
  st.mouth.parent.remove(st.mouth); st.shades.parent.remove(st.shades);   // a stone chouchou wears no sunglasses
  st.root.traverse(o => { if (o.isMesh) { o.material = statueM; o.castShadow = true; o.receiveShadow = true; } });
  bake(st.root);   // now it's all one piece of stone
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.1, 0.35, 28), statueM);
  plinth.position.y = 0.17; plinth.castShadow = plinth.receiveShadow = true;
  const g = statue.group; g.add(plinth, st.root);
  st.root.position.y = 0.3; st.root.scale.setScalar(2.4);
  g.position.set(0, 1.25, -world.stage.r * 0.42);
  world.stage.group.add(g);
  world.stage.group.updateMatrixWorld(true);
  statue.stone = st.root; statue.mat = statueM;
  statue.dir = g.getWorldPosition(V()).normalize();
  obstacles.push({ dir: statue.dir, rad: 1.9, top: world.stage.top + 4.2, plat: 0, solid: true });
  // soft golden halo, shown while it waits for her
  statue.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe6b0, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  statue.glow.position.set(0, 2.6, 0); statue.glow.scale.setScalar(9); statue.glow.visible = false; g.add(statue.glow);
}
const allFound = () => collected.size === TOTAL;
// the stone comes to life: a real, fluffy giant chouchou with a big flower
function wakeStatue(quiet = false) {
  if (statue.state !== 'stone') return;
  statue.state = 'awake';
  const ch = makeCabbageChicken(new THREE.Color(0xff8fb8));
  ch.envelope.visible = false;
  statue.seatY = new THREE.Box3().setFromObject(ch.root).max.y * 0.86;   // where she'll sit: just into the leaves on its head
  ch.root.position.y = 0.3; ch.root.scale.setScalar(2.4);
  shadowAll(ch.root);
  statue.group.add(ch.root);
  showShells(ch.root);
  statue.giant = ch; statue.stone.visible = false; statue.t = 0;
  if (quiet) return;
  const top = statue.group.localToWorld(V(0, 2.4, 0));
  burst(top, 0xffffff, 40, 9, 1.2, 1.4);
  burst(top, 0xffe6b0, 24, 6, 0.8, 1.6, glowTex, false);
  burst(statue.group.localToWorld(V(0, 4.6, 0)), 0xffffff, 6, 2.5, 1, 1.8, heartTex, false);
  chime(); popSound();
  toast('✨ The stone chouchou woke up! Hop up onto the stage');
}
function updateStatue(dt, t) {
  const glowing = allFound() && state !== 'finale' && statue.state !== 'done' && statue.state !== 'post';
  statue.glow.visible = glowing || statue.glow.material.opacity > 0.01;
  statue.glow.material.opacity = lerp(statue.glow.material.opacity, glowing ? 0.35 + Math.sin(t * 2) * 0.12 : 0, 1 - Math.exp(-dt * 3));
  statue.mat.emissiveIntensity = glowing && statue.state === 'stone' ? 0.25 + Math.sin(t * 2) * 0.15 : 0;
  if (state !== 'play' || (!glowing && statue.state !== 'post')) return;
  const d = girl.root.position.distanceTo(statue.group.getWorldPosition(V()));
  if (statue.state === 'stone' && d < 11) wakeStatue();
  const g = statue.giant;
  if (g && statue.state === 'post') {   // afterwards: it stays on its stage, bouncing gently, turning to look at her when she's near
    statue.t += dt;
    g.root.scale.setScalar(2.4 * Math.min(1, easeOutBack(clamp(statue.t / 0.7, 0, 1))));
    g.root.position.y = 0.3 + Math.pow(Math.abs(Math.sin(t * 1.2)), 6) * (d < 12 ? 0.3 : 0.1);
    if (d < 12) { const rel = statue.group.worldToLocal(girl.root.position.clone()); g.root.rotation.y = lerp(g.root.rotation.y, Math.atan2(rel.x, rel.z), 0.04); }
    for (const [j, l] of g.leaves.entries()) l.rotation.x = Math.sin(t * 2 + j) * 0.12;
    return;
  }
  if (g && statue.state === 'awake') {   // bouncing happily, looking at her
    statue.t += dt;
    const pop = easeOutBack(clamp(statue.t / 0.7, 0, 1));
    g.root.scale.set(2.4 * (1 + Math.sin(t * 3) * 0.02), 2.4 * pop * (1 - Math.sin(t * 3) * 0.025), 2.4);
    g.root.position.y = 0.3 + Math.pow(Math.abs(Math.sin(t * 1.6)), 6) * 0.35;
    const rel = statue.group.worldToLocal(girl.root.position.clone());
    g.root.rotation.y = lerp(g.root.rotation.y, Math.atan2(rel.x, rel.z), 0.05);
    for (const [j, l] of g.leaves.entries()) l.rotation.x = Math.sin(t * 2 + j) * 0.12;
    // "Give the 24 flowers to the giant chouchou?" — asked every time she comes close
    const onStage = !airborne && girlH > world.stage.top - 0.3 && girl.root.position.clone().normalize().angleTo(world.stage.dir) * R < world.stage.r;
    if (!onStage) statue.armed = true;   // asked every time she climbs up onto the stone stage
    if (onStage && statue.armed && !modalOpen && !introLock && statue.t > 1.2) { statue.armed = false; openOverlay('gift'); }
  }
}

// ============================================================ life on the planet
// Wishes on shooting stars, message bottles, rain + rainbow, fireflies, butterflies, the chouchous'
// daily rhythm, follow-the-leader, dancing, names and photos. All cheap: a handful of draw calls in total.
const isNightHour = h => h >= 21 || h < 5.5;
const isDuskHour = h => h >= 17 && h < 18.7;
// a few open meadow spots (deterministic), away from water, trees and the stage
function openSpots(count, seed, minApart) {
  const rng = mulberry32(seed), out = [];
  for (let k = 0; k < 5000 && out.length < count; k++) {
    const d = randDir(rng);
    if (world.standHeight(d).wet || d.angleTo(world.lake.c) < world.lake.r * 1.5) continue;
    if (obstacles.some(o => o.dir.angleTo(d) * R < o.rad + 2)) continue;
    if (out.some(o => o.angleTo(d) * R < minApart)) continue;
    out.push(d);
  }
  return out;
}
const NAP_SPOTS = openSpots(3, 501, 9);   // where the sleepy ones cuddle up at night
// a little icon (z, ♪, sparkle) that drifts up and fades
function floatIcon(pos, tex, size = 0.45, life = 2.2, rise = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.position.copy(pos); s.scale.setScalar(size); scene.add(s);
  particles.push({ s, vel: pos.clone().normalize().multiplyScalar(rise).add(randDir(Math.random).multiplyScalar(0.12)), life, max: life, size });
}
// chouchou steering helpers
function turnToward(r, worldPos, dt) {
  const rel = worldPos.clone().sub(r.group.position).applyQuaternion(r.q.clone().invert());
  r.q.multiply(tq.setFromAxisAngle(AY, Math.atan2(rel.x, rel.z) * Math.min(1, dt * 4))).normalize();
}
function walkToward(r, dir, speed, dt, arrive = 1) {
  const od = AY.clone().applyQuaternion(r.q);
  if (od.angleTo(dir) * R < arrive) return true;
  turnToward(r, dir.clone().multiplyScalar(R), dt);
  for (const side of [0, 0.9, -0.9, 1.6, -1.6]) {
    const nq = r.q.clone().multiply(tq.setFromAxisAngle(AY, side)).multiply(tq.setFromAxisAngle(AX, (speed * dt) / R));
    const nd = AY.clone().applyQuaternion(nq);
    if (!blocked(od, nd, 0.4) && !world.standHeight(nd).wet) { r.q.copy(nq).multiply(tq.setFromAxisAngle(AY, -side)).normalize(); break; }
  }
  return false;
}
const hopAnim = (r, t, k = 0.16, f = 9) => { r.ch.root.position.y = Math.abs(Math.sin(t * f + r.phase)) * k; r.ch.root.rotation.set(0, 0, Math.sin(t * f + r.phase) * 0.1); };

// ---------------------------------------------------------------- weather: now and then a soft rain shower, then a rainbow
const weather = { phase: 'clear', t: 0, rain: 0, played: 0, next: DEMO ? 200 : 900 + Math.random() * 900 };   // the demo gets one shower, about 3 minutes in
const RAIN_LEN = DEMO ? 45 : 100, AFTER_LEN = DEMO ? 40 : 60;
const rain = makeRain(450); scene.add(rain.lines);
const rainbow = makeRainbow(); scene.add(rainbow);
const RAIN_TOP = new THREE.Color(0x56627a), RAIN_BOTTOM = new THREE.Color(0x9aa6b8);
const ripples = Array.from({ length: 12 }, () => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.18, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  m.visible = false; m.userData.t = 9; planetGroup.add(m); return m;
});
const _rp = V(), _rup = V(), _rrt = V(), _rfw = V();
let rainSound = null;
function shelterFor(r) {   // the nearest leafy tree to huddle under
  const me = AY.clone().applyQuaternion(r.q);
  let best = null, bd = 14;
  for (const o of obstacles) {
    if (o.solid || o.top < 2.5 || o.rad > 2) continue;
    const d = o.dir.angleTo(me) * R;
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return null;
  const ax = V().crossVectors(best.dir, me); if (ax.lengthSq() < 1e-9) return null;
  return best.dir.clone().applyAxisAngle(ax.normalize(), (best.rad + 0.55) / R);
}
// Rain: everyone out in the open picks a leafy tree to huddle under, never alone: a tree gets at least two.
const SHELTER_TREES = obstacles.filter(o => !o.solid && o.top >= 2.5 && o.rad <= 2 && o.rad > 0.5);
const canShelter = r => ['roam', 'toShelter', 'shelter', 'watch', 'chase'].includes(r.mode);
let shelterPlanT = 0;
function planShelters() {
  const group = roamers.filter(canShelter);
  const byTree = new Map();
  const near = (r, skip) => {
    const me = AY.clone().applyQuaternion(r.q); let best = null, bd = Infinity;
    for (const o of SHELTER_TREES) { if (skip && !skip(o)) continue; const d = o.dir.angleTo(me); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  for (const r of group) { const o = near(r); if (!o) continue; r.tree = o; if (!byTree.has(o)) byTree.set(o, []); byTree.get(o).push(r); }
  // nobody shelters alone: a lone chouchou joins the nearest tree that already has someone
  for (const [o, list] of [...byTree]) {
    if (list.length !== 1 || byTree.size < 2) continue;
    const r = list[0], to = near(r, x => x !== o && (byTree.get(x)?.length || 0) >= 1);
    if (!to) continue;
    byTree.delete(o); r.tree = to; byTree.get(to).push(r);
  }
  // side by side round the trunk, starting from where the first one arrives
  for (const [o, list] of byTree) {
    const e1 = V().crossVectors(o.dir, Math.abs(o.dir.y) < 0.9 ? AY : AX).normalize(), e2 = V().crossVectors(o.dir, e1);
    const ang = r => { const p = AY.clone().applyQuaternion(r.q); return Math.atan2(p.dot(e2), p.dot(e1)); };
    list.sort((a, b) => ang(a) - ang(b));
    const rad = o.rad + 0.65, step = 1.5 / rad, base = ang(list[0]);
    list.forEach((r, k) => {
      const th = base + k * step;   // shoulder to shoulder
      const a = rad / R, dir = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
      r.shelter = o.dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(dir, Math.sin(a)).normalize();
    });
  }
}
function updateWeather(dt, t) {
  if (weather.rain > 0.35 && state === 'play' && (shelterPlanT -= dt) <= 0) { shelterPlanT = 3; planShelters(); }   // (re)plan every few seconds while it pours
  if (state === 'play') {
    weather.played += dt; weather.t += dt;
    if (weather.phase === 'clear' && weather.played > weather.next) { weather.phase = 'rain'; weather.t = 0; weather.rained = true; }
    if (weather.phase === 'rain' && weather.t > RAIN_LEN) { weather.phase = 'after'; weather.t = 0; }
    if (weather.phase === 'after' && weather.t > AFTER_LEN) { weather.phase = 'clear'; weather.t = 0; weather.next = DEMO ? Infinity : weather.played + 1200 + Math.random() * 1200; }
  }
  const want = state === 'play' && weather.phase === 'rain' ? 1 : 0;
  weather.rain = want ? Math.min(1, weather.rain + dt / 6) : Math.max(0, weather.rain - dt / 8);
  // streaks falling around her
  rain.lines.visible = weather.rain > 0.01;
  rain.mat.opacity = weather.rain * 0.5;
  if (rain.lines.visible) {
    _rup.copy(AY).applyQuaternion(pq); _rrt.copy(AX).applyQuaternion(pq); _rfw.set(0, 0, 1).applyQuaternion(pq);
    const c = girl.root.position, a = rain.lines.geometry.attributes.position;
    rain.drops.forEach((d, i) => {
      d.y -= 20 * dt;
      if (d.y < -0.3) { d.x = (Math.random() - 0.5) * 30; d.z = (Math.random() - 0.5) * 30; d.y = 3 + Math.random() * 13; }
      _rp.copy(c).addScaledVector(_rrt, d.x).addScaledVector(_rfw, d.z).addScaledVector(_rup, d.y);
      a.setXYZ(i * 2, _rp.x, _rp.y, _rp.z); _rp.addScaledVector(_rup, 0.55); a.setXYZ(i * 2 + 1, _rp.x, _rp.y, _rp.z);
    });
    a.needsUpdate = true;
    // ripples on the lagoon, if she's anywhere near it
    if (girl.root.position.angleTo(world.lake.c) < (world.lake.r * 3) && Math.random() < dt * 14 * weather.rain) {
      const m = ripples.find(x => x.userData.t > 1.2);
      const d = world.lake.c.clone().applyAxisAngle(randDir(Math.random).cross(world.lake.c).normalize(), Math.random() * world.lake.r * 0.95);
      if (m && world.standHeight(d).wet) { m.position.copy(d).multiplyScalar(R + world.lake.water + 0.02); m.quaternion.setFromUnitVectors(AY, d); m.userData.t = 0; m.visible = true; }
    }
    // a soft hiss of rain
    if (actx && !rainSound) {
      const len = actx.sampleRate * 2, buf = actx.createBuffer(1, len, actx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      src.buffer = buf; src.loop = true; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6; g.gain.value = 0;
      src.connect(f).connect(g).connect(actx.destination); src.start();
      rainSound = g;
    }
  }
  if (rainSound) rainSound.gain.setTargetAtTime(muted ? 0 : weather.rain * 0.05, actx.currentTime, 0.3);
  for (const m of ripples) {
    if (!m.visible) continue;
    m.userData.t += dt; const k = m.userData.t / 1.2;
    m.scale.setScalar(1 + k * 6); m.material.opacity = 0.55 * (1 - k);
    if (k >= 1) m.visible = false;
  }
  // the rainbow, afterwards (in daylight)
  const h = hourOfDay(), daylight = h > 6.5 && h < 17.5;
  const rb = state === 'play' && weather.phase === 'after' && daylight && weather.t < AFTER_LEN - 12 ? 0.75 : 0;
  rainbow.material.opacity = lerp(rainbow.material.opacity, rb, 1 - Math.exp(-dt * 0.5));
  rainbow.visible = rainbow.material.opacity > 0.01;
  if (rainbow.visible) {
    camera.getWorldDirection(_rp); _rp.addScaledVector(camera.up, -_rp.dot(camera.up)).normalize();
    rainbow.position.copy(camera.position).addScaledVector(_rp, 120).addScaledVector(camera.up, 6);
    rainbow.quaternion.copy(camera.quaternion); rainbow.scale.set(160, 160, 1);
  }
}

// ---------------------------------------------------------------- fireflies around the lagoon at night
const fireflies = makeFireflies(48, glowTex); planetGroup.add(fireflies.points);
const ffData = (() => {
  const rng = mulberry32(61), a = [];
  for (let i = 0; i < fireflies.n; i++) {
    const d = world.lake.c.clone().applyAxisAngle(randDir(rng).cross(world.lake.c).normalize(), rng() * world.lake.r * 1.8);
    a.push({ d, h: Math.max(world.standHeight(d).h, world.lake.water) + 0.5 + rng() * 1.8, ph: rng() * 6, sp: 0.4 + rng() * 0.6 });
  }
  return a;
})();
function updateFireflies(t) {
  const k = clamp((starsMat.opacity - 0.3) / 0.5, 0, 1) * (1 - weather.rain);
  fireflies.points.visible = k > 0.01;
  if (!fireflies.points.visible) return;
  fireflies.mat.opacity = k * (0.75 + 0.25 * Math.sin(t * 2.3));
  const pos = fireflies.points.geometry.attributes.position;
  ffData.forEach((f, i) => {
    _rp.copy(f.d).multiplyScalar(R + f.h + Math.sin(t * f.sp + f.ph) * 0.4);
    pos.setXYZ(i, _rp.x + Math.sin(t * 0.5 * f.sp + f.ph * 2) * 0.8, _rp.y + Math.sin(t * 0.3 + f.ph) * 0.3, _rp.z + Math.cos(t * 0.4 * f.sp + f.ph) * 0.8);
  });
  pos.needsUpdate = true;
}

// ---------------------------------------------------------------- butterflies over the meadows by day
const butterflies = makeButterflies(10); planetGroup.add(butterflies.left, butterflies.right);
const bfData = openSpots(10, 733, 5).map((d, i) => {
  const t1 = V().crossVectors(d, V(0.3, 1, 0.2).normalize()).normalize(), t2 = V().crossVectors(d, t1);
  return { d, t1, t2, ph: i * 1.7, r: 0.8 + (i % 3) * 0.4, h: world.standHeight(d).h, pos: d.clone().multiplyScalar(R) };
});
const _bm = new THREE.Matrix4(), _bm2 = new THREE.Matrix4(), _flap = new THREE.Matrix4(), _mir = new THREE.Matrix4().makeScale(-1, 1, 1), _bx = V(), _bu = V(), _bf = V();
let butterfliesOut = false;
function updateButterflies(t) {
  butterfliesOut = (1 - clamp((starsMat.opacity - 0.15) / 0.3, 0, 1)) > 0.05 && weather.rain < 0.4;
  butterflies.left.visible = butterflies.right.visible = butterfliesOut;
  if (!butterfliesOut) return;
  bfData.forEach((b, i) => {
    const a = t * 0.6 + b.ph;
    b.pos.copy(b.d).multiplyScalar(R + b.h + 1.1 + Math.sin(t * 1.3 + b.ph) * 0.35).addScaledVector(b.t1, Math.cos(a) * b.r).addScaledVector(b.t2, Math.sin(a) * b.r);
    _bu.copy(b.pos).normalize();
    _bf.copy(b.t1).multiplyScalar(-Math.sin(a)).addScaledVector(b.t2, Math.cos(a)); _bf.addScaledVector(_bu, -_bf.dot(_bu)).normalize();
    _bx.crossVectors(_bu, _bf);
    _bm.makeBasis(_bx, _bu, _bf).setPosition(b.pos);
    _flap.makeRotationZ(Math.sin(t * 18 + b.ph) * 0.9 + 0.3);
    butterflies.left.setMatrixAt(i, _bm2.copy(_bm).multiply(_flap));
    butterflies.right.setMatrixAt(i, _bm2.copy(_bm).multiply(_mir).multiply(_flap));
  });
  butterflies.left.instanceMatrix.needsUpdate = butterflies.right.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- wishes on shooting stars (E)
let lastWish = Number(store.get('bday-wish-last') ?? -1), wishWindow = 0, wishTimer = null;
const wishesSeen = new Set((() => { try { return JSON.parse(store.get('bday-wishes-seen') || '[]'); } catch { return []; } })());
const wishesLeft = () => Math.max(0, (CONFIG.wishes || []).length - wishesSeen.size);
const bottlesLeft = () => Math.max(0, (CONFIG.bottles || []).length - bottleState.size);
// while a shooting star is crossing, a little "🌠 E" bubble pops up above her head so she doesn't miss it
const wishBubble = (() => {
  const c = document.createElement('canvas'); c.width = 300; c.height = 120;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.strokeStyle = 'rgba(140,110,200,0.55)'; x.lineWidth = 4;
  x.beginPath(); x.roundRect(8, 8, 284, 86, 43); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(138, 92); x.lineTo(150, 112); x.lineTo(162, 92); x.closePath(); x.fill();   // little speech-bubble tail
  x.font = '54px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🌠', 70, 54);
  x.fillStyle = '#efe9f7'; x.beginPath(); x.roundRect(112, 26, 160, 56, 12); x.fill();
  x.fillStyle = '#5b4a7a'; x.font = '700 30px Quicksand, sans-serif'; x.fillText('SPACE', 192, 56);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  sp.renderOrder = 16; sp.visible = false; scene.add(sp);
  return sp;
})();
let wishPop = 0;
function makeWish() {
  if (wishWindow <= 0 || state !== 'play' || modalOpen) return;
  wishWindow = 0; shoot.wished = true;   // one wish per shooting star
  const W = CONFIG.wishes || []; if (!W.length) return;
  // one at random: ones she hasn't seen yet first, and never the same one twice in a row
  const unseen = W.map((_, i) => i).filter(i => !wishesSeen.has(i) && i !== lastWish);
  const pool = unseen.length ? unseen : W.map((_, i) => i).filter(i => i !== lastWish || W.length === 1);
  const k = pool[Math.floor(Math.random() * pool.length)];
  lastWish = k; store.set('bday-wish-last', String(k));
  wishesSeen.add(k); store.set('bday-wishes-seen', JSON.stringify([...wishesSeen])); updateTimeUI();
  const w = W[k];
  const th = letterLang === 'th';
  $('wishText').textContent = th ? w.th : w.en; $('wishText').classList.toggle('th', th);
  $('wishCard').classList.add('show'); clearTimeout(wishTimer); wishTimer = setTimeout(() => $('wishCard').classList.remove('show'), 8000);
  [1568, 1976, 2349, 3136].forEach((f, j) => tone(f, j * 0.09, 0.9, 0.035, 'sine'));
  for (let j = 0; j < 8; j++) floatIcon(girl.root.localToWorld(V((Math.random() - 0.5) * 1.2, 2.4 + Math.random(), (Math.random() - 0.5) * 1.2)), glowTex, 0.35, 1.8, 1.4);
}

// ---------------------------------------------------------------- messages in bottles
const bottleState = new Set((() => { try { return JSON.parse(store.get('bday-bottles') || '[]'); } catch { return []; } })());   // messages she has read
// Every so often a single bottle washes up somewhere on the shore; opening it reveals a message picked at random
// (ones she hasn't read yet first). The next one turns up a while later, somewhere else.
const BOTTLE_FIRST = DEMO ? 1 : 2;                                         // the first appears once this many chouchous have arrived
const bottleGap = () => (DEMO ? 50 + Math.random() * 40 : (50 + Math.random() * 60) * 60) * 1000;   // demo: ~1 min · real: 50–110 min
const bottleSpots = [0.4, 0.94, 1.6, 2.19, 2.8, 3.44, 4.1, 4.7, 5.35, 5.96].map(a => shoreSpot(a));
{ // one more spot: at the edge of the river's little spring
  const s = world.spring, ax = V().crossVectors(s, world.lake.c).normalize();
  let d = s.clone();
  for (let a = 0.005; a < 0.3; a += 0.005) { d = s.clone().applyAxisAngle(ax, -a); if (!world.standHeight(d).wet) break; }
  bottleSpots.push(d.applyAxisAngle(ax, -0.01));
}
let bottleNext = (() => { try { return JSON.parse(store.get('bday-bottle') || 'null'); } catch { return null; } })();   // { spot, at }
function scheduleBottle(delay) {
  let spot = Math.floor(Math.random() * bottleSpots.length);
  if (bottleNext && spot === bottleNext.spot) spot = (spot + 1 + Math.floor(Math.random() * (bottleSpots.length - 1))) % bottleSpots.length;
  bottleNext = { spot, at: now() + delay }; store.set('bday-bottle', JSON.stringify(bottleNext));
}
if (!bottleNext) scheduleBottle(0);
const bottleMesh = makeBottle(); bottleMesh.visible = false; planetGroup.add(bottleMesh);
const bottles = [{ mesh: bottleMesh, spot: -1, base: V(), d: V() }];   // (one bottle, moved to wherever it washes up)
let nearBottle = null, bottleWasOut = null;
function updateBottles(t) {
  const B = bottles[0], msgs = CONFIG.bottles || [];
  const out = msgs.length > 0 && !!bottleNext && now() >= bottleNext.at && unlockedCount() >= BOTTLE_FIRST && state !== 'finale';
  if (out && B.spot !== bottleNext.spot) {   // place it where this one washed up
    B.spot = bottleNext.spot; B.d.copy(bottleSpots[B.spot]);
    B.base.copy(B.d).multiplyScalar(R + world.standHeight(B.d).h + 0.04);
    B.mesh.quaternion.setFromUnitVectors(AY, B.d).multiply(new THREE.Quaternion().setFromAxisAngle(AY, B.spot * 1.3));
  }
  B.mesh.visible = out;
  if (out) B.mesh.position.copy(B.base).addScaledVector(B.d, Math.sin(t * 1.5) * 0.03);
  if (bottleWasOut === false && out && state === 'play') { toast('🍾 Something washed up by the water…'); tone(988, 0, 0.4, 0.05, 'sine'); tone(1318, 0.15, 0.5, 0.04, 'sine'); }
  bottleWasOut = out;
}
function showBottle(k) {
  const b = (CONFIG.bottles || [])[k]; if (!b) return;
  const th = letterLang === 'th' && b.th;
  $('bottleTitle').textContent = th ? (b.th_title || b.title) : b.title;
  $('bottleText').textContent = th ? b.th : b.en; $('bottleText').classList.toggle('th', !!th);
  const img = $('bottleImg'); img.classList.add('hidden');
  if (b.image) { img.onload = () => img.classList.remove('hidden'); img.src = b.image; }
  openOverlay('bottleCard');
}
function openBottle(B) {
  const msgs = CONFIG.bottles || [], all = msgs.map((_, i) => i);
  const unread = all.filter(i => !bottleState.has(i)), pool = unread.length ? unread : all;
  const k = pool[Math.floor(Math.random() * pool.length)];
  bottleState.add(k); store.set('bday-bottles', JSON.stringify([...bottleState]));
  burst(B.mesh.position.clone(), 0xffffff, 16, 3, 0.5, 1); tone(660, 0, 0.2, 0.06, 'triangle'); tone(990, 0.1, 0.4, 0.05, 'triangle');
  scheduleBottle(bottleGap());   // the next one washes up a while later, somewhere else
  B.mesh.visible = false; nearBottle = null;
  showBottle(k);
}
$('btnCloseBottle').onclick = () => closeOverlay('bottleCard');

// ---------------------------------------------------------------- follow-the-leader (F: whistle)
let following = [];
function releaseFollowers() { for (const r of following) if (r.mode === 'follow') { r.mode = 'roam'; r.turnT = 0; } following = []; }
function whistle() {
  if (state !== 'play' || modalOpen || introLock) return;
  tone(1318.5, 0, 0.16, 0.06, 'sine'); tone(1760, 0.15, 0.25, 0.06, 'sine');
  if (following.length) { releaseFollowers(); return; }   // whistle again: off they go
  if (!known()) return;
  const me = girl.root.position;
  const cands = roamers.filter(r => ['roam', 'watch', 'chase'].includes(r.mode) && r.group.position.distanceTo(me) < 22)
    .sort((a, b) => a.group.position.distanceTo(me) - b.group.position.distanceTo(me)).slice(0, 6);
  if (!cands.length) { toast('🎶 …no one nearby heard'); return; }
  let lead = null;
  for (const r of cands) { r.mode = 'follow'; r.leader = lead; lead = r; burst(r.group.localToWorld(V(0, 1.9, 0)), 0xffffff, 2, 1.2, 0.5, 1.2, heartTex, false); }
  following = cands;
}

// ---------------------------------------------------------------- dancing on the stone stage (G)
let dancing = 0, danceNoteT = 0;
const isOnStage = () => !airborne && girlH > world.stage.top - 0.3 && girl.root.position.clone().normalize().angleTo(world.stage.dir) * R < world.stage.r;
function startDance() {
  if (state !== 'play' || modalOpen || introLock || dancing > 0 || gear.floating || !isOnStage()) return;
  dancing = 8;
  [72, 76, 79, 76, 77, 81, 84, 81, 79, 76, 72, 74, 76, 79, 84, 88].forEach((m, j) => tone(440 * Math.pow(2, (m - 69) / 12), j * 0.45, 0.35, 0.06, 'triangle'));
  for (const r of roamers) if (['roam', 'follow', 'watch', 'chase'].includes(r.mode) && r.group.position.distanceTo(girl.root.position) < 16) { r.wasFollow = r.mode === 'follow'; r.mode = 'dance'; r.danceT = 8; }
}

// ---------------------------------------------------------------- names for chouchous
let names = {}; try { names = JSON.parse(store.get('bday-names') || '{}'); } catch {}
let naming = null, labelFor = -1;
function askName(i) { naming = i; $('nameInput').value = names[i] || ''; openOverlay('nameCard'); setTimeout(() => $('nameInput').focus(), 60); }
function backToCatalogue() { closeOverlay('nameCard'); renderCatalogue(); openOverlay('catalogue'); }
$('btnSaveName').onclick = () => {
  const v = $('nameInput').value.trim();
  if (naming != null) { if (v) names[naming] = v; else delete names[naming]; store.set('bday-names', JSON.stringify(names)); labelFor = -1; }
  backToCatalogue();
};
$('btnCancelName').onclick = backToCatalogue;
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnSaveName').click(); if (e.key === 'Escape') backToCatalogue(); });
const nameLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(document.createElement('canvas')), transparent: true, depthWrite: false, depthTest: false }));
nameLabel.visible = false; nameLabel.renderOrder = 15; scene.add(nameLabel);
function updateNameLabel() {
  let best = null, bd = 3.8;
  if (state === 'play') for (const r of roamers) {
    if (!names[r.i] || r.mode === 'flung') continue;
    const d = r.group.position.distanceTo(girl.root.position);
    if (d < bd) { bd = d; best = r; }
  }
  nameLabel.visible = !!best;
  if (!best) return;
  if (labelFor !== best.i) {
    labelFor = best.i;
    const c = document.createElement('canvas'), x = c.getContext('2d'), font = '700 64px Gaegu, Mali, Quicksand, sans-serif';
    x.font = font; const w = Math.ceil(x.measureText(names[best.i]).width) + 50; c.width = w; c.height = 96;
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 12; x.strokeStyle = 'rgba(255,255,255,.95)'; x.strokeText(names[best.i], w / 2, 50); x.fillStyle = '#6b8f3c'; x.fillText(names[best.i], w / 2, 50);
    nameLabel.material.map?.dispose(); nameLabel.material.map = new THREE.CanvasTexture(c); nameLabel.material.map.colorSpace = THREE.SRGBColorSpace; nameLabel.material.needsUpdate = true;
    nameLabel.scale.set(0.42 * (w / 96), 0.42, 1);
  }
  nameLabel.position.copy(best.group.localToWorld(V(0, 2.35, 0)));
}

// ---------------------------------------------------------------- photo mode (C): a polaroid of the moment
function takePhoto() {
  if (state === 'intro' || modalOpen) return;
  const hide = [arrowPivot, nameLabel], was = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; });
  composer.render();
  const src = renderer.domElement;
  const pw = 1200, ph = Math.round(pw * src.height / src.width), pad = 46, foot = 150;
  const c = document.createElement('canvas'); c.width = pw + pad * 2; c.height = ph + pad + foot;
  const x = c.getContext('2d');
  x.fillStyle = '#fffdf7'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, pad, pad, pw, ph);
  hide.forEach((o, i) => { o.visible = was[i]; });
  x.textAlign = 'center';
  x.fillStyle = '#6b3d22'; x.font = '700 50px Gaegu, Caveat, cursive'; x.fillText('Birthday Planet ♥', c.width / 2, ph + pad + 72);
  const when = new Date(now()).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: CONFIG.timeZone });
  x.fillStyle = '#a37a55'; x.font = '500 28px Quicksand, sans-serif'; x.fillText(when, c.width / 2, ph + pad + 116);
  const url = c.toDataURL('image/png');
  $('photoImg').src = url;
  photoShot = { canvas: c, name: `birthday-planet-${new Date(now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png` };
  $('flash').classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => $('flash').classList.remove('on')));
  noiseSound(0.12, 3000, 0.08, 0.005); tone(1200, 0.05, 0.08, 0.05, 'square');
  setTimeout(() => openOverlay('photoCard'), 250);
}
// save the polaroid to her computer (a real file download, via a blob so big photos are fine)
let photoShot = null;
$('btnSavePhoto').onclick = () => {
  if (!photoShot) return;
  photoShot.canvas.toBlob(blob => {
    const a = document.createElement('a'), href = URL.createObjectURL(blob);
    a.href = href; a.download = photoShot.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    toast('📷 Saved to your downloads');
  }, 'image/png');
};
$('btnClosePhoto').onclick = () => { closeOverlay('photoCard'); if (finale?.ended) $('btnEndReopen').classList.remove('hidden'); };

// ---------------------------------------------------------------- a hello that depends on the hour
function greeting() {
  const h = hourOfDay();
  if (DEMO) return h >= 5 && h < 17 ? '☀️ Welcome, traveller' : '🌙 Welcome, traveller';
  if (h >= 5 && h < 11) return '☀️ Good morning, Cream';
  if (h >= 11 && h < 17) return '🌤️ Good afternoon, baobao';
  if (h >= 17 && h < 21) return '🌇 Good evening, my love';
  return '🌙 Still up, baobao?';
}

// ---------------------------------------------------------------- emoji + key chips, shown only when that key is useful right now
const sunny = () => { const h = hourOfDay(); return h > 9.5 && h < 16 && weather.rain < 0.1; };
const CHIPS = [
  { key: 'I', emo: '🌟', act: () => toggleGear('wand'), when: () => starFx.phase !== 'off' || starsMat.opacity > 0.55 },
  { key: 'P', emo: '☂️', act: () => toggleGear('parasol'), when: () => gear.parasol || weather.rain > 0.2 || sunny() },
  { key: 'O', emo: '🛟', act: () => floatPress(), when: () => !!floatHint },
  { key: 'G', emo: '💃', act: () => startDance(), when: () => dancing <= 0 && !gear.floating && isOnStage() },
  { key: 'F', emo: '🎶', act: () => whistle(), when: () => known() && (following.length > 0 || roamers.some(r => ['roam', 'watch', 'chase'].includes(r.mode) && r.group.position.distanceTo(girl.root.position) < 14)) },
  { key: 'C', emo: '📷', act: () => takePhoto(), when: () => rainbow.visible || dancing > 0 || gear.floating || following.length > 0 || isDuskHour(hourOfDay()) || idleT > 25 },
];
for (const c of CHIPS) {
  c.el = document.createElement('button'); c.el.className = 'chip glass hidden';
  c.el.innerHTML = `<span>${c.emo}</span><kbd>${c.key}</kbd>`;
  c.el.addEventListener('click', e => { e.preventDefault(); c.act(); });
  $('keyDock').appendChild(c.el); c.on = false;
}
function updateKeyDock() {
  const play = state === 'play' && !modalOpen && !introLock && t0Ready();
  const orbiting = state === 'finale' && finale?.ended && !modalOpen;   // during the ending's orbit: photos only
  for (const c of CHIPS) {
    const on = play ? !!c.when() : orbiting && c.key === 'C';
    if (on !== c.on) { c.on = on; c.el.classList.toggle('hidden', !on); }
  }
}
const t0Ready = () => !(lastT < diveUntil);   // not during the opening swoop

// ---------------------------------------------------------------- demo: after the ending, back onto the planet to wander at leisure
function returnToPlanet() {
  const f = finale; if (!f?.ended) return;
  closeOverlay('ending'); $('btnEndReopen').classList.add('hidden'); $('orbitHint').classList.add('hidden');
  // her, back on her feet; the strawberry boy tucked away
  scene.attach(girl.root); girl.root.scale.setScalar(1);
  girl.rig.position.set(0, 0, 0); girl.rig.rotation.set(0, 0, 0); girl.parts.head.rotation.set(0, 0, 0);
  const couple = f.orbit?.items[0]?.obj; cake.add(bean); bean.visible = false; if (couple) scene.remove(couple);
  // the giant chouchou floats off for good; everyone else lands back where they were
  if (f.giant) scene.remove(f.giant.obj);
  for (const r of roamers) {
    planetGroup.add(r.group); r.group.scale.setScalar(1);
    Object.assign(r, { mode: 'roam', home: null, armed: false, turnT: 0, pause: 1 + Math.random() * 2, t: 0 });
    r.ch.root.position.set(0, 0, 0); r.ch.root.rotation.set(0, 0, 0); r.ch.root.scale.setScalar(1); r.ch.shades.visible = false;
    for (const ft of r.ch.feet || []) ft.rotation.set(0, 0, 0);
    for (const l of r.ch.leaves) l.rotation.x = 0;
    placeRoamer(r);
  }
  flung.length = 0; WATER_SPOTS.forEach(sp => { sp.taken = null; });
  planetGroup.visible = true; planetGroup.scale.setScalar(1); planetGroup.position.set(0, 0, 0);
  cake.visible = false; shake = 0;
  statue.giant = null; statue.state = 'stone';
  finale = null; state = 'play';
  enterPostGame();
  vy = 0; airborne = false; girlH = floorAt(AY.clone().applyQuaternion(pq), 99);
  // a gentle swoop back down to her, like the first time
  dive = { from: camera.position.clone(), look: camLook.clone(), up: camera.up.clone() }; diveUntil = lastT + DIVE;
  $('hud').classList.remove('hidden'); $('status').classList.remove('hidden');
  playMusic('planet');
  if (!weather.rained) weather.next = weather.played + 45;   // a shower still to come
  setTimeout(() => toast('🌍 Welcome back, traveller · take your time'), DIVE * 1000 + 300);
  updateTimeUI();
}
$('btnBackToPlanet').onclick = returnToPlanet;

// ---------------------------------------------------------------- afterwards: free roam, with the strawberry boy tagging along
let postGame = false;
const berryPal = { q: new THREE.Quaternion(), group: null, moving: false, walk: 0 };   // (group = him, linked when post-game starts)
function enterPostGame() {
  postGame = true; berryPal.group = boyPal.root;
  if (!statue.giant) { statue.state = 'stone'; wakeStatue(true); }
  statue.state = 'post'; statue.t = 0;
  cake.visible = false;
  // the empty strawberry (bite mark and all) drifts in space among the elephant clouds, circling the planet with them
  cloudPivot.add(bean); bean.visible = true; bean.scale.setScalar(0.42); bean.rotation.set(0.4, 0, 0.3);
  bean.position.set(0.55, 0.7, -0.45).normalize().multiplyScalar(R + 13);
  sb.pop = [0, 0, 0]; sb.bite.scale.setScalar(1); sb.blush.opacity = 0; poseBerryBoy(0, 0);
  // and he walks with her, just behind
  boyPal.root.visible = true;
  berryPal.q.copy(pq).multiply(new THREE.Quaternion().setFromAxisAngle(AX, -2.4 / R));
  updateTimeUI();
}
function updateBerryPal(dt, t) {
  if (!postGame || state !== 'play') return;
  const me = AY.clone().applyQuaternion(pq), him = AY.clone().applyQuaternion(berryPal.q), d = me.angleTo(him) * R;
  berryPal.moving = d > 2.4;
  if (berryPal.moving) walkToward(berryPal, me, clamp(d * 1.8, 2, 7), dt, 2.2);   // walks after her (waits at the water's edge)
  else turnToward(berryPal, girl.root.position, dt * 0.5);
  const at = AY.clone().applyQuaternion(berryPal.q);
  const onStageTop = at.angleTo(world.stage.dir) * R < world.stage.r;   // (only if he started up there with her)
  boyPal.root.position.copy(at).multiplyScalar(R + (onStageTop ? world.stage.top : world.standHeight(at).h));
  boyPal.root.quaternion.copy(berryPal.q);
  berryPal.walk = lerp(berryPal.walk, berryPal.moving ? 1 : 0, 0.15);
  animateCharacter(boyPal, t, berryPal.walk, 'walk');
  bean.rotation.x += dt * 0.12; bean.rotation.z += dt * 0.07;   // the strawberry tumbling slowly out there
}

function updateLife(dt, t) {
  updateWeather(dt, t);
  updateFireflies(t);
  updateButterflies(t);
  updateBottles(t);
  updateNameLabel();
  updateBerryPal(dt, t);
  // a wish can be made while a shooting star is crossing (and a moment after)
  wishWindow -= dt;
  if (state === 'play' && shooting.visible && shooting.material.opacity > 0.15 && !shoot.wished) wishWindow = 2.2;
  updateKeyDock();
  // the bubble above her head
  const wantBubble = wishWindow > 0 && state === 'play' && !modalOpen;
  wishPop = clamp(wishPop + (wantBubble ? dt * 4 : -dt * 3), 0, 1);
  wishBubble.visible = wishPop > 0.01;
  if (wishBubble.visible) {
    const e = easeOutBack(wishPop);
    wishBubble.position.copy(girl.root.localToWorld(V(0, 4.1 + Math.sin(t * 4) * 0.08, 0)));
    wishBubble.scale.set(2.3 * e, 0.92 * e, 1);
    wishBubble.material.opacity = Math.min(1, wishPop * 1.5);
  }
}

// ============================================================ berries
let berries = Number(store.get('bday-berries') || 0);
const flying = [];
const berryGeo = new THREE.SphereGeometry(0.16, 12, 8);
const berryMat = new THREE.MeshPhysicalMaterial({ color: 0xe0322a, roughness: 0.3, clearcoat: 0.6 });
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
let actionPose = null;   // { pose, t } — reaching up to pick, or holding a berry out
function updateBerryHUD(bump) {
  $('berryPill').classList.toggle('hidden', berries <= 0);
  $('berryCount').textContent = berries;
  if (bump) { $('berryPill').classList.remove('bump'); void $('berryPill').offsetWidth; $('berryPill').classList.add('bump'); }
  store.set('bday-berries', String(berries));
}
// a berry flying along a little arc; `to` can be a function so it follows a moving target
function flyBerry(from, to, dur, onDone) {
  const m = new THREE.Mesh(berryGeo, berryMat); m.position.copy(from); scene.add(m);
  flying.push({ m, from: from.clone(), to, dur, t: 0, onDone });
}
function updateBerries(dt) {
  for (let k = flying.length - 1; k >= 0; k--) {
    const f = flying[k]; f.t += dt;
    const p = Math.min(1, f.t / f.dur), to = typeof f.to === 'function' ? f.to() : f.to;
    f.m.position.lerpVectors(f.from, to, ease(p)).addScaledVector(to.clone().normalize(), Math.sin(Math.PI * p) * 0.9);
    if (p >= 1) { scene.remove(f.m); flying.splice(k, 1); f.onDone?.(); }
  }
  // picked berries grow back after a while
  for (const tr of world.berryTrees) for (const sl of tr.slots) if (!sl.present && (sl.regrow -= dt) <= 0) {
    sl.present = true; world.fruitI.setMatrixAt(sl.idx, sl.base); world.fruitI.instanceMatrix.needsUpdate = true;
  }
  if (actionPose && (actionPose.t -= dt) <= 0) actionPose = null;
}
const handPos = () => girl.root.localToWorld(V(0, 1.45, 0.5));
function faceToward(p) {
  const rel = p.clone().sub(girl.root.position).applyQuaternion(pq.clone().invert());
  faceTarget = Math.atan2(rel.x, rel.z);
}
function pickBerry(tree) {
  const sl = tree.slots.find(x => x.present); if (!sl) return;
  sl.present = false; sl.regrow = 45 + Math.random() * 30;
  world.fruitI.setMatrixAt(sl.idx, ZERO); world.fruitI.instanceMatrix.needsUpdate = true;
  actionPose = { pose: 'reach', t: 0.55 };
  faceToward(sl.pos);
  burst(sl.pos, 0x8fd06a, 5, 2, 0.35, 0.6, glowTex, false);
  tone(880, 0, 0.1, 0.06, 'triangle');
  flyBerry(sl.pos, handPos, 0.5, () => { berries++; updateBerryHUD(true); tone(1320, 0, 0.12, 0.07, 'triangle'); });
}
function feed(r) {
  if (berries <= 0) return;
  berries--; updateBerryHUD(true);
  actionPose = { pose: 'offer', t: 0.75 };
  faceToward(r.group.position);
  r.feeding = true;
  flyBerry(handPos(), () => r.group.localToWorld(V(0, 0.66, 0.75)), 0.45, () => {
    r.feeding = false; r.munch = 1.8;
    tone(520, 0, 0.08, 0.08, 'square'); tone(440, 0.14, 0.08, 0.08, 'square'); tone(600, 0.3, 0.12, 0.06, 'triangle');
    burst(r.group.localToWorld(V(0, 1.7, 0.3)), 0xffffff, 3, 1.6, 0.6, 1.3, heartTex, false);
  });
}
// ============================================================ particles
const particles = [];
function burst(pos, color, n = 30, speed = 6, size = 0.6, life = 1.2, tex = glowTex, additive = true) {
  for (let k = 0; k < n; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.position.copy(pos); s.scale.setScalar(size); scene.add(s);
    const vel = randDir(Math.random).multiplyScalar(speed * (0.3 + Math.random() * 0.7));
    particles.push({ s, vel, life, max: life, size });
  }
}
function updateParticles(dt) {
  for (let k = particles.length - 1; k >= 0; k--) {
    const p = particles[k];
    p.life -= dt;
    p.s.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(0.96);
    p.s.material.opacity = clamp(p.life / p.max, 0, 1);
    if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); particles.splice(k, 1); }
  }
}

// ============================================================ audio
let actx = null, muted = store.get('bday-muted') === '1';
// one shared audio context, created on her first click / key press (browsers require a gesture)
let music = null, wantedTrack = null;
function getAudio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      music = createMusic(actx, CONFIG.music || {}); music.setMuted(muted);
      if (wantedTrack) music.play(wantedTrack);
      document.querySelectorAll('.music-hint').forEach(el => el.classList.add('hidden'));
    }
    if (actx.state === 'suspended') actx.resume();
  } catch {}
}
function playMusic(name) { wantedTrack = name; music?.play(name); }
addEventListener('pointerdown', getAudio, true);
addEventListener('keydown', getAudio, true);
function tone(freq, when, dur = 0.5, vol = 0.15, type = 'sine') {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, actx.currentTime + when);
  g.gain.linearRampToValueAtTime(vol, actx.currentTime + when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + when + dur);
  o.connect(g).connect(actx.destination); o.start(actx.currentTime + when); o.stop(actx.currentTime + when + dur + 0.05);
}
const chime = () => [880, 1108.7, 1318.5].forEach((f, k) => tone(f, k * 0.12, 0.8));
const popSound = () => { tone(300, 0, 0.15, 0.2, 'square'); tone(900, 0.06, 0.4, 0.15, 'triangle'); };
const tugSound = () => tone(180 + Math.random() * 120, 0, 0.08, 0.06, 'triangle');
const collectSound = () => [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, k) => tone(f, k * 0.08, 0.6, 0.12, 'triangle'));

// ============================================================ UI
let state = 'intro';
let introLock = false;   // true until she's read the controls on her first visit
let modalOpen = false;
let lastUnlocked = unlockedCount();
const pendingFinale = { v: false };

function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p2 = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p2(m)}:${p2(ss)}` : `${m}:${p2(ss)}`;
}
function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast glass'; el.textContent = msg;
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 4200);
}
function notify(title, body) {
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch {}
}
function updateBell() {
  const on = 'Notification' in window && Notification.permission === 'granted';
  $('btnBell').textContent = on ? '🔔' : '🔕';
}
async function askNotify() {
  if (!('Notification' in window)) { toast('This browser can’t send reminders, but I’ll chime here 🎐'); return; }
  const r = await Notification.requestPermission();
  updateBell();
  toast(r === 'granted' ? 'Reminders on! 🔔' : 'Reminders off — I’ll still chime here 🎐');
}

function updateTimeUI() {
  { const h = hourOfDay(), p2 = n => String(n).padStart(2, '0');
    $('clock').textContent = DEMO ? `${p2(Math.floor(h))}:${p2(Math.floor((h % 1) * 60))}` : new Date(now()).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }); }
  const u = unlockedCount();
  let waiting = 0, holding = 0;
  for (let i = 0; i < u; i++) { if (!pulled.has(i)) waiting++; else if (!collected.has(i)) holding++; }
  $('count').textContent = `${collected.size}/${TOTAL}`;
  $('catBadge').textContent = collected.size;
  const st = $('status');
  st.classList.toggle('ready', waiting + holding > 0);
  const dot = '<span class="dot"></span>';
  const next = '';   // after the first hour there are no countdowns: chouchous just turn up
  if (state === 'finale') st.classList.add('hidden');
  else if (collected.size === TOTAL) {
    st.innerHTML = postGame ? `${dot}${wishesLeft() || bottlesLeft() ? `🌠 ${wishesLeft()} wishing star${wishesLeft() === 1 ? '' : 's'} · 🍾 ${bottlesLeft()} bottle${bottlesLeft() === 1 ? '' : 's'} left to find` : 'You found every wish and every bottle ♥'}` : statue.state === 'done' ? `${dot}Take your time · there's more to find` : statue.state === 'awake' ? `${dot}The giant chouchou is waiting on the stone stage` : `${dot}All ${TOTAL} letters found · go back to the stone chouchou`;
  } else if (u === 0) st.innerHTML = `${dot}The planet is quiet… for now`;
  else if (waiting > 0) st.innerHTML = known()
    ? `${dot}${waiting > 1 ? waiting + ' chouchous are' : 'A chouchou is'} stuck${next}`
    : `${dot}Something is glowing on the planet${next}`;
  else if (holding > 0) st.innerHTML = `${dot}A chouchou has a letter for you${next}`;
  else st.innerHTML = known() ? `${dot}The chouchous are resting · more will come` : `${dot}All is quiet · something new will come`;
  // the very first hour: a little countdown so she knows something is on its way
  const firstWait = state === 'play' && u === 0 && now() >= openMs;
  $('firstTimer').classList.toggle('hidden', !firstWait);
  if (firstWait) $('ftTime').textContent = fmtDur(startMs - now());
  if (u > lastUnlocked) {
    toast(known() ? '🥬 A chouchou got stuck somewhere — follow the glow' : '✨ Something is glowing somewhere — follow the light');
    chime();
    if (known()) notify('🥬 A chouchou is stuck!', 'Go pull it out — it has a letter for you 💌');
    else notify('✨ Something is glowing on your planet', 'Go and see what it is…');
  }
  lastUnlocked = u;
}

function renderCatalogue() {
  const grid = $('grid'); grid.innerHTML = '';
  // messages in bottles she's opened, to read again
  const shelf = $('bottleShelf'); shelf.innerHTML = '';
  const opened = [...bottleState].sort((a, b) => a - b);
  if (opened.length) {
    shelf.innerHTML = '<div class="eyebrow">messages in bottles</div>';
    for (const k of opened) {
      const b = (CONFIG.bottles || [])[k]; if (!b) continue;
      const btn = document.createElement('button'); btn.textContent = '🍾 ' + (letterLang === 'th' && b.th_title ? b.th_title : b.title);
      btn.onclick = () => { closeOverlay('catalogue'); showBottle(k); }; shelf.appendChild(btn);
    }
  }
  const u = unlockedCount();
  $('catTitle').textContent = known() ? 'Your chouchous' : 'Your treasures';
  $('catSummary').textContent = `${collected.size} of ${TOTAL} letters received`;
  // one slot per letter, in order: received ones first, then chouchous still holding theirs, then stuck ones, then the hours to come
  const got = lettersGiven();
  let holding = 0; for (let i = 0; i < u; i++) if (pulled.has(i) && !collected.has(i)) holding++;
  for (let i = 0; i < TOTAL; i++) {
    const el = document.createElement('button');
    const L = CONFIG.letters[i] || {};
    if (i < got) {
      const c = chouchouOf(i);   // colour + flower of the chouchou that brought it
      el.className = 'slot collected';
      el.style.setProperty('--c', '#' + new THREE.Color(PALETTE[c % PALETTE.length]).getHexString());
      el.innerHTML = `<span class="em">🐣${EMOJI[c % EMOJI.length]}</span><b></b>`;
      el.querySelector('b').textContent = L.title || `Hour ${i + 1}`;
      el.onclick = () => { closeOverlay('catalogue'); openLetter(i); };
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = names[c] || ''; el.appendChild(nm);   // the chouchou who brought it
      const rn = document.createElement('span'); rn.className = 'rename'; rn.textContent = names[c] ? '✏️' : '✏️ name'; rn.title = 'Name this chouchou';
      rn.onclick = e => { e.stopPropagation(); closeOverlay('catalogue'); askName(c); }; el.appendChild(rn);
    } else if (i < got + holding) {
      el.className = 'slot waiting';
      el.innerHTML = `<span class="em">🐣💌</span><b>Hour ${i + 1}</b><span>Has a letter for you!</span>`;
      el.onclick = () => closeOverlay('catalogue');
    } else if (i < u) {
      el.className = 'slot waiting';
      el.innerHTML = known() ? `<span class="em">🥬</span><b>Hour ${i + 1}</b><span>Stuck in the ground!</span>` : `<span class="em">✨</span><b>Hour ${i + 1}</b><span>Glowing somewhere</span>`;
      el.onclick = () => closeOverlay('catalogue');
    } else {
      el.className = 'slot locked';
      el.innerHTML = `<span class="em">🔒</span><b>Hour ${i + 1}</b><span>${DEMO ? 'soon' : new Date(unlockTime(i)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    }
    grid.appendChild(el);
  }
}

function openOverlay(id) { $(id).classList.add('open'); modalOpen = true; }
function closeOverlay(id) {
  $(id).classList.remove('open');
  modalOpen = ['intro', 'controls', 'firstSeen', 'offer', 'gift', 'letter', 'catalogue', 'ending', 'bottleCard', 'photoCard', 'nameCard'].some(k => $(k).classList.contains('open'));
}
const known = () => pulled.size > 0;   // she only learns what a chouchou is when she pulls out the first one
{
}

// the flower this chouchou carried, drawn beside the letter
function flowerSVG(hex) {
  const petals = Array.from({ length: 6 }, (_, k) =>
    `<ellipse cx="62" cy="52" rx="13" ry="25" transform="rotate(${k * 60} 62 78)" fill="${hex}" stroke="rgba(0,0,0,.12)" stroke-width="1"/>`).join('');
  return `<path d="M58 298 C52 230 70 170 62 84" stroke="#5f9a46" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M60 220 C38 206 26 214 18 226 C34 232 48 230 60 220Z" fill="#78b25a"/>
    <path d="M63 170 C84 156 98 162 104 174 C90 180 76 178 63 170Z" fill="#6aa64f"/>
    ${petals}<circle cx="62" cy="78" r="12" fill="#ffd54a"/><circle cx="58" cy="74" r="4" fill="#ffe89a"/>`;
}
// letters can be read in English or Thai (her choice is remembered)
let letterLang = store.get('bday-lang') === 'th' ? 'th' : 'en', openLetterIdx = 0;
$('btnLang').onclick = () => { letterLang = letterLang === 'th' ? 'en' : 'th'; store.set('bday-lang', letterLang); openLetter(openLetterIdx, true); document.fonts?.load('20px Mali').then(fitLetter); };
function openLetter(i, relang = false) {
  openLetterIdx = i;
  const EN = CONFIG.letters[i] || {}, th = letterLang === 'th' && THAI[i];
  const L = th ? { ...EN, ...THAI[i] } : EN;
  $('letter').classList.toggle('th', !!th);
  $('btnLang').textContent = th ? 'EN' : 'ไทย';
  $('letterWith').textContent = th ? SIGN.th : SIGN.en;
  $('letterHour').textContent = L.time ? `${L.time} · ${L.n}` : L.n ? `letter ${L.n}` : `chouchou ${i + 1} of ${TOTAL}`;
  $('letterTitle').textContent = L.title || ''; $('letterSub').textContent = L.sub || '';
  $('mono').textContent = $('sealMono').textContent = CONFIG.monogram || '♥';
  $('letterGreet').textContent = L.greet || `My dearest ${CONFIG.herName.replace(/^my\s+/i, '')},`;
  $('letterFrom').textContent = CONFIG.fromName || '';
  $('letterText').replaceChildren(...(L.text || '').split('\n').map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
  const c = chouchouOf(i);   // the flower its chouchou carried
  $('letterFlower').innerHTML = flowerSVG('#' + new THREE.Color(PALETTE[(Number.isNaN(c) ? i : c) % PALETTE.length]).getHexString());
  const img = $('letterImg'), body = $('letterBody');
  img.classList.add('hidden'); body.classList.add('hidden');
  if (L.image && !th) {
    img.onload = () => img.classList.remove('hidden');
    img.onerror = () => body.classList.remove('hidden');
    img.src = L.image;
  } else body.classList.remove('hidden');
  openOverlay('letter');
  fitLetter();
}
// the letter never scrolls: shrink the writing until the whole page fits the window
function fitLetter() {
  const paper = document.querySelector('#letter .paper'), body = $('letterBody'), head = $('letterHead');
  if (!$('letter').classList.contains('open')) return;
  let fs = 24;
  const fits = () => paper.scrollHeight <= innerHeight - 36;
  do { body.style.fontSize = head.style.fontSize = `${fs}px`; fs -= 0.5; } while (!fits() && fs >= 12);
}
addEventListener('resize', fitLetter);
document.fonts?.ready.then(fitLetter);

$('btnStart').onclick = () => {
  getAudio(); playMusic('planet');
  closeOverlay('intro');
  state = 'play'; diveUntil = lastT + DIVE;
  if (DEMO && !Number.isFinite(startMs)) { startMs = now() + 30000; store.set('start', String(startMs)); }
  setTimeout(() => toast(greeting()), DIVE * 1000 + 400);
  girl.root.visible = true;
  dive = { from: camera.position.clone(), look: camLook.clone(), up: camera.up.clone() };
  $('hud').classList.remove('hidden');
  if (matchMedia('(pointer: coarse)').matches) { $('joystick').classList.remove('hidden'); $('btnJump').classList.remove('hidden'); }
  // first visit: show the controls once she's landed; she can't move until she's read them
  if (store.get('bday-hint-ack') !== '1') { introLock = true; setTimeout(() => { $('controls').classList.remove('full'); openOverlay('controls'); }, 2600); }
  let waiting = 0; for (let i = 0; i < unlockedCount(); i++) if (!pulled.has(i)) waiting++;
  if (waiting) setTimeout(() => toast(known() ? `🥬 ${waiting > 1 ? waiting + ' chouchous are' : 'A chouchou is'} waiting for you` : '✨ Something is glowing on the planet…'), 2600);
};
$('btnIntroBell').onclick = askNotify;
$('btnControlsOk').onclick = () => { store.set('bday-hint-ack', '1'); introLock = false; closeOverlay('controls'); };
$('btnHelp').onclick = () => { $('controls').classList.add('full'); openOverlay('controls'); };
$('btnFsOk').onclick = () => closeOverlay('firstSeen');
// Enter / Space dismiss these little cards from the keyboard
addEventListener('keydown', e => {
  if (e.code !== 'Enter' && e.code !== 'Space') return;
  if ($('controls').classList.contains('open')) { e.preventDefault(); e.stopImmediatePropagation(); $('btnControlsOk').click(); }
  else if ($('firstSeen').classList.contains('open') && !$('btnFsOk').classList.contains('hidden')) { e.preventDefault(); e.stopImmediatePropagation(); $('btnFsOk').click(); }
}, true);
// the first time she comes near something glowing: "What's that?"
function firstEncounter(b) {
  store.set('bday-first-seen', '1');
  faceToward(b.position);
  $('fsStep2').classList.add('hidden'); $('btnFsOk').classList.add('hidden');
  openOverlay('firstSeen');
  tone(660, 0, 0.25, 0.06, 'sine'); tone(990, 0.18, 0.4, 0.05, 'sine');
  setTimeout(() => { $('fsStep2').classList.remove('hidden'); $('btnFsOk').classList.remove('hidden'); }, 1600);
}
$('btnBell').onclick = askNotify;
$('btnSound').onclick = () => { muted = !muted; store.set('bday-muted', muted ? '1' : '0'); $('btnSound').textContent = muted ? '🔇' : '🔊'; music?.setMuted(muted); };
$('btnSound').textContent = muted ? '🔇' : '🔊';
$('btnCat').onclick = () => { renderCatalogue(); openOverlay('catalogue'); };
$('btnCloseCat').onclick = () => { closeOverlay('catalogue'); if (finale?.ended) $('btnEndReopen').classList.remove('hidden'); };
$('btnCloseLetter').onclick = () => {
  closeOverlay('letter');
  if (store.get('bday-name-hint') !== '1' && collected.size >= 1 && !pendingFinale.v) { store.set('bday-name-hint', '1'); setTimeout(() => toast('✏️ You can give your chouchous names, in the 📖'), 900); }
  if (finale?.ended) $('btnEndReopen').classList.remove('hidden');
  if (pendingFinale.v) { pendingFinale.v = false; setTimeout(() => { toast('💫 The stone chouchou is glowing… go back to it'); chime(); }, 900); }
};
$('letter').addEventListener('click', e => { if (e.target.id === 'letter') $('btnCloseLetter').click(); });
$('btnEndCat').onclick = () => { closeOverlay('ending'); renderCatalogue(); openOverlay('catalogue'); };
// the ending card can be put away to just watch everyone orbit the planet, and brought back any time
const hideEnding = () => { closeOverlay('ending'); $('btnEndReopen').classList.remove('hidden'); $('orbitHint').classList.remove('hidden'); };
$('btnEndClose').onclick = hideEnding;
$('ending').addEventListener('click', e => { if (e.target.id === 'ending') hideEnding(); });
$('btnEndReopen').onclick = () => { $('btnEndReopen').classList.add('hidden'); $('orbitHint').classList.add('hidden'); openOverlay('ending'); };
addEventListener('wheel', e => { if (finale?.phase === 'orbit' && !modalOpen) finale.wheel = (finale.wheel || 0) + e.deltaY; }, { passive: true });
addEventListener('keydown', e => { if (e.code === 'Escape' && $('ending').classList.contains('open')) hideEnding(); });
// ---------------- the opening story: a few lines, then the birthday password
const STORY = [
  '<small>somewhere beyond the clouds</small>A tiny planet drifts quietly through the sky.',
  'Its meadows are soft, its water is warm,<br>and its trees bear sweet red berries.',
  'But it keeps its secrets well.<br>They are hidden, waiting, for one person only.',
  'For one whole day, the planet will whisper to you.<br>Follow its glow, and you will find what it has been keeping.',
];
let storyStep = -1;
function showStoryLine(html) {
  const el = $('storyLine'); el.classList.remove('show'); void el.offsetWidth;
  el.innerHTML = html; requestAnimationFrame(() => el.classList.add('show'));
}
function storyNext() {
  storyStep++;
  if (storyStep < STORY.length) {
    showStoryLine(STORY[storyStep]);
    $('storyNext').classList.remove('show'); setTimeout(() => $('storyNext').classList.add('show'), 50);
  } else {
    $('storyNext').classList.add('hidden'); $('storyLine').classList.remove('show');
    $('gate').classList.remove('hidden'); setTimeout(() => dials[0].el.focus(), 100);
  }
}
function welcome(back) {
  $('gate').classList.add('hidden'); $('storyNext').classList.add('hidden');
  showStoryLine(back ? `Welcome back, ${CONFIG.herName}.` : `Welcome, ${CONFIG.herName}.<br>The planet has been waiting for you.`);
  setTimeout(() => $('welcomeActions').classList.remove('hidden'), back ? 600 : 1400);
  if (!back) { tone(659.3, 0, 1.2, 0.08); tone(880, 0.25, 1.2, 0.08); tone(1318.5, 0.5, 1.6, 0.07); }
}
$('storyNext').onclick = () => { getAudio(); storyNext(); };
// ---- the combination padlock: four scrolling dials, DD / MM
const ROW = 30;   // px per digit on a dial
const dials = [...document.querySelectorAll('#lock .dial')].map((el, i) => {
  const strip = document.createElement('div'); strip.className = 'strip';
  for (let r = 0; r < 3; r++) for (let n = 0; n < 10; n++) strip.insertAdjacentHTML('beforeend', `<span>${n}</span>`);
  el.appendChild(strip);
  return { el, strip, i, pos: 10 };   // pos indexes the middle copy of 0–9; the dial shows the digit at pos
});
const dialValue = d => ((d.pos % 10) + 10) % 10;
function renderDial(d, instant) {
  d.strip.classList.toggle('jump', !!instant);
  d.strip.style.transform = `translateY(${(1 - d.pos) * ROW - 12}px)`;   // centre the current digit in the 66px window
}
function turn(d, step) {
  if (unlocking) return;
  d.pos += step;
  renderDial(d);
  tone(1500 + Math.random() * 300, 0, 0.03, 0.05, 'square');   // little click
  clearTimeout(d.wrap);
  d.wrap = setTimeout(() => { if (d.pos < 5 || d.pos > 24) { d.pos = 10 + dialValue(d); renderDial(d, true); } }, 260);   // seamless wrap
  $('gateMsg').textContent = '';
}
let unlocking = false;
// only checked when she presses "Open"
function checkLock() {
  const [a, b, c, e] = dials.map(dialValue), day = a * 10 + b, month = c * 10 + e;
  const today = new Date();   // the demo's lock opens to today's date (the visitor's own day and month)
  const want = DEMO ? { day: today.getDate(), month: today.getMonth() + 1 } : CONFIG.birthday;
  if (day === want.day && month === want.month) {
    unlocking = true;
    setTimeout(() => {
      $('lock').classList.add('open');
      tone(784, 0, 0.6, 0.08, 'triangle'); tone(1046.5, 0.12, 0.7, 0.08, 'triangle'); tone(1568, 0.26, 0.9, 0.07, 'triangle');
      store.set('bday-unlocked', '1');
      setTimeout(() => welcome(false), 1100);
    }, 150);
    return true;
  }
  return false;
}
for (const d of dials) {
  renderDial(d, true);
  let acc = 0, dragY = null;
  let lastWheel = 0;
  d.el.addEventListener('wheel', e => {
    e.preventDefault();
    const now = performance.now();
    if (Math.abs(e.deltaY) >= 50) {   // a mouse-wheel notch: exactly one click
      if (now - lastWheel > 70) { turn(d, Math.sign(e.deltaY)); lastWheel = now; }
      return;
    }
    acc += e.deltaY;                  // trackpad: small deltas add up
    if (Math.abs(acc) >= 45 && now - lastWheel > 60) { turn(d, Math.sign(acc)); acc = 0; lastWheel = now; }
  }, { passive: false });
  d.el.addEventListener('pointerdown', e => { d.el.setPointerCapture(e.pointerId); dragY = e.clientY; d.dragged = false; d.el.focus(); });
  d.el.addEventListener('pointermove', e => {
    if (dragY === null) return;
    const dy = e.clientY - dragY;
    if (Math.abs(dy) >= 22) { turn(d, dy > 0 ? -1 : 1); dragY = e.clientY; d.dragged = true; }   // drag down shows the smaller number
  });
  d.el.addEventListener('pointerup', e => {
    if (!d.dragged) { const r = d.el.getBoundingClientRect(); turn(d, e.clientY < r.top + r.height / 2 ? -1 : 1); }   // click top/bottom half
    dragY = null;
  });
  d.el.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { turn(d, -1); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { turn(d, 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { dials[Math.max(0, d.i - 1)].el.focus(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { dials[Math.min(3, d.i + 1)].el.focus(); e.preventDefault(); }
    else if (/^[0-9]$/.test(e.key)) { turn(d, Number(e.key) - dialValue(d)); dials[Math.min(3, d.i + 1)].el.focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); $('gate').requestSubmit(); }
    e.stopPropagation();
  });
}
$('gate').onsubmit = e => {
  e.preventDefault();
  if (unlocking) return;
  if (checkLock()) return;
  $('gateMsg').textContent = DEMO ? 'Hmm… that doesn\'t seem to be today.' : 'Hmm… the planet doesn\'t recognise that date.';
  $('gate').classList.remove('shake'); void $('gate').offsetWidth; $('gate').classList.add('shake');
};
addEventListener('keydown', e => {   // Enter also moves the story along
  if (e.code === 'Enter' && $('intro').classList.contains('open') && !$('storyNext').classList.contains('hidden')) $('storyNext').click();
});
// ---- before the planet wakes: a quiet waiting page with a countdown
let waitingMode = false;
function beginIntro() { if (store.get('bday-unlocked') === '1') welcome(true); else storyNext(); }
function updateWaiting() {
  if (!waitingMode) return;
  const ms = openMs - now();
  if (ms <= 0) {   // it's time: the planet wakes up
    waitingMode = false;
    $('waiting').classList.add('hidden'); $('storyBox').classList.remove('hidden');
    $('intro').classList.remove('sleeping');
    tone(523.3, 0, 1.4, 0.07); tone(784, 0.3, 1.4, 0.07); tone(1046.5, 0.6, 1.8, 0.06);
    setTimeout(beginIntro, 1800);
    return;
  }
  const sTot = Math.floor(ms / 1000), p2 = n => String(n).padStart(2, '0');
  $('cdD').textContent = Math.floor(sTot / 86400);
  $('cdH').textContent = p2(Math.floor(sTot / 3600) % 24);
  $('cdM').textContent = p2(Math.floor(sTot / 60) % 60);
  $('cdS').textContent = p2(sTot % 60);
}
playMusic('waiting');
if (now() < openMs) {
  waitingMode = true;
  const tz = CONFIG.timeZone, opts = { day: 'numeric', month: 'long', timeZone: tz };
  const when = new Date(openMs).toLocaleDateString('en-GB', opts);
  const time = new Date(openMs).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).replace(':00', '').replace(' ', '');
  if (DEMO) $('wakeNote').textContent = 'This is a condensed, ten-minute version of a birthday gift that unfolds over twenty-four hours: three little surprises, three letters, a whole day in ten minutes. The planet wakes in a few seconds…';
  else $('wakeNote').textContent = `It wakes on ${when} at ${time === '12am' ? 'midnight' : time}${CONFIG.timeZoneName ? ` (${CONFIG.timeZoneName})` : ''}. Come back then — it will be waiting for you.`;
  $('waiting').classList.remove('hidden'); $('storyBox').classList.add('hidden');
  $('intro').classList.add('sleeping');
  updateWaiting();
  setInterval(updateWaiting, 1000);
} else beginIntro();
$('endTitle').textContent = DEMO ? 'Thank you for visiting ♥' : `Happy Birthday, ${CONFIG.herName}`;
if (DEMO) {
  $('endText').textContent = 'A ten-minute taste of a birthday gift that unfolds over twenty-four hours. Thank you for playing.';
  $('gate').querySelector('h1').textContent = 'Whisper today\'s date';
  $('gate').querySelector('p').textContent = 'Enter today\'s date: the day, then the month.';
  $('btnBell').classList.add('hidden'); $('btnIntroBell').classList.add('hidden');
  $('endMore').classList.remove('hidden'); $('btnBackToPlanet').classList.remove('hidden'); $('btnEndCat').classList.add('soft');
}
$('giftTitle').textContent = `Give the ${TOTAL} flowers to the giant chouchou?`;
updateBell();

// debug panel: open the page with ?debug to time-travel while testing
if (DEBUG) {
  const d = document.createElement('div'); d.id = 'debug';
  const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; d.appendChild(b); };
  const setOff = v => { timeOffset = v; store.set('bday-offset', String(v)); syncChickens(); updateTimeUI(); };
  d.append('DEBUG');
  add('Jump to start', () => setOff(openMs - Date.now() + 1000));
  add('Jump to first chouchou', () => setOff(startMs - Date.now() + 1000));
  add('+1 hour', () => setOff(timeOffset + HOUR));
  add('Unlock all', () => setOff(startMs + TOTAL * HOUR - Date.now()));
  add(`Collect all ${TOTAL}`, () => { for (let i = 0; i < TOTAL; i++) if (!collected.has(i)) freeChicken(i, true); for (const r of roamers) if (r.mode === 'present') receiveFrom(r, true); updateTimeUI(); });
  add('Teleport to the statue', () => { pq.setFromUnitVectors(AY, world.stage.dir).multiply(tq.setFromAxisAngle(AX, 7.5 / R)); girlH = 0; });
  add('Sky: cycle night → dawn → noon → dusk → real', () => {
    const seq = [0, 6.3, 12, 17.9, null], i = seq.indexOf(skyHourOverride);
    skyHourOverride = seq[(i + 1) % seq.length]; toast(skyHourOverride === null ? 'Sky follows the clock' : `Sky at ${skyHourOverride}h`);
  });
  add('Rain shower now', () => { weather.phase = 'rain'; weather.t = 0; });
  add('Planet view on/off', () => { overview = !overview; });
  add('Teleport to a chouchou', () => {
    const b = buried.values().next().value || roamers[0]?.group; if (!b) return toast('No chouchous right now');
    const d = b.position.clone().normalize();
    pq.setFromUnitVectors(AY, d).multiply(tq.setFromAxisAngle(AX, -3.2 / R));   // stand just behind it
  });
  add('Reset everything', () => { store.set('bday-collected', '[]'); store.set('bday-pulled', '[]'); store.set('bday-letterof', '{}'); store.set('bday-offset', '0'); store.set('bday-hint-ack', '0'); store.set('bday-first-seen', '0'); store.set('bday-unlocked', '0'); location.reload(); });
  document.body.appendChild(d);
  window.__phase = () => finale?.phase;   // for testing
  window.__roamers = () => roamers.map(r => r.mode);
  window.__quality = () => quality.level;
  window.__music = () => music?.track ?? null;
  window.__three = () => ({ renderer, scene, composer, camera, roamers, particles, smoke, obstacles, pq, girl, world, WATER_SPOTS, finale, labels, freeChicken, receiveFrom, letterOf });
  window.__girl = () => ({ h: +girlH.toFixed(2), air: airborne, jump: +jumpHeight().toFixed(2) });
  window.__dist = () => roamers.map(r => +girl.root.position.distanceTo(r.group.position).toFixed(2));
}

// ============================================================ input
// Left alone for 30 minutes, the camera drifts out to a slow view of the whole planet ("away" mode).
// Any key or click brings it back down to her; that first key is swallowed so she doesn't jump or move.
const AWAY_AFTER = 30 * 60 * 1000;
let lastInput = performance.now(), away = false;
function wakeUp() {
  away = false; lastInput = performance.now();
  dive = { from: camera.position.clone(), look: camLook.clone(), up: camera.up.clone() }; diveUntil = lastT + DIVE;
}
for (const ev of ['keydown', 'pointerdown', 'wheel']) addEventListener(ev, e => {
  lastInput = performance.now();
  if (away) { e.preventDefault(); e.stopImmediatePropagation(); wakeUp(); }
}, { capture: true, passive: false });
if (DEBUG) window.__away = () => { lastInput -= AWAY_AFTER + 1000; };
const keys = {};
// buttons drop focus after a click, so SPACE never re-presses them by accident
addEventListener('click', e => e.target.closest?.('button')?.blur(), true);
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.classList?.contains('dial')) return;
  keys[e.code] = true;
  if (!e.repeat && e.code === 'KeyC') takePhoto();   // photos work during the ending's orbit too
  if (state === 'finale') { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); finaleAction(); } return; }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) spaceAction(); }
  if (!e.repeat && e.code === 'KeyI') toggleGear('wand');
  if (!e.repeat && e.code === 'KeyP') toggleGear('parasol');
  if (!e.repeat && e.code === 'KeyO') floatPress();
  if (!e.repeat && e.code === 'KeyE') makeWish();
  if (!e.repeat && e.code === 'KeyF') whistle();
  if (!e.repeat && e.code === 'KeyG') startDance();
});
$('btnPull').addEventListener('pointerdown', e => { e.preventDefault(); pullPress(); });
// SPACE does whatever makes sense where she is: take a letter, pull, feed, pick — or just jump
function spaceAction() {
  if (nearHolder) offerLetter(nearHolder);
  else if (nearChicken) pullPress();
  else if (wishWindow > 0) makeWish();   // a shooting star is crossing
  else if (nearFeed) feed(nearFeed);
  else if (nearBerry) pickBerry(nearBerry);
  else if (nearBottle) openBottle(nearBottle);
  else jump();
}
$('btnJump').addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
$('btnAct').addEventListener('pointerdown', e => { e.preventDefault(); spaceAction(); });
$('btnAsk').addEventListener('pointerdown', e => { e.preventDefault(); if (nearHolder) offerLetter(nearHolder); });
$('btnReceive').onclick = () => { closeOverlay('offer'); if (offering) receiveFrom(offering); offering = null; };
$('btnGiftYes').onclick = () => { closeOverlay('gift'); startFinale(); };
$('btnGiftNo').onclick = () => closeOverlay('gift');   // nothing happens; it'll ask again next time she comes close
$('btnLater').onclick = () => { closeOverlay('offer'); offering = null; toast('🐣 He\'ll wait right here for you'); };
addEventListener('keyup', e => { keys[e.code] = false; });
const joy = { x: 0, y: 0, id: null };
{
  const base = $('joystick'), knob = $('knob');
  const move = e => {
    const r = base.getBoundingClientRect(), rad = r.width / 2;
    let dx = (e.clientX - (r.left + rad)) / rad, dy = (e.clientY - (r.top + rad)) / rad;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = dy;
    knob.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
  };
  base.addEventListener('pointerdown', e => { joy.id = e.pointerId; base.setPointerCapture(e.pointerId); move(e); });
  base.addEventListener('pointermove', e => { if (e.pointerId === joy.id) move(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
}
renderer.domElement.addEventListener('pointerdown', () => { if (state === 'finale') finaleAction(); });
$('btnBlow').addEventListener('pointerdown', e => { e.preventDefault(); finaleAction(); });
$('btnLook').onclick = () => finaleAction();

// ============================================================ player
const pq = new THREE.Quaternion();   // her orientation on the planet
const tq = new THREE.Quaternion();
const camLook = V(0, R, 0);
camera.position.set(0, R + 7, -11);
let walkAmt = 0, wet = false, girlH = 0, overview = false, idleT = 0;
// jumping: a simple little hop
let vy = 0, airborne = false;
const GRAVITY = 26;
const jumpHeight = () => 1.2;
function jump() {
  if (state !== 'play' || modalOpen || airborne || gear.floating) return;
  vy = Math.sqrt(2 * GRAVITY * jumpHeight()); airborne = true;
  tone(420, 0, 0.12, 0.09, 'sine'); tone(760, 0.05, 0.18, 0.07, 'sine');
  burst(girl.root.position.clone(), 0xffffff, 5, 2.5, 0.4, 0.5);
}
// what she'd be standing on here: the ground, a bridge, a mound, or the top of a tree she's landed on
function floorAt(d, feet) {
  let f = world.standHeight(d).h;
  for (const o of obstacles) {
    if (o.plat > 0 && feet >= o.top - 0.35 && o.dir.angleTo(d) * R < o.plat) f = Math.max(f, o.top);
  }
  return f;
}
let faceYaw = 0, faceTarget = 0;   // which way she visually faces, relative to the camera's heading
// she starts each visit on the stone stage, with the carved chouchou in view just ahead
{
  const g = world.stage.group, r = world.stage.r;
  const d = g.localToWorld(V(r * 0.3, 0, r * 0.55)).normalize(), sd = g.localToWorld(V(r * 0.4, 0, -r * 0.42)).normalize();   // looking just past it, so it isn't hidden behind her
  pq.setFromUnitVectors(AY, d);
  const f = V(0, 0, 1).applyQuaternion(pq), to = sd.clone().addScaledVector(d, -sd.dot(d)).normalize();
  pq.premultiply(tq.setFromAxisAngle(d, Math.atan2(V().crossVectors(f, to).dot(d), f.dot(to))));
  girlH = world.stage.top;
  camera.position.set(0, 26, 66); camLook.set(0, 2, 0);   // the camera starts out in space, slowly circling the planet
}

function blocked(oldDir, newDir, pad = 0.35, feet = -Infinity, solidOnly = false) {
  for (const o of obstacles) {
    if (feet > o.top - 0.15 || (solidOnly && !o.solid)) continue;   // she's above it (mid-jump or standing on it)
    const dn = o.dir.angleTo(newDir) * R;
    if (dn < o.rad + pad && dn < o.dir.angleTo(oldDir) * R) return true;
  }
  return false;
}

let nearChicken = null, nearHolder = null, offering = null, nearFeed = null, nearBerry = null, actText = '';
let popFocus = null, camSide = 0, lastT = 0, diveUntil = 0, dive = null;
const DIVE = 4;   // seconds for the opening swoop down to her   // close-up camera for pulling
// candidate shots (sideways, along the pull) — 3/4 views first, then side-on, then from behind
const SHOTS = [[5, -3.6], [-5, -3.6], [6.2, 0.4], [-6.2, 0.4], [2.6, -5.8], [-2.6, -5.8], [0, -6.4], [3.5, 3.5], [-3.5, 3.5]];
function pickShot(camAt, target) {
  let best = SHOTS[0], bestHits = Infinity;
  for (const shot of SHOTS) {
    const p = camAt(shot); let hits = 0;
    for (const o of obstacles) {
      if (o.top < 1.5) continue;   // only trees/palms can block the view
      const c = o.dir.clone().multiplyScalar(R + o.top - 1.1), rc = Math.max(o.rad, o.plat) + 0.7;
      for (const f of [0, 0.3, 0.6]) if (p.clone().lerp(target, f).distanceTo(c) < rc) hits++;
    }
    if (hits < bestHits) { bestHits = hits; best = shot; if (!hits) break; }
  }
  return best;
}
function updatePlayer(dt, t) {
  const canMove = state === 'play' && !modalOpen && !introLock;
  // camera-relative movement: W/S forward/back, A/D left/right. The camera never turns;
  // she simply runs (and faces) whichever way you push.
  let mx = 0, mz = 0;
  if (canMove) {
    mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    mx = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0) - joy.x;
    // ← / → orbit the camera around her (she keeps facing the same way)
    const look = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    if (look) { const a = look * 2.2 * dt; pq.multiply(tq.setFromAxisAngle(AY, a)); faceYaw -= a; faceTarget -= a; }
  }
  let len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; len = 1; }
  if (len > 0.05) {
    const axis = V(mz, 0, -mx).normalize();
    const nq = pq.clone().multiply(tq.setFromAxisAngle(axis, (len * (gear.floating ? 3.4 : wet ? 4 : 7) * dt) / R));
    const od = AY.clone().applyQuaternion(pq), nd = AY.clone().applyQuaternion(nq);
    if (gear.floating) { if (onLagoon(nd) && !bumpsChouchou(od, nd)) pq.copy(nq); }   // on the float: anywhere on the lagoon, but not up onto land
    else if (!blocked(od, nd, 0.35, girlH) && !world.isDeep(nd) && !bumpsChouchou(od, nd)) pq.copy(nq);   // the lagoon's middle is too deep
    faceTarget = Math.atan2(mx, mz);
  }
  pq.normalize();
  const here = AY.clone().applyQuaternion(pq), stand = world.standHeight(here);
  const floor = floorAt(here, girlH);
  wet = stand.wet && !airborne && !gear.floating;
  if (gear.floating) {   // bobbing gently on the water
    girlH = world.lake.water - 0.05 + Math.sin(t * 2.2) * 0.06;
    floatRing.root.scale.setScalar(Math.min(1, floatRing.root.scale.x + dt * 5));
    floatRing.root.rotation.set(Math.sin(t * 1.7) * 0.05, 0, Math.sin(t * 1.3) * 0.06);
    if (len > 0.1 && Math.random() < dt * 6) burst(here.clone().multiplyScalar(R + world.lake.water), 0xffffff, 2, 1.5, 0.35, 0.6);   // little ripples
  } else if (airborne || girlH > floor + 0.45) {           // in the air: gravity until she lands
    airborne = true;
    vy -= GRAVITY * dt; girlH += vy * dt;
    if (girlH <= floor && vy <= 0) {
      girlH = floor; vy = 0; airborne = false;
      if (floor > stand.h + 0.5) burst(here.clone().multiplyScalar(R + girlH), 0x9fd27a, 6, 2, 0.4, 0.5);   // landed on a tree!
    }
  } else girlH = lerp(girlH, floor, 1 - Math.exp(-dt * 12));   // walking: follow the ground smoothly
  girl.root.position.copy(here).multiplyScalar(R + girlH);
  if (wet && len > 0.1 && Math.random() < 0.25) burst(here.clone().multiplyScalar(R - 0.1), 0xffffff, 2, 2.5, 0.35, 0.5);

  // nearest stuck chicken: arrow + pulling
  let best = null, bestD = Infinity;
  for (const b of buried.values()) {
    const d = b.position.distanceTo(girl.root.position);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best && bestD < 5.5 && canMove && !known() && store.get('bday-first-seen') !== '1') firstEncounter(best);
  nearChicken = best && bestD < 2.8 && canMove ? best : null;
  $('btnPull').classList.toggle('hidden', !nearChicken);
  nearHolder = null;
  if (canMove && !nearChicken) for (const r of roamers) if (r.mode === 'present' && r.group.position.distanceTo(girl.root.position) < 3) nearHolder = r;
  $('btnAsk').classList.toggle('hidden', !nearHolder);
  // berry trees to pick from, and chouchous to feed
  nearFeed = null; nearBerry = null;
  if (canMove && !nearChicken && !nearHolder && !actionPose) {
    if (berries > 0) {
      let bd = 2.8;
      for (const r of roamers) {
        if (!['roam', 'water', 'toWater', 'excited', 'approach', 'cuddle'].includes(r.mode) || r.munch > 0 || r.feeding) continue;
        const d = r.group.position.distanceTo(girl.root.position); if (d < bd) { bd = d; nearFeed = r; }
      }
    }
    if (!nearFeed) for (const tr of world.berryTrees) {
      if (tr.dir.angleTo(here) * R < 2.2 + tr.s && tr.slots.some(x => x.present)) { nearBerry = tr; break; }
    }
  }
  nearBottle = null;
  if (canMove) for (const B of bottles) if (B.mesh.visible && B.mesh.position.distanceTo(girl.root.position) < 2.4) nearBottle = B;
  const txt = nearFeed ? 'feed' : nearBerry ? 'pick' : nearBottle ? 'bottle' : '';
  if (txt !== actText) {
    actText = txt;
    $('btnAct').classList.toggle('hidden', !txt);
    if (txt === 'feed') $('btnAct').innerHTML = '<span class="pc-text">🍒 <b>SPACE</b> to feed him</span><span class="pc-touch">🍒 Tap to feed him</span>';
    if (txt === 'bottle') $('btnAct').innerHTML = '<span class="pc-text">🍾 <b>SPACE</b> to open the bottle</span><span class="pc-touch">🍾 Tap to open the bottle</span>';
    if (txt === 'pick') $('btnAct').innerHTML = '<span class="pc-text">🍒 <b>SPACE</b> to pick a berry</span><span class="pc-touch">🍒 Tap to pick a berry</span>';
  }
  let aim = best?.position, aimD = bestD;
  if (!best && allFound() && statue.state === 'stone') { aim = statue.group.getWorldPosition(V()); aimD = aim.distanceTo(girl.root.position); }
  arrowPivot.visible = !!aim && aimD > 6;
  if (aim) {
    const local = girl.root.worldToLocal(aim.clone());
    arrowPivot.rotation.y = Math.atan2(local.x, local.z);
    arrowPivot.position.y = 3.1 + Math.sin(t * 4) * 0.12;
  }
  if (nearChicken && len < 0.05) {   // turn to face the chicken she's pulling
    const rel = nearChicken.position.clone().sub(girl.root.position).applyQuaternion(pq.clone().invert());
    faceTarget = Math.atan2(rel.x, rel.z);
  }

  const dYaw = Math.atan2(Math.sin(faceTarget - faceYaw), Math.cos(faceTarget - faceYaw));
  faceYaw += dYaw * (1 - Math.exp(-dt * 10));
  girl.root.quaternion.copy(pq).multiply(tq.setFromAxisAngle(AY, faceYaw));
  walkAmt = lerp(walkAmt, len > 0.05 ? 1 : 0, 0.15);
  const pulling = nearChicken && nearChicken.userData.pull > 0.02;
  // dancing on the stage; idling: a stretch, then she sits down (or, at night, lies back to look at the stars)
  if (dancing > 0) {
    dancing -= dt;
    if (len > 0.05 || !isOnStage()) dancing = 0;
    faceYaw += dt * 1.8; faceTarget = faceYaw;
    if ((danceNoteT -= dt) <= 0) { danceNoteT = 0.45; floatIcon(girl.root.localToWorld(V((Math.random() - 0.5) * 1.4, 2.6, 0)), noteTex, 0.45, 1.6, 1.2); }
  }
  idleT = len < 0.05 && canMove && !airborne && !pulling && !actionPose && !gear.floating && dancing <= 0 ? idleT + dt : 0;
  let pose = pulling ? 'pull' : actionPose ? actionPose.pose : gear.floating ? 'sit' : dancing > 0 ? 'dance' : airborne ? 'jump' : 'walk';
  // idling: a stretch after ~10 s, sitting down after ~25 s, and only after a long while (at night) lying back to stargaze
  if (pose === 'walk' && idleT > 60 && isNightHour(hourOfDay())) pose = 'stargaze';
  else if (pose === 'walk' && idleT > 38 && !isNightHour(hourOfDay()) && weather.rain < 0.2 && !gear.parasol) pose = 'eat';   // a sunny-day cupcake
  else if (pose === 'walk' && idleT > 25) pose = 'sit';
  else if (pose === 'walk' && idleT > 10 && idleT < 12.5) pose = 'stretch';
  animateCharacter(girl, t, walkAmt, pose);
  cupcake.root.visible = pose === 'eat';
  if (pose === 'eat') {   // munching: the cupcake bobs to her mouth, with the odd crumb and a soft "nom"
    cupcake.root.position.y = 0.86 + Math.abs(Math.sin(t * 6)) * 0.04;
    if ((nomT -= dt) <= 0) {
      nomT = 1.6 + Math.random() * 1.4;
      tone(520 + Math.random() * 80, 0, 0.08, 0.03, 'triangle'); tone(420, 0.1, 0.08, 0.025, 'triangle');
      burst(cupcake.root.getWorldPosition(V()), 0x9a6a4a, 3, 1.2, 0.12, 0.6, glowTex, false);
    }
  }
  if (gear.floating) girl.rig.position.y = 0.05;   // sitting in the ring
  // holding things: that arm stays up (unless she needs both hands), and the holder cancels its tilt
  const holding = pose === 'walk' || pose === 'jump' || pose === 'sit';
  for (const [k, sh, hold] of [['wand', girl.parts.shR, wandHolder], ['parasol', girl.parts.shL, parasolHolder]]) {
    if (!gear[k]) continue;
    if (holding) sh.rotation.set(ARM[k][0] + Math.sin(t * 2 + (k === 'wand' ? 0 : 1)) * 0.03, 0, ARM[k][1]);
    if (k === 'wand' && holding) sh.rotation.set(-2.6, 0, -0.25);   // raised high, sending the star up
    hold.rotation.set(-sh.rotation.x, 0, -sh.rotation.z);
  }
  updateStar(dt, t);
  const night = 1 - clamp((sun.intensity - 0.75) / 1.2, 0, 1);   // the glow matters most after dark
  const lit = starFx.phase === 'on' ? 1 : starFx.phase === 'rise' ? clamp(starFx.t / 1.6, 0, 1) : 0;
  wandLight.intensity = lerp(wandLight.intensity, lit * (3 + 9 * night), 1 - Math.exp(-dt * 4));
  // "O" prompt at the lagoon's edge (or to hop off near the shore)
  let fh = '';
  if (state === 'play' && !modalOpen && !introLock && !airborne) {
    if (!gear.floating && here.angleTo(world.lake.c) < world.lake.r * 1.5 && (onLagoon(here) || stepToward(here, 1, 2.5 / R, onLagoon))) fh = 'on';
    else if (gear.floating && stepToward(here, -1, 2.5 / R, d => !world.standHeight(d).wet)) fh = 'off';
  }
  floatHint = fh;   // shown as the 🛟 O chip
  if (nearChicken) $('pullFill').style.width = `${Math.round(nearChicken.userData.pull * 100)}%`;

  // camera follows behind & above, always looking the same way
  let k = 1 - Math.exp(-dt * 4);
  // pulling a chouchou out (and the moment it pops free): swing round to a side close-up of the two of them
  lastT = t;
  let focus = null;
  if (nearChicken && nearChicken.userData.pull > 0.02) focus = nearChicken.position;
  else if (popFocus && t < popFocus.until && !$('offer').classList.contains('open')) focus = popFocus.obj.position;
  if (!focus) camSide = 0;
  if (state === 'intro') {                         // opening story: the planet slowly turning in the sky
    const a = t * 0.05;
    camera.position.lerp(V(Math.sin(a) * 66, 26, Math.cos(a) * 66), 1 - Math.exp(-dt * 2));
    camLook.lerp(V(0, 2, 0), 1 - Math.exp(-dt * 2));
    camera.up.lerp(AY, 0.1).normalize();
    camera.lookAt(camLook);
    return;
  }
  if (!away && state === 'play' && !modalOpen && performance.now() - lastInput > AWAY_AFTER) away = true;
  if (away) {   // drifting slowly around the whole planet until she comes back
    const a = t * 0.03;
    camera.position.lerp(V(Math.sin(a) * 70, 24, Math.cos(a) * 70), 1 - Math.exp(-dt * 0.35));
    camLook.lerp(V(0, 2, 0), 1 - Math.exp(-dt * 0.5));
    camera.up.lerp(AY, 1 - Math.exp(-dt * 0.5)).normalize();
    camera.lookAt(camLook);
    return;
  }
  if (t < diveUntil && dive) {   // after the welcome: swoop round the planet (never through it) and down behind her
    const e = ease(clamp(1 - (diveUntil - t) / DIVE, 0, 1));
    const to = V(0, R + 7, -11).applyQuaternion(pq), toLook = V(0, R + 1.5, 4).applyQuaternion(pq);
    const r0 = dive.from.length(), r1 = to.length();
    const dir = dive.from.clone().normalize(), dir1 = to.clone().normalize();
    const ang = dir.angleTo(dir1), axis = V().crossVectors(dir, dir1);
    if (axis.lengthSq() > 1e-8) dir.applyAxisAngle(axis.normalize(), ang * e);
    camera.position.copy(dir).multiplyScalar(lerp(r0, r1, e) + Math.sin(e * Math.PI) * 10);   // a little arc outward on the way
    camLook.copy(dive.look).lerp(toLook, e);
    camera.up.copy(dive.up).lerp(AY.clone().applyQuaternion(pq), e).normalize();
    camera.lookAt(camLook);
    return;
  }
  if ($('letter').classList.contains('open')) {   // reading: drift in close to her (and her chouchou)
    camera.position.lerp(girl.root.localToWorld(V(1.4, 2.3, 4.6)), k * 0.6);
    camLook.lerp(girl.root.localToWorld(V(0, 1.4, 0)), k * 0.6);
  } else if (focus && !overview) {
    const gp = girl.root.position, mid = gp.clone().add(focus).multiplyScalar(0.5);
    const along = focus.clone().sub(gp); along.addScaledVector(here, -along.dot(here)).normalize();
    const side = V().crossVectors(here, along).normalize();
    const fit = 1 / Math.sqrt(Math.min(1, camera.aspect));   // step back further on tall phone screens
    const camAt = ([sx, ax]) => mid.clone().addScaledVector(side, sx * fit).addScaledVector(along, ax * fit).addScaledVector(here, 2.6);
    if (!camSide) camSide = pickShot(camAt, mid);   // choose once per pull: an angle with no tree in the way
    const kc = 1 - Math.exp(-dt * 3);
    camera.position.lerp(camAt(camSide), kc);
    camLook.lerp(mid.clone().addScaledVector(here, 0.9), kc);
  } else {
    const lift = Math.max(0, girlH) * 0.55;
    camera.position.lerp((overview ? V(0, R * 2.4, -R * 1.6) : V(0, R + 7 + lift, -11)).applyQuaternion(pq), k);
    camLook.lerp(overview ? V() : V(0, R + 1.5 + lift, 4).applyQuaternion(pq), k);
  }
  camera.up.lerp(AY.clone().applyQuaternion(pq), k).normalize();
  camera.lookAt(camLook);
}

function pullPress() {
  if (!nearChicken || state !== 'play' || modalOpen) return;
  const u = nearChicken.userData;
  u.pull = Math.min(1, u.pull + 0.085);
  u.tug = 1;
  tugSound();
  if (Math.random() < 0.6) burst(nearChicken.localToWorld(V((Math.random() - 0.5) * 1.2, 0.15, (Math.random() - 0.5) * 1.2)), 0x8a5f3f, 3, 3, 0.3, 0.6, glowTex, false);
  if (u.pull >= 1) freeChicken(u.i);
}

// pop the chicken out of the ground; it hands over its letter, then roams
function freeChicken(i, instant = false) {
  const holder = buried.get(i);
  if (holder) {
    buried.delete(i);
    const { ch, halo, beam, ring } = holder.userData;
    holder.remove(halo, beam, ring, ch.root);
    const r = addRoamer(i, holder.quaternion, ch, !instant);
    if (!instant) popFocus = { obj: r.group, until: lastT + 2.6 };
    ch.root.position.y = SINK + 0.4;
    if (!instant) burst(holder.localToWorld(V(0, 0.6, 0)), PALETTE[i % PALETTE.length], 40, 7, 0.8, 1.4);
    else ch.root.position.y = 0;
  }
  pulled.add(i); if (instant) takeLetter(i);
  saveProgress();
  if (instant) return;
  nearChicken = null; $('btnPull').classList.add('hidden');
  popSound();
  if (pulled.size === 1) setTimeout(() => toast('💚 It\'s a little chouchou!'), 500);   // the big reveal
  updateTimeUI();
  const r = roamers.find(x => x.i === i);
  setTimeout(() => offerLetter(r), 1200);
}

// "Oh, he has a letter for you!"
function offerLetter(r) {
  if (!r || r.mode === 'roam' || modalOpen || state !== 'play') return;
  offering = r;
  openOverlay('offer');
}
// she takes the letter: letter + flower leave the beak, and the chicken is free
function receiveFrom(r, silent = false) {
  r.ch.envelope.visible = false; r.ch.flower.visible = false;
  r.mode = 'roam';
  const k = takeLetter(r.i); saveProgress();
  updateTimeUI();
  if (silent) return;
  burst(r.group.localToWorld(V(0, 1.6, 0)), 0xffffff, 8, 2.5, 0.8, 1.6, heartTex, false);
  burst(r.group.localToWorld(V(0, 0.7, 0.8)), PALETTE[r.i % PALETTE.length], 24, 5, 0.6, 1.2);
  collectSound();
  if (collected.size === TOTAL) pendingFinale.v = true;
  setTimeout(() => openLetter(k), 400);
}

function updateChickens(dt, t) {
  // stuck chickens: glow, wiggle while being pulled
  for (const b of buried.values()) {
    const u = b.userData;
    u.spawn = Math.min(1, u.spawn + dt * 0.8);
    b.scale.setScalar(Math.max(0.001, easeOutBack(u.spawn)));
    if (b !== nearChicken) u.pull = Math.max(0, u.pull - dt * 0.5);
    else u.pull = Math.max(0, u.pull - dt * 0.18);
    u.tug = Math.max(0, (u.tug || 0) - dt * 6);
    // every couple of seconds it wriggles and tugs, trying (and failing) to get out
    const struggle = Math.pow(Math.max(0, Math.sin(t * 1.7 + u.i * 1.3)), 6);
    const shake = Math.sin(t * 28) * (0.14 * struggle + 0.12 * u.pull);
    u.ch.root.position.y = SINK + u.pull * 0.45 + u.tug * 0.06 + struggle * 0.1 * Math.abs(Math.sin(t * 14));
    u.ch.root.rotation.z = shake + Math.sin(t * 2 + u.i) * 0.04;
    u.ch.root.rotation.x = Math.sin(t * 21) * 0.06 * struggle;
    u.ch.leaves.forEach((l, k) => { l.rotation.x = Math.sin(t * 24 + k) * 0.25 * struggle; });
    if (struggle > 0.6 && Math.random() < dt * 8) burst(b.localToWorld(V((Math.random() - 0.5) * 1.1, 0.15, (Math.random() - 0.5) * 1.1)), 0x8a5f3f, 2, 2.5, 0.25, 0.5, glowTex, false);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + u.i);
    u.halo.scale.setScalar(2.8 + pulse * 1.2);
    u.ring.scale.setScalar(1 + ((t * 0.6 + u.i * 0.1) % 1) * 1.5);
    u.ring.material.opacity = 1 - ((t * 0.6 + u.i * 0.1) % 1);
    u.beam.material.opacity = 0.45 + pulse * 0.3;
  }
  // freed chickens
  for (const r of roamers) {
    if (r.mode === 'flung') continue;   // drifting in space during the finale
    const root = r.ch.root;
    r.t += dt;
    if (r.mode === 'pop') {                       // big hop out of the hole
      const p = clamp(r.t / 1.0, 0, 1);
      root.position.y = lerp(SINK + 0.4, 0, p) + Math.sin(Math.PI * p) * 2.2;
      root.rotation.set(0, p * Math.PI * 2, 0);
      if (p >= 1) { r.mode = 'present'; root.rotation.set(0, 0, 0); }
      continue;
    }
    if (r.mode === 'present') {                   // stand there proudly, facing her
      const rel = girl.root.position.clone().sub(r.group.position).applyQuaternion(r.q.clone().invert());
      root.rotation.y = lerp(root.rotation.y, Math.atan2(rel.x, rel.z), 0.15);
      root.position.y = Math.abs(Math.sin(t * 6)) * 0.12;
      continue;
    }
    if (r.munch > 0 || r.feeding) {               // nom nom: happy chewing with a little bounce
      if (r.munch > 0) r.munch -= dt;
      const rel = girl.root.position.clone().sub(r.group.position).applyQuaternion(r.q.clone().invert());
      r.q.multiply(tq.setFromAxisAngle(AY, Math.atan2(rel.x, rel.z) * Math.min(1, dt * 8))).normalize();
      root.rotation.y *= 0.8; root.rotation.x = 0;
      root.position.y = r.feeding ? 0 : Math.abs(Math.sin(t * 12)) * 0.14;
      root.scale.set(1 + Math.sin(t * 24) * 0.06 * (r.munch > 0 ? 1 : 0), 1 - Math.sin(t * 24) * 0.07 * (r.munch > 0 ? 1 : 0), 1);
      root.rotation.z = Math.sin(t * 7) * 0.08;
      r.heartT = (r.heartT || 0) - dt;
      if (r.munch > 0 && r.heartT <= 0) { r.heartT = 0.5; burst(r.group.localToWorld(V((Math.random() - 0.5) * 0.6, 1.8, 0.3)), 0xffffff, 1, 1.4, 0.55, 1.4, heartTex, false); }
      if (r.munch <= 0 && !r.feeding) root.scale.setScalar(1);
      placeRoamer(r);
      continue;
    }
    // when she comes close: hop with excitement, run over, and cuddle her
    const toGirl = girl.root.position.distanceTo(r.group.position);
    if (toGirl > 4.8) r.armed = true;   // re-arms as soon as she steps away, so it greets her every time she comes back
    if ((r.mode === 'roam' || r.mode === 'water' || r.mode === 'toWater' || r.mode === 'watch') && r.armed !== false && toGirl < 4.5 && state === 'play' && !modalOpen) {
      r.mode = 'excited'; r.armed = false; r.t = 0; tone(1046.5, 0, 0.15, 0.08, 'triangle'); tone(1318.5, 0.1, 0.2, 0.08, 'triangle');
    }
    if (r.mode === 'excited' || r.mode === 'approach' || r.mode === 'cuddle') {
      // always turn to face her
      const rel = girl.root.position.clone().sub(r.group.position).applyQuaternion(r.q.clone().invert());
      const yaw = Math.atan2(rel.x, rel.z);
      r.q.multiply(tq.setFromAxisAngle(AY, yaw * Math.min(1, dt * 8))).normalize();
      root.rotation.y *= 0.8;
      if (r.mode === 'excited') {                 // two big happy hops
        root.position.y = Math.abs(Math.sin((r.t / 0.42) * Math.PI)) * 0.55;
        root.rotation.z = Math.sin(r.t * 18) * 0.12;
        if (r.t < dt * 1.5) burst(r.group.localToWorld(V(0, 1.9, 0)), 0xffffff, 3, 1.5, 0.55, 1.2, heartTex, false);
        if (r.t > 0.84) { r.mode = 'approach'; r.t = 0; }
      } else if (r.mode === 'approach') {         // waddle over to her
        if (toGirl > 1.35 && r.t < 5) {
          // head straight for her; squeeze past trees when close, otherwise side-step around them
          // (the stone stage is solid: if she's up there, it waits at the edge and cuddles from there)
          const od = AY.clone().applyQuaternion(r.q);
          let stepped = false;
          for (const side of [0, 0.9, -0.9, 1.6, -1.6]) {
            const nq = r.q.clone().multiply(tq.setFromAxisAngle(AY, side)).multiply(tq.setFromAxisAngle(AX, (3.2 * dt) / R));
            const nd = AY.clone().applyQuaternion(nq);
            if (!blocked(od, nd, 0.45, -Infinity, toGirl < 3) && !world.standHeight(nd).wet) {
              r.q.copy(nq).multiply(tq.setFromAxisAngle(AY, -side)).normalize();
              stepped = true; break;
            }
          }
          if (!stepped && toGirl < 6) { r.mode = 'cuddle'; r.t = 0; r.cuddleD = toGirl; }
          root.position.y = Math.abs(Math.sin(t * 13 + r.phase)) * 0.2;
          root.rotation.z = Math.sin(t * 13 + r.phase) * 0.14;
        } else { r.mode = 'cuddle'; r.t = 0; r.cuddleD = toGirl; }
      } else {                                    // nuzzle and wiggle, hearts floating up
        root.position.y = 0;
        root.rotation.x = lerp(root.rotation.x, 0.28, 0.2);
        root.rotation.z = Math.sin(r.t * 9) * 0.16;
        root.scale.set(1 + Math.sin(r.t * 18) * 0.03, 1 - Math.sin(r.t * 18) * 0.04, 1);
        r.heartT = (r.heartT || 0) - dt;
        if (r.heartT <= 0) { r.heartT = 0.45; burst(r.group.localToWorld(V((Math.random() - 0.5) * 0.6, 1.8, 0.3)), 0xffffff, 1, 1.4, 0.5 + Math.random() * 0.3, 1.4, heartTex, false); }
        if (toGirl > (r.cuddleD || 1.3) + 1.8 && r.t > 1.2) {     // keeps cuddling for as long as she stays close
          r.mode = r.home ? 'toWater' : 'roam'; r.t = 0; root.rotation.x = 0; root.scale.setScalar(1);   // back to the waterhole, or off to wander
          r.q.multiply(tq.setFromAxisAngle(AY, Math.PI * (0.7 + Math.random() * 0.6)));
          r.turnT = 1.5; r.turnRate = 0; r.pause = 0;
        }
      }
      placeRoamer(r);
      continue;
    }

    if (r.mode === 'toWater') {                   // trot over to its spot at the waterhole
      const rel = r.home.dir.clone().multiplyScalar(R).sub(r.group.position).applyQuaternion(r.q.clone().invert());
      r.q.multiply(tq.setFromAxisAngle(AY, Math.atan2(rel.x, rel.z) * Math.min(1, dt * 3))).normalize();
      const od = AY.clone().applyQuaternion(r.q);
      if (od.angleTo(r.home.dir) * R < 0.4) { r.mode = r.home.float ? 'float' : 'water'; r.t = 0; }
      else if (r.t > 60) { r.home.taken = null; r.home = null; r.mode = 'roam'; }   // couldn't find a way: give up for now
      else for (const side of [0, 0.9, -0.9, 1.6, -1.6]) {
        const nq = r.q.clone().multiply(tq.setFromAxisAngle(AY, side)).multiply(tq.setFromAxisAngle(AX, (2.2 * dt) / R));
        if (!blocked(od, AY.clone().applyQuaternion(nq), 0.4)) { r.q.copy(nq).multiply(tq.setFromAxisAngle(AY, -side)).normalize(); break; }
      }
      placeRoamer(r);
      root.rotation.y *= 0.9; root.rotation.x = 0;
      root.position.y = Math.abs(Math.sin(t * 10 + r.phase)) * 0.16;
      root.rotation.z = Math.sin(t * 10 + r.phase) * 0.1;
      continue;
    }
    if (r.mode === 'follow') {                    // trotting along behind her (or behind the one in front)
      const lp = r.leader && r.leader.mode === 'follow' ? r.leader.group.position : girl.root.position;
      const d = r.group.position.distanceTo(lp);
      if (d > 1.7) { walkToward(r, lp.clone().normalize(), clamp(d * 2.2, 2, 7.5), dt, 0.1); hopAnim(r, t, 0.2, 11); }
      else { turnToward(r, lp, dt); root.position.y = 0; root.rotation.set(0, 0, 0); }
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'dance') {                     // bopping along to her dance
      r.danceT -= dt;
      turnToward(r, girl.root.position, dt);
      root.position.y = Math.abs(Math.sin(t * 9 + r.phase)) * 0.4;
      root.rotation.set(0, Math.sin(t * 2 + r.phase) * 0.6, Math.sin(t * 4.5 + r.phase) * 0.25);
      for (const [j, l] of r.ch.leaves.entries()) l.rotation.x = Math.sin(t * 9 + j) * 0.3;
      if (r.danceT <= 0 || dancing <= 0) { r.mode = r.wasFollow ? 'follow' : 'roam'; root.rotation.set(0, 0, 0); r.turnT = 0; }
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'toNap') {                     // night: toddle over to the napping spot
      if (!isNightHour(hourOfDay())) { r.mode = 'roam'; placeRoamer(r); continue; }
      const there = walkToward(r, r.nap, 1.6, dt, 1.3);
      hopAnim(r, t, 0.12, 7);
      if (there || r.t > 45) { r.mode = 'sleep'; r.t = 0; }
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'sleep') {                     // curled up asleep, little z's floating up
      const br = Math.sin(t * 1.6 + r.phase) * 0.03;
      root.position.y = 0; root.rotation.set(0.15, 0, 0.32 * (r.phase > 3 ? 1 : -1)); root.scale.set(1 + br * 0.5, 1 + br, 1);
      r.zT = (r.zT ?? Math.random() * 3) - dt;
      if (r.zT <= 0 && state === 'play') { r.zT = 2.2 + Math.random() * 1.5; floatIcon(r.group.localToWorld(V(0.3, 1.7, 0.2)), zTex, 0.4, 2.4, 0.6); }
      if (!isNightHour(hourOfDay())) {   // morning! a big stretchy hop and off it goes
        r.mode = 'roam'; root.scale.setScalar(1); root.rotation.set(0, 0, 0); r.turnT = 0;
        burst(r.group.localToWorld(V(0, 1.6, 0)), 0xfff3b0, 6, 1.5, 0.35, 0.8);
      }
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'watch') {                     // sunset: sitting quietly, watching the sky
      if (!isDuskHour(hourOfDay())) { r.mode = 'roam'; root.rotation.set(0, 0, 0); placeRoamer(r); continue; }
      turnToward(r, world.lake.c.clone().multiplyScalar(R), dt * 0.4);
      root.position.y = 0; root.rotation.set(-0.15, 0, Math.sin(t * 0.8 + r.phase) * 0.05);
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'toShelter' || r.mode === 'shelter') {   // rain: huddle under a leafy tree until it passes
      if (weather.rain < 0.2) { r.mode = 'roam'; r.shelter = null; root.rotation.set(0, 0, 0); r.turnT = 0; placeRoamer(r); continue; }
      if (r.mode === 'shelter' && r.shelter && AY.clone().applyQuaternion(r.q).angleTo(r.shelter) * R > 0.9) r.mode = 'toShelter';
      if (r.mode === 'toShelter') {
        const there = !r.shelter || walkToward(r, r.shelter, 3.2, dt, 0.35);
        hopAnim(r, t, 0.14, 11);
        if (there || r.t > 20) r.mode = 'shelter';
      } else {   // huddled together, peeking out at the rain, a little shiver
        if (r.shelter) {   // settle exactly onto its spot so the group sits neatly side by side
          const me = AY.clone().applyQuaternion(r.q), gap = me.angleTo(r.shelter);
          if (gap > 1e-4) r.q.premultiply(tq.setFromAxisAngle(V().crossVectors(me, r.shelter).normalize(), Math.min(gap, (1.2 * dt) / R))).normalize();
        }
        if (r.tree) turnToward(r, r.group.position.clone().multiplyScalar(2).sub(r.tree.dir.clone().multiplyScalar(R)), dt);
        root.position.y = 0; root.rotation.set(0.1, 0, Math.sin(t * 28 + r.phase) * 0.025);
      }
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'chase') {                     // hopping after a butterfly for a moment
      const there = !butterfliesOut || walkToward(r, r.chase.pos.clone().normalize(), 2.6, dt, 0.6);
      root.position.y = Math.abs(Math.sin(t * 7 + r.phase)) * 0.45; root.rotation.set(0, 0, Math.sin(t * 7) * 0.12);
      if (there || r.t > 4) { r.mode = 'roam'; root.rotation.set(0, 0, 0); }
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'leaveWater') {                // time's up: turn away from the middle and wade/paddle back to the shore
      const rel = world.lake.c.clone().multiplyScalar(R).sub(r.group.position).applyQuaternion(r.q.clone().invert());
      const yaw = Math.atan2(rel.x, rel.z) + Math.PI;
      r.q.multiply(tq.setFromAxisAngle(AY, Math.atan2(Math.sin(yaw), Math.cos(yaw)) * Math.min(1, dt * 3))).normalize();
      const od = AY.clone().applyQuaternion(r.q), nq = r.q.clone().multiply(tq.setFromAxisAngle(AX, (1.8 * dt) / R));
      if (!blocked(od, AY.clone().applyQuaternion(nq), 0.4)) r.q.copy(nq); else r.q.multiply(tq.setFromAxisAngle(AY, dt * 2));
      const wetNow = world.standHeight(od).wet;
      root.rotation.set(0, 0, Math.sin(t * 9 + r.phase) * 0.1);
      root.position.set(0, wetNow ? 0 : Math.abs(Math.sin(t * 9 + r.phase)) * 0.16, 0);
      if (!wetNow || r.t > 25) { r.mode = 'roam'; r.wasFloat = false; r.turnT = 1 + Math.random() * 2; r.turnRate = 0; r.pause = 0; }   // ashore: off it goes
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'water') {                     // sit at the water's edge, now and then dipping for a sip
      const rel = world.lake.c.clone().multiplyScalar(R).sub(r.group.position).applyQuaternion(r.q.clone().invert());
      r.q.multiply(tq.setFromAxisAngle(AY, Math.atan2(rel.x, rel.z) * Math.min(1, dt * 2))).normalize();
      const sip = Math.pow(Math.max(0, Math.sin(t * 0.8 + r.phase)), 14);
      root.rotation.y *= 0.9; root.rotation.x = sip * 0.55; root.rotation.z = Math.sin(t * 1.3 + r.phase) * 0.04;
      root.position.y = Math.pow(Math.max(0, Math.sin(t * 0.35 + r.phase * 2)), 30) * 0.35;   // the odd happy hop
      placeRoamer(r);
      continue;
    }
    if (r.mode === 'float') {                     // lying on its back in the deep water, sunglasses on, drifting lazily
      r.q.multiply(tq.setFromAxisAngle(AY, dt * 0.15 * (r.phase > 3 ? 1 : -1))).normalize();
      const nq = r.q.clone().multiply(tq.setFromAxisAngle(AX, (0.25 * dt) / R));
      if (world.isDeep(AY.clone().applyQuaternion(nq))) r.q.copy(nq);   // a slow drift that never washes ashore
      else r.q.multiply(tq.setFromAxisAngle(AY, dt * 1.5));
      const k = 1 - Math.exp(-dt * 2.5);   // eases over onto its back after wading in
      root.rotation.set(lerp(root.rotation.x, -Math.PI / 2 + Math.sin(t * 1.1 + r.phase) * 0.06, k), 0, Math.sin(t * 0.9 + r.phase) * 0.1);
      root.position.set(0, lerp(root.position.y, 0.22, k), lerp(root.position.z, 0.6, k));   // belly up, floating at the surface
      r.ch.shades.visible = true;
      for (const [j, f] of (r.ch.feet || []).entries()) f.rotation.x = Math.sin(t * 1.5 + r.phase + j * Math.PI) * 0.25;   // lazy little paddles
      if (Math.random() < dt * 0.4) burst(r.group.position.clone().add(r.group.position.clone().normalize().multiplyScalar(0.3)), 0xffffff, 3, 1.2, 0.35, 0.8);
      placeRoamer(r);
      continue;
    }

    // the planet's daily rhythm: shelter from rain, nap at night, watch the sunset, chase butterflies
    if (state === 'play') {
      const h = hourOfDay();
      let next = null;
      if (weather.rain > 0.35) { next = 'toShelter'; if (!r.shelter) { planShelters(); } r.shelter = r.shelter || shelterFor(r); }
      else if (isNightHour(h) && r.i % 5 < 3) { next = 'toNap'; r.nap = NAP_SPOTS.reduce((a, b) => (b.angleTo(r.group.position) < a.angleTo(r.group.position) ? b : a), NAP_SPOTS[0]); }
      else if (isDuskHour(h) && r.i % 2 === 0) next = 'watch';
      else if (butterfliesOut && Math.random() < dt * 0.1) { const b = bfData.find(b => b.pos.distanceTo(r.group.position) < 5); if (b) { next = 'chase'; r.chase = b; } }
      if (next && (next !== 'toNap' || NAP_SPOTS.length)) { r.mode = next; r.t = 0; placeRoamer(r); continue; }
    }
    // roam: wander, pause, turn away from trees, water and her
    root.rotation.y *= 0.9;
    r.turnT -= dt;
    if (r.turnT < 0) { r.turnRate = (Math.random() - 0.5) * 2.2; r.turnT = 1 + Math.random() * 3; r.pause = Math.random() < 0.3 ? 0.8 + Math.random() * 1.8 : 0; }
    let moving = false;
    if (r.pause > 0) r.pause -= dt;
    else {
      r.q.multiply(tq.setFromAxisAngle(AY, r.turnRate * dt));
      const nq = r.q.clone().multiply(tq.setFromAxisAngle(AX, (1.4 * dt) / R));
      const od = AY.clone().applyQuaternion(r.q), nd = AY.clone().applyQuaternion(nq);
      const tooClose = nd.clone().multiplyScalar(R).distanceTo(girl.root.position) < 1.6;
      if (blocked(od, nd, 0.5) || world.standHeight(nd).wet || tooClose) { r.turnRate = (r.turnRate >= 0 ? 1 : -1) * 2.8; r.turnT = 0.7; }
      else { r.q.copy(nq); moving = true; }
      r.q.normalize();
    }
    placeRoamer(r);
    root.position.y = moving ? Math.abs(Math.sin(t * 9 + r.phase)) * 0.16 : 0;
    root.rotation.z = moving ? Math.sin(t * 9 + r.phase) * 0.1 : 0;
  }
  separateRoamers();
}

// chouchous never squash into each other: overlapping pairs get nudged apart along the ground.
// Ones that are settled (at the waterhole, handing over a letter, eating) hold their spot and the other steps aside.
const ROAMER_GAP = 1.3;
// she can't walk through a chouchou either (only checked for ones near the ground, and not when she's jumping over)
const girlGap = r => (r.mode === 'float' ? 0.95 : 0.6) + (gear.floating ? 1.2 : 0.6);
function bumpsChouchou(od, nd) {
  if (girlH > world.standHeight(nd).h + 1.1) return false;   // sailing over them mid-jump
  for (const r of roamers) {
    if (r.mode === 'flung' || r.mode === 'pop') continue;
    const c = AY.clone().applyQuaternion(r.q), dn = c.angleTo(nd) * R;
    if (dn < girlGap(r) && dn < c.angleTo(od) * R) return true;   // blocked only when moving closer, so she can always step away
  }
  return false;
}
const _sa = V(), _sb = V(), _sd = V(), _sq = new THREE.Quaternion();
function separateRoamers() {
  const live = roamers.filter(r => r.mode !== 'flung' && r.mode !== 'pop');
  const fixed = r => ['water', 'present'].includes(r.mode) || r.munch > 0 || r.feeding;
  // floaters lie stretched out on their backs, so they need more room
  const gapOf = (a, b) => (a.mode === 'float' ? 0.95 : ROAMER_GAP / 2) + (b.mode === 'float' ? 0.95 : ROAMER_GAP / 2);
  const nudge = (r, from, to, push) => {   // rotate it away from `from`, around the axis perpendicular to both
    _sd.crossVectors(from, to);
    if (_sd.lengthSq() < 1e-10) _sd.copy(randDir(Math.random)).cross(to);   // exactly on top of each other: pick a random direction
    _sd.normalize();
    _sq.setFromAxisAngle(_sd, push / R);
    const nd = to.clone().applyQuaternion(_sq);
    if (r.mode === 'float' ? !world.isDeep(nd) : blocked(to, nd, 0.4) || world.standHeight(nd).wet && !r.home) return;   // never into a tree, the stage, the lake — or (floating) ashore
    r.q.premultiply(_sq).normalize();
    placeRoamer(r);
  };
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j], gap = gapOf(a, b);
    _sa.copy(AY).applyQuaternion(a.q); _sb.copy(AY).applyQuaternion(b.q);
    const dist = _sa.angleTo(_sb) * R;
    if (dist >= gap) continue;
    const fa = fixed(a), fb = fixed(b);
    if (fa && fb) continue;
    const push = (gap - dist) / (fa || fb ? 1 : 2);
    if (!fa) nudge(a, _sb.clone(), _sa.clone(), push);
    if (!fb) nudge(b, _sa.clone(), _sb.clone(), push);
  }
  // and nobody walks (or floats) into her: they're nudged out of her way
  if (state === 'play' && girlH < world.standHeight(AY.clone().applyQuaternion(pq)).h + 1.1) {
    const me = AY.clone().applyQuaternion(pq);
    for (const r of live) {
      if (fixed(r) && r.mode !== 'present') continue;
      _sa.copy(AY).applyQuaternion(r.q);
      const dist = _sa.angleTo(me) * R, gap = girlGap(r);
      if (dist < gap) nudge(r, me, _sa.clone(), gap - dist);
    }
  }
}

// ============================================================ strawberry shortcake (finale)
const cake = new THREE.Group(); cake.visible = false; scene.add(cake);
const halfL = new THREE.Group(), halfR = new THREE.Group(); cake.add(halfL, halfR);
const flames = [];
// the inside of the cake: sponge, whipped cream and sliced strawberries
const cutTex = canvasTex(512, 256, (x, w, h) => {
  const bands = [[0, 0.3, 'sponge'], [0.3, 0.44, 'cream'], [0.44, 0.7, 'sponge'], [0.7, 0.84, 'cream'], [0.84, 0.96, 'sponge'], [0.96, 1, 'top']];
  const rng = mulberry32(77);
  for (const [a, b, kind] of bands) {
    const y0 = h * (1 - b), y1 = h * (1 - a);
    x.fillStyle = kind === 'sponge' ? '#f3d593' : '#fffaf1'; x.fillRect(0, y0, w, y1 - y0);
    if (kind === 'sponge') {
      for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(200,150,70,${0.15 + rng() * 0.2})`; x.beginPath(); x.arc(rng() * w, y0 + rng() * (y1 - y0), 1 + rng() * 2.2, 0, Math.PI * 2); x.fill(); }
    }
    if (kind === 'cream') {
      for (let sx = 18; sx < w; sx += 52 + rng() * 16) {
        const cy = (y0 + y1) / 2, rw = 20 + rng() * 6, rh = (y1 - y0) * 0.42;
        x.fillStyle = '#e8384f'; x.beginPath(); x.ellipse(sx, cy, rw, rh, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#ff9aa5'; x.beginPath(); x.ellipse(sx, cy, rw * 0.55, rh * 0.5, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#fff3c4';
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; x.beginPath(); x.ellipse(sx + Math.cos(a) * rw * 0.78, cy + Math.sin(a) * rh * 0.7, 1.6, 1.1, a, 0, Math.PI * 2); x.fill(); }
      }
    }
  }
});
{
  const creamM = softify(new THREE.MeshPhysicalMaterial({ color: 0xfffaf2, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) }), { scale: 0.6, strength: 0.15 });
  const faceM = new THREE.MeshStandardMaterial({ map: cutTex, roughness: 0.85, side: THREE.DoubleSide });
  const berryM = new THREE.MeshPhysicalMaterial({ color: 0xe32f48, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const leafM = new THREE.MeshStandardMaterial({ color: 0x5aa83c, roughness: 0.7 });
  const berryG = new THREE.LatheGeometry([[0, -1], [0.42, -0.82], [0.72, -0.35], [0.8, 0.15], [0.62, 0.58], [0.3, 0.8], [0, 0.84]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
  const dollopG = mergeGeometries([new THREE.SphereGeometry(1, 16, 12).scale(1, 0.62, 1), new THREE.ConeGeometry(0.55, 0.9, 12).translate(0, 0.75, 0)]);
  const half = a => (Math.sin(a) >= 0 ? halfR : halfL);
  const strawberry = (parent, x, y, z, s) => {
    const b = new THREE.Group(); b.position.set(x, y, z); b.scale.setScalar(s); b.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4);
    b.add(new THREE.Mesh(berryG, berryM));
    for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), leafM); l.scale.set(1, 0.18, 0.45); const a = (k / 5) * Math.PI * 2; l.position.set(Math.cos(a) * 0.28, 0.82, Math.sin(a) * 0.28); l.rotation.y = -a; b.add(l); }
    parent.add(b);
  };
  const tiers = [{ r: 16, h: 9 }, { r: 10.5, h: 6.5 }];
  let y = -9;
  for (const [ti, tr] of tiers.entries()) {
    for (const [hf, start, sgn] of [[halfR, 0, 1], [halfL, Math.PI, -1]]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(tr.r, tr.r, tr.h, 72, 1, false, start, Math.PI), creamM);
      body.position.y = y + tr.h / 2; hf.add(body);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(tr.r * 2, tr.h), faceM);
      face.rotation.y = (sgn * Math.PI) / 2; face.position.set(0.02 * sgn, y + tr.h / 2, 0); hf.add(face);
    }
    // piped cream around the top and bottom edges
    const n = ti === 0 ? 30 : 20;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      const top = new THREE.Mesh(dollopG, creamM); top.scale.setScalar(ti === 0 ? 1.1 : 0.85);
      top.position.set(Math.sin(a) * (tr.r - 0.9), y + tr.h + 0.35, Math.cos(a) * (tr.r - 0.9)); half(a).add(top);
      const bot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), creamM);
      bot.position.set(Math.sin(a) * tr.r, y + 0.4, Math.cos(a) * tr.r); half(a).add(bot);
      if (k % 2 === 0) strawberry(half(a), Math.sin(a) * (tr.r - 0.9), y + tr.h + 1.6, Math.cos(a) * (tr.r - 0.9), ti === 0 ? 1.2 : 0.95);
    }
    y += tr.h;
  }
  // a little heap of strawberries in the middle of the top
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2 + 0.3; strawberry(half(a), Math.sin(a) * 2.2, y + 1, Math.cos(a) * 2.2, 1.15); }
  // striped candles
  const stripeTex = canvasTex(32, 128, (x, w, h) => { x.fillStyle = '#fff6fb'; x.fillRect(0, 0, w, h); x.fillStyle = '#ff9cc4'; for (let i = -h; i < h; i += 22) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i + 16); x.lineTo(w, i + 26); x.lineTo(0, i + 10); x.fill(); } });
  const candleM = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    const cx = Math.sin(a) * 6.2, cz = Math.cos(a) * 6.2;
    const cdl = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 3.2, 12), candleM); cdl.position.set(cx, y + 1.6, cz); half(a).add(cdl);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb340, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.position.set(cx, y + 3.75, cz); glow.scale.set(1.2, 1.8, 1); half(a).add(glow);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.6, 10), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    core.position.set(cx, y + 3.6, cz); half(a).add(core);
    flames.push({ glow, core, base: new THREE.Vector3(cx, y + 3.6, cz), half: half(a), out: 0 });
  }
  shadowAll(cake);
  // merge each cake half into a few meshes (the candle flames stay separate so they can flicker)
  bake(halfL, flames.map(f => f.core)); bake(halfR, flames.map(f => f.core));
}
const CAKE_TOP = 6.5;
const knife = new THREE.Group(); knife.visible = false; cake.add(knife);
{
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.2, 24), new THREE.MeshPhysicalMaterial({ color: 0xeef2f8, metalness: 1, roughness: 0.18, clearcoat: 1 }));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 7), new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.6 }));
  handle.position.set(0, 0.3, 15.5);
  knife.add(blade, handle);
}
// the mysterious strawberry — plump, glossy and juicy — with him curled up inside it like a turtle
const bean = new THREE.Group(); bean.visible = false; cake.add(bean);   // (still called "bean" in the phase names)
const berryBody = new THREE.Group(); bean.add(berryBody);
const sb = {};   // strawberry-boy parts: head, arms, legs
{
  const BS = 3.6; berryBody.scale.setScalar(BS);
  // the berry: a plump lathe shape, deep red at the bottom, paler "shoulders" under the leaves
  const prof = [[0, -1.15], [0.3, -1.05], [0.62, -0.72], [0.88, -0.28], [0.98, 0.12], [0.95, 0.45], [0.8, 0.72], [0.52, 0.9], [0.22, 0.98], [0, 1.0]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  { const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const deep = new THREE.Color(0xc8102e), red = new THREE.Color(0xef2d45), pale = new THREE.Color(0xffc9c2);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      c.copy(deep).lerp(red, THREE.MathUtils.smoothstep(y, -1.1, 0.2)).lerp(pale, THREE.MathUtils.smoothstep(y, 0.72, 0.98));
      c.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const berryM = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0xff8a9a) });
  const skin = new THREE.Group(); berryBody.add(skin);
  skin.add(new THREE.Mesh(g, berryM));
  // golden seeds, spiralling round the surface
  const rAt = y => { for (let k = 1; k < prof.length; k++) if (y <= prof[k][1]) { const [x0, y0] = prof[k - 1], [x1, y1] = prof[k]; return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } return 0; };
  const seedG = new THREE.SphereGeometry(0.036, 6, 4).scale(1, 1.3, 0.5), seedM = new THREE.MeshStandardMaterial({ color: 0xf8d35e, roughness: 0.5 });
  for (let k = 0; k < 90; k++) {
    const y = -0.92 + (k / 90) * 1.62, a = k * 2.39996, r = rAt(y) * 0.985;
    const seed = new THREE.Mesh(seedG, seedM); seed.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    seed.lookAt(seed.position.clone().multiplyScalar(2)); seed.rotateX(Math.PI / 2); skin.add(seed);
  }
  // leafy green top + stem
  const leafM = new THREE.MeshStandardMaterial({ color: 0x4fa83a, roughness: 0.7 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, leaf = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), leafM);
    leaf.scale.set(0.38, 0.07, 1); leaf.position.set(Math.sin(a) * 0.3, 0.99, Math.cos(a) * 0.3); leaf.rotation.set(0, a, 0); leaf.rotateX(0.35); skin.add(leaf);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.36, 8), leafM); stem.position.set(0.03, 1.15, 0); stem.rotation.z = -0.25; skin.add(stem);
  bake(skin);
  // his head pokes out of the front, arms out the sides, little legs out the bottom
  const head = makeChibi(CONFIG.boy, false).parts.head;
  head.parent.remove(head); head.scale.setScalar(1.08); berryBody.add(head); sb.head = head;
  const sweater = new THREE.MeshStandardMaterial({ color: CONFIG.boy.outfit, roughness: 0.9 }), skinM = new THREE.MeshStandardMaterial({ color: CONFIG.boy.skin, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: CONFIG.boy.pants ?? 0x3e4a63, roughness: 0.9 }), bootM = new THREE.MeshStandardMaterial({ color: CONFIG.boy.boots, roughness: 0.8 });
  sb.arms = [-1, 1].map(sd => {
    const pv = new THREE.Group(); pv.position.set(0.8 * sd, 0.05, 0.3); berryBody.add(pv);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.26, 6, 10), sweater); arm.position.y = -0.2; pv.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), skinM); hand.position.y = -0.4; pv.add(hand);
    pv.userData.side = sd; return pv;
  });
  sb.legs = [-1, 1].map(sd => {
    const pv = new THREE.Group(); pv.position.set(0.36 * sd, -0.8, 0.32); berryBody.add(pv);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.14, 6, 10), pants); leg.position.y = -0.14; pv.add(leg);
    const boot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), bootM); boot.scale.set(1, 0.72, 1.3); boot.position.set(0, -0.3, 0.04); pv.add(boot);
    pv.userData.side = sd; return pv;
  });
  shadowAll(bean);
  sb.pop = [0, 0, 0];
  // the bite mark she leaves (hidden until she bites): pale flesh with a scalloped edge
  const biteM = new THREE.MeshStandardMaterial({ color: 0xffe2dc, roughness: 0.6 });
  sb.bite = new THREE.Group();
  sb.bite.position.set(0.92, 0.42, 0.12).normalize().multiplyScalar(0.94);
  sb.bite.lookAt(sb.bite.position.clone().multiplyScalar(2));
  for (const [x, y, r] of [[0, 0, 0.2], [0.15, 0.08, 0.12], [-0.15, 0.08, 0.12], [0.08, -0.13, 0.11], [-0.09, -0.13, 0.11]]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), biteM); m.scale.z = 0.35; m.position.set(x, y, 0.02); sb.bite.add(m);
  }
  sb.bite.scale.setScalar(0.001); berryBody.add(sb.bite);
  // pink cheeks for when she bites him
  const blushM = new THREE.MeshBasicMaterial({ color: 0xff8fa8, transparent: true, opacity: 0 });
  sb.blush = blushM;
  for (const sd of [-1, 1]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), blushM); c.position.set(0.33 * sd, -0.2, 0.52); c.scale.y = 0.6; c.rotation.y = 0.45 * sd; sb.head.add(c); }
}
// pose the strawberry boy: pop = how far head/arms/legs are out (0–1), wiggle = how much he's struggling
function poseBerryBoy(t, wiggle) {
  const [ph, pa, pl] = sb.pop;
  const eh = easeOutBack(ph);
  sb.head.position.set(0, lerp(0.15, 0.55, eh), lerp(0.1, 0.82, eh));
  sb.head.scale.setScalar(Math.max(0.001, 1.08 * Math.min(1, ph * 1.4)));
  sb.head.rotation.set(-0.15 * eh, Math.sin(t * 3.2) * 0.35 * wiggle, Math.sin(t * 5) * 0.12 * wiggle);
  for (const a of sb.arms) {
    a.scale.setScalar(Math.max(0.001, easeOutBack(pa)));
    a.rotation.z = a.userData.side * (1.25 + Math.sin(t * 14 + a.userData.side) * 0.55 * wiggle);
    a.rotation.x = -0.3 + Math.sin(t * 11 + a.userData.side * 2) * 0.4 * wiggle;
  }
  for (const l of sb.legs) {
    l.scale.setScalar(Math.max(0.001, easeOutBack(pl)));
    l.rotation.x = -0.25 + Math.sin(t * 16 + l.userData.side * 1.6) * 0.7 * wiggle;
    l.rotation.z = l.userData.side * 0.25;
  }
  berryBody.rotation.z = Math.sin(t * 9) * 0.14 * wiggle;
  berryBody.rotation.x = Math.sin(t * 7) * 0.06 * wiggle;
  berryBody.position.y = Math.abs(Math.sin(t * 7)) * 0.35 * wiggle;
}

// ============================================================ finale
let finale = null, shake = 0;
const F = (x, y, z) => V(x, y, z).applyQuaternion(finale.fq);
const flung = [];
const smoke = [];
const smokeTex = canvasTex(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(240,238,246,.75)'); g.addColorStop(1, 'rgba(230,228,240,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});
const elasticOut = t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1);

function noiseSound(dur, freq, vol, attack = 0.05) {
  if (!actx || muted) return;
  const len = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(), flt = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = buf; flt.type = 'lowpass'; flt.frequency.value = freq;
  g.gain.setValueAtTime(0, actx.currentTime); g.gain.linearRampToValueAtTime(vol, actx.currentTime + attack);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  src.connect(flt).connect(g).connect(actx.destination); src.start();
}

function puff(pos, vel, size, life, color = 0xf4f2f8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color, transparent: true, depthWrite: false, opacity: 0, fog: false }));
  s.position.copy(pos); s.scale.setScalar(size); scene.add(s);
  smoke.push({ s, vel, life, max: life, size, t: 0 });
}
function updateSmoke(dt) {
  for (let k = smoke.length - 1; k >= 0; k--) {
    const p = smoke[k]; p.t += dt;
    p.s.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(Math.exp(-dt * 1.1));
    p.s.scale.setScalar(p.size * (1 + p.t * 0.35));
    p.s.material.opacity = p.t < 0.25 ? (p.t / 0.25) * 0.95 : Math.max(0, 0.95 * (1 - (p.t - 0.25) / (p.max - 0.25)));
    if (p.t >= p.max) { scene.remove(p.s); p.s.material.dispose(); smoke.splice(k, 1); }
  }
}

// little speech pops: a word or emoji that bounces in near someone, bobs, then fades away
const labels = [];
function popLabel(text, at, height = 1.6, life = 2.6, color = '#ff5c98') {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  const font = `700 120px Caveat, cursive`;
  x.font = font; const w = Math.ceil(x.measureText(text).width) + 60;
  c.width = w; c.height = 170;
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.lineWidth = 18; x.strokeStyle = 'rgba(255,255,255,0.95)'; x.strokeText(text, w / 2, 88);
  x.fillStyle = color; x.fillText(text, w / 2, 88);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  sp.renderOrder = 20; scene.add(sp);
  labels.push({ sp, at, h: height, w: height * (w / 170), t: 0, life, seed: Math.random() * 6 });
}
function updateLabels(dt) {
  for (let k = labels.length - 1; k >= 0; k--) {
    const L = labels[k]; L.t += dt;
    const pop = easeOutBack(clamp(L.t / 0.35, 0, 1)), fade = clamp((L.life - L.t) / 0.5, 0, 1);
    L.sp.position.copy(L.at()).addScaledVector(camera.up, L.t * 0.25 + Math.sin(L.t * 4 + L.seed) * 0.08);
    L.sp.scale.set(L.w * pop, L.h * pop, 1);
    L.sp.material.rotation = Math.sin(L.t * 3 + L.seed) * 0.06;
    L.sp.material.opacity = fade;
    if (L.t >= L.life) { scene.remove(L.sp); L.sp.material.map.dispose(); L.sp.material.dispose(); labels.splice(k, 1); }
  }
}

function startFinale() {
  if (state === 'finale') return;
  if (!statue.giant) wakeStatue();
  wantedTrack = null; music?.stop(3);
  state = 'finale';
  gear.wand = gear.parasol = gear.floating = false; wandHolder.visible = parasolHolder.visible = floatRing.root.visible = sky1.visible = false; wandLight.intensity = 0; starFx.phase = 'off';
  releaseFollowers(); dancing = 0; weather.phase = 'clear';
  $('hud').classList.add('hidden');   // the finale is a cinematic: no HUD
  $('joystick').classList.add('hidden'); $('btnJump').classList.add('hidden');
  arrowPivot.visible = false;
  for (const b of buried.values()) planetGroup.remove(b);
  buried.clear();
  $('btnPull').classList.add('hidden'); $('btnAsk').classList.add('hidden');
  // the finale's frame: "up" is straight up from the statue, so the giant chouchou rises from its stage
  const fq = pq.clone().premultiply(new THREE.Quaternion().setFromUnitVectors(AY.clone().applyQuaternion(pq), statue.dir));
  finale = { phase: 'gift', t: 0, fq, start: girl.root.position.clone() };
  girl.root.quaternion.copy(pq);
  // lift the giant off its plinth into a free-floating group we can steer, inflate and fling
  const gr = statue.giant.root, wrap = new THREE.Group();
  const gwp = gr.getWorldPosition(V()), fwd = V(0, 0, 1).transformDirection(gr.matrixWorld).applyQuaternion(fq.clone().invert());
  finale.giantYaw = Math.atan2(fwd.x, fwd.z);
  wrap.position.copy(gwp); wrap.quaternion.copy(fq).multiply(tq.setFromAxisAngle(AY, finale.giantYaw)); wrap.scale.setScalar(2.4);
  scene.add(wrap); wrap.add(gr); gr.position.set(0, 0, 0); gr.rotation.set(0, 0, 0); gr.scale.setScalar(1);
  finale.giant = { obj: wrap, ch: statue.giant, p0: gwp.clone(), seat: statue.seatY };
  statue.state = 'gone';
  cake.quaternion.copy(finale.fq);
  boy.root.quaternion.copy(finale.fq);
  noiseSound(2.5, 500, 0.05, 1.5);
}
function next(phase) { finale.phase = phase; finale.t = 0; }
// she floats in behind the strawberry's top-right shoulder, so her mouth reaches the bite spot
const BITE_G = () => bean.localToWorld(V(5.9, -2.6, -2.1));
function biteYaw() {   // turn her to face the spot she's about to nibble
  const rel = sb.bite.getWorldPosition(V()).sub(girl.root.position).applyQuaternion(finale.fq.clone().invert());
  return Math.atan2(rel.x, rel.z);
}
const KISS_YAW = 1.12;   // turned toward each other, but angled to the camera so we see their faces
// everyone takes a place on a tilted ring around the planet: the two of them together, then all 24 chouchous
function startOrbit() {
  const f = finale;
  const n = F(0, 1, 0).applyAxisAngle(F(1, 0, 0), 0.38).normalize();
  const u = F(1, 0, 0).addScaledVector(n, -F(1, 0, 0).dot(n)).normalize(), v = V().crossVectors(n, u).normalize();
  const items = [];
  const couple = { obj: new THREE.Group(), radius: 31, lift: 4, s: 1, spin: false };   // girl + boy travel together, side by side
  const bw = bean.getWorldPosition(V());
  couple.obj.position.copy(girl.root.position).lerp(bw, 0.5);
  couple.obj.quaternion.copy(girl.root.quaternion);
  scene.add(couple.obj);
  couple.obj.attach(girl.root); couple.obj.attach(bean);
  // from the kiss pose, they ease round to fly side by side, both looking ahead along the orbit
  f.pair = [[girl.root, V(-2.3, -2.6, 0), 2.6], [bean, V(2.4, 0.4, 0), 0.75]].map(([obj, p1, s1]) => ({ obj, p0: obj.position.clone(), q0: obj.quaternion.clone(), s0: obj.scale.x, p1, s1 }));
  items.push(couple);
  for (const c of flung) items.push({ obj: c.g, ch: c.ch, radius: 31 + (Math.random() - 0.5) * 3, lift: (Math.random() - 0.5) * 4, s: c.cap ?? 2.2, spin: true, seed: Math.random() * 10 });
  statue.stone.visible = true;   // the planet grows back with its statue
  for (const it of items) { it.from = it.obj.position.clone(); it.fromQ = it.obj.quaternion.clone(); it.fromS = it.obj.scale.x; }
  f.orbit = { n, u, v, items, angle: Math.atan2(couple.obj.position.dot(v), couple.obj.position.dot(u)) };
}

// SPACE / taps during the finale
function finaleAction() {
  if (!finale) return;
  if (finale.phase === 'candles') blowPress();
  else if (finale.phase === 'awaitCut') { $('cutHint').classList.add('hidden'); next('cut'); }
  else if (finale.phase === 'beanWait') openBean();
}
function blowPress() {
  const f = finale;
  f.blow = Math.min(1, (f.blow || 0) + 0.075); f.gust = 1;
  noiseSound(0.35, 1800, 0.08, 0.02);
  // a little breath of wind from her toward the candles
  const from = girl.root.localToWorld(V(0, 2, 0.8)), to = cake.localToWorld(V(0, CAKE_TOP + 3.5, 0));
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.6 }));
    s.position.copy(from).add(randDir(Math.random).multiplyScalar(0.6)); s.scale.setScalar(0.9); scene.add(s);
    particles.push({ s, vel: to.clone().sub(from).multiplyScalar(0.9 + Math.random() * 0.3), life: 0.9, max: 0.9, size: 0.9 });
  }
  $('blowFill').style.width = `${Math.round(f.blow * 100)}%`;
  if (f.blow >= 1) {
    next('blown'); $('btnBlow').classList.add('hidden');
    noiseSound(0.8, 900, 0.18, 0.02);
  }
}
function openBean() { $('whatsThat').classList.add('hidden'); next('beanOpen'); }

function burstPlanet() {
  shake = 1.6;
  noiseSound(3.5, 260, 0.6, 0.01);
  tone(55, 0, 1.6, 0.25, 'sine');
  for (let k = 0; k < 120; k++) {
    const d = randDir(Math.random), pos = d.clone().multiplyScalar(R * (0.4 + Math.random() * 0.7));
    puff(pos, d.clone().multiplyScalar(5 + Math.random() * 9).add(randDir(Math.random).multiplyScalar(2)), 8 + Math.random() * 10, 3.6 + Math.random() * 2.2, Math.random() < 0.3 ? 0xe4e0ec : 0xf7f5fa);
  }
  burst(V(), 0xffffff, 60, 35, 3, 1.6);
  // every chouchou gets flung out into space
  for (const r of roamers) {
    scene.attach(r.group);
    r.mode = 'flung';
    const out = r.group.position.clone().normalize();
    flung.push({ g: r.group, ch: r.ch, vel: out.multiplyScalar(14 + Math.random() * 12).add(randDir(Math.random).multiplyScalar(5)), spin: randDir(Math.random).multiplyScalar(2 + Math.random() * 3), phase: Math.random() * 6 });
  }
  // the giant chouchou drifts gently off to join them
  const G = finale.giant;
  flung.push({ g: G.obj, ch: G.ch, cap: 4.4, vel: F(16, 4, -10), spin: V(0.3, 0.6, 0.2), phase: 0 });
  cake.visible = false;   // revealed once the smoke clears
}

function updateFinale(dt, t) {
  const f = finale; f.t += dt;
  const full = F(10, 22, 74), fullLook = F(0, 5, 0);
  let camPos = full, look = fullLook, camSpeed = 1.6;
  const girlFly = F(-17, 15, 6), girlUp = F(0, R + 17, 0);
  const fullFar = F(12, 26, 96), fullFarLook = F(0, 10, 0);   // pulled back far enough to see the giant floating high above

  const G = f.giant, seatAt = () => G.obj.localToWorld(V(0, G.seat, 0));
  if (f.phase === 'gift') {                       // she hands over all 24 flowers, one after another
    const T = f.t, from = girl.root.localToWorld(V(0, 1.2, 0.5)), to = G.obj.localToWorld(V(0, 0.9, 0.6));
    while ((f.sent || 0) < TOTAL && T > 0.3 + (f.sent || 0) * 0.07) {
      const k = f.sent = (f.sent || 0) + 1, life = 0.9;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: PALETTE[k % PALETTE.length], transparent: true, depthWrite: false, opacity: 0.95 }));
      sp.position.copy(from).add(randDir(Math.random).multiplyScalar(0.3)); sp.scale.setScalar(0.7); scene.add(sp);
      particles.push({ s: sp, vel: to.clone().sub(sp.position).divideScalar(life).add(F(0, 2.5, 0)), life, max: life, size: 0.7 });
      if (k % 3 === 0) tone(700 + k * 30, 0, 0.18, 0.05, 'triangle');
    }
    if (T > 2.4 && !f.thanked) { f.thanked = true; collectSound(); burst(G.obj.localToWorld(V(0, 1.9, 0)), 0xffffff, 10, 3, 0.9, 1.8, heartTex, false); }
    G.obj.position.copy(G.p0).addScaledVector(F(0, 1, 0), f.thanked ? Math.abs(Math.sin((T - 2.4) * 6)) * 0.5 : 0);   // happy hops
    const mid = girl.root.position.clone().lerp(G.p0, 0.5);
    camPos = mid.clone().add(F(7, 6, -9)); look = mid.clone().add(F(0, 2, 0)); camSpeed = 2;
    if (T > 3.6) { next('board'); f.from = girl.root.position.clone(); }
  } else if (f.phase === 'board') {               // a big hop up onto its head
    const p = clamp(f.t / 1.3, 0, 1), e = ease(p);
    G.obj.position.copy(G.p0);
    girl.root.position.copy(f.from).lerp(seatAt(), e).addScaledVector(F(0, 1, 0), Math.sin(p * Math.PI) * 3.2);
    if (p >= 1 && !f.riding) { f.riding = true; popSound(); burst(seatAt(), 0x9fd27a, 10, 3, 0.5, 0.7); }
    const mid = girl.root.position.clone().lerp(G.p0, 0.5);
    camPos = mid.clone().add(F(7, 6, -10)); look = mid.clone().add(F(0, 2.5, 0)); camSpeed = 2;
    if (f.t > 2) next('inflate');
  } else if (f.phase === 'inflate') {             // three big breaths: puff… puff… PUFF — round as a balloon
    const T = f.t, BREATHS = [[0.2, 1.25], [1.1, 1.5], [2.0, 1.85]];
    let lvl = 1, squash = 0;
    BREATHS.forEach(([at, to], i) => {
      if (T < at) return;
      const k = (T - at) / 0.7, from = i ? BREATHS[i - 1][1] : 1;
      lvl = lerp(from, to, elasticOut(clamp(k, 0, 1)));
      squash = Math.sin(clamp(k, 0, 1) * Math.PI * 3) * 0.08 * (1 - clamp(k, 0, 1));
      if (!(f.breath ??= [])[i]) {
        f.breath[i] = true;
        noiseSound(0.6, 500 + i * 400, 0.14, 0.05); tone(220 + i * 110, 0, 0.5, 0.08, 'sine'); tone(330 + i * 160, 0.15, 0.5, 0.06, 'sine');
        burst(G.obj.localToWorld(V(0, 0.8, 0)), 0xffffff, 14, 5 + i * 2, 0.6, 0.9);
      }
    });
    f.puff = lvl;
    const gs = 2.4;
    G.obj.scale.set(gs * Math.pow(lvl, 1.15) * (1 + squash), gs * Math.pow(lvl, 0.8) * (1 - squash), gs * Math.pow(lvl, 1.15) * (1 + squash));
    G.obj.position.copy(G.p0);
    for (const [j, l] of G.ch.leaves.entries()) l.rotation.x = -0.25 * (lvl - 1);   // leaves lifting as it fills up
    girl.root.position.copy(seatAt());
    const mid = G.obj.localToWorld(V(0, G.seat * 0.55, 0));
    camPos = mid.clone().add(F(9, 3, -15)); look = mid; camSpeed = 2;
    if (T > 3.1) { next('lift'); noiseSound(2.5, 500, 0.05, 1.5); }
  } else if (f.phase === 'lift') {                // ...and floats right up off the planet into space, her on top
    const p = clamp(f.t / 9, 0, 1), e = ease(p);
    const grow = lerp(1, 1.5, e), gs = 2.4 * grow, lvl = f.puff || 1.85;
    const bob = Math.sin(f.t * 2.2) * 0.03;
    G.obj.scale.set(gs * Math.pow(lvl, 1.15) * (1 + bob), gs * Math.pow(lvl, 0.8) * (1 - bob), gs * Math.pow(lvl, 1.15) * (1 + bob));
    const seatH = G.seat * gs * Math.pow(lvl, 0.8);
    const goal = girlUp.clone().addScaledVector(F(0, 1, 0), -G.seat * 2.4 * 1.5 * Math.pow(lvl, 0.8));
    G.obj.position.copy(G.p0).lerp(goal, e);
    G.obj.quaternion.copy(f.fq).multiply(tq.setFromAxisAngle(AY, f.giantYaw + Math.sin(f.t * 0.7) * 0.2)).multiply(tq.setFromAxisAngle(AX, Math.sin(f.t * 1.3) * 0.05));
    for (const [j, l] of G.ch.leaves.entries()) l.rotation.x = Math.sin(f.t * 6 + j) * 0.35;   // flapping its leaves like wings
    for (const [j, ft] of (G.ch.feet || []).entries()) ft.rotation.x = Math.sin(f.t * 8 + j * Math.PI) * 0.6;
    girl.root.position.copy(seatAt());
    girl.root.scale.setScalar(lerp(1, 2.4, e));
    // a little trail of cloud puffs drifting down behind it
    f.trail = (f.trail ?? 0) - dt;
    if (f.trail <= 0 && p < 0.85) { f.trail = 0.12; puff(G.obj.position.clone().addScaledVector(F(0, 1, 0), -0.4 * seatH / G.seat).add(randDir(Math.random).multiplyScalar(gs * 0.4)), F(0, -3, 0).add(randDir(Math.random)), 1.2 * gs, 1.8); }
    // the camera rides along beside it (the planet dropping away below), then pulls back to see everything
    const mid = G.obj.position.clone().addScaledVector(F(0, 1, 0), seatH * 0.5);
    const z = ease(clamp((p - 0.55) / 0.45, 0, 1));
    camPos = mid.clone().add(F(13, -2, -24).multiplyScalar(lerp(1, 1.7, e))).lerp(fullFar, z);
    look = mid.clone().lerp(fullFarLook, z);
    camSpeed = 3;
    if (p >= 1) { next('rumble'); noiseSound(3.4, 120, 0.5, 2.5); }
  } else if (f.phase === 'rumble') {              // the planet shakes harder and harder...
    const p = clamp(f.t / 3.2, 0, 1);
    shake = 0.15 + p * p * 1.1;
    planetGroup.position.copy(randDir(Math.random).multiplyScalar(shake * 0.5));
    girl.root.position.copy(girlUp);
    G.obj.position.copy(girlUp).addScaledVector(F(0, 1, 0), -G.seat * G.obj.scale.y).add(randDir(Math.random).multiplyScalar(0.1));
    camPos = fullFar; look = fullFarLook;
    if (Math.random() < dt * 14) {
      const d = randDir(Math.random);
      burst(d.multiplyScalar(R + 0.3), 0xb48a64, 4, 3, 0.8, 0.7, glowTex, false);
    }
    if (p >= 1) { next('smoke'); f.riding = false; burstPlanet(); }
  } else if (f.phase === 'smoke') {               // ...and bursts; the cake appears as the smoke clears
    const p = clamp(f.t / 5, 0, 1);
    if (f.t > 0.35) { planetGroup.visible = false; planetGroup.position.set(0, 0, 0); }
    if (f.t > 3.3 && !cake.visible) { cake.visible = true; chime(); playMusic('ending'); burst(F(0, 2, 0), 0xffffff, 30, 12, 1.4, 1.2); }
    cake.scale.setScalar(Math.max(0.001, lerp(0.7, 1, easeOutBack(clamp((f.t - 3.3) / 1.2, 0, 1)))));
    girl.root.position.copy(girlUp).lerp(girlFly, ease(p));
    girl.root.scale.setScalar(lerp(2.4, 3, ease(p)));
    if (p >= 1) { next('candles'); f.blow = 0; $('btnBlow').classList.remove('hidden'); }
  } else if (f.phase === 'candles') {             // spam SPACE to blow out the candles
    girl.root.position.copy(girlFly);
    f.blow = Math.max(0, f.blow - dt * 0.12);
    $('blowFill').style.width = `${Math.round(f.blow * 100)}%`;
  } else if (f.phase === 'blown') {
    girl.root.position.copy(girlFly);
    if (f.t > 1.6) { next('awaitCut'); $('cutHint').classList.remove('hidden'); }
  } else if (f.phase === 'awaitCut') {
    girl.root.position.copy(girlFly);
  } else if (f.phase === 'cut') {                 // swoop, slam, splat, spring apart
    girl.root.position.copy(girlFly);
    const T = f.t;
    knife.visible = T < 1.5;
    if (T < 0.55) {
      const e = ease(T / 0.55);
      knife.position.set(lerp(34, 0, e), lerp(40, CAKE_TOP + 14, e), lerp(14, -4, e));
      knife.rotation.set(0, lerp(-1.2, 0, e), lerp(0.9, 0, e));
    } else if (T < 0.75) {
      const e = Math.pow((T - 0.55) / 0.2, 3);
      knife.position.set(0, lerp(CAKE_TOP + 14, -11, e), -4);
      knife.rotation.set(0, 0, 0);
    } else if (T < 1.0) {
      knife.position.set(0, -11, -4);
    } else {
      const e = ease(clamp((T - 1.0) / 0.5, 0, 1));
      knife.position.set(lerp(0, 18, e), lerp(-11, 45, e), -4);
      knife.rotation.set(0, 0, -2.5 * e);
    }
    if (T >= 0.75 && !f.sliced) {
      f.sliced = true; shake = 1.3;
      noiseSound(0.6, 700, 0.5, 0.005); tone(90, 0, 0.5, 0.3, 'triangle');
      const top = cake.localToWorld(V(0, CAKE_TOP + 1, 0));
      burst(top, 0xffffff, 40, 16, 1.2, 1.4, glowTex, false);
      burst(top, 0xe32f48, 22, 14, 0.8, 1.4, glowTex, false);
      burst(cake.localToWorld(V(0, -2, 6)), 0xf3d593, 26, 12, 0.7, 1.2, glowTex, false);
    }
    const s = elasticOut(clamp((T - 0.95) / 1.6, 0, 1));
    const wob = Math.sin(T * 9) * Math.exp(-Math.max(0, T - 0.95) * 2.2);
    halfR.position.set(9 * s, Math.max(0, Math.sin(clamp((T - 0.95) / 0.5, 0, 1) * Math.PI)) * 1.5, 0); halfR.rotation.z = -0.14 * s - 0.06 * wob;
    halfL.position.set(-9 * s, Math.max(0, Math.sin(clamp((T - 0.95) / 0.5, 0, 1) * Math.PI)) * 1.5, 0); halfL.rotation.z = 0.14 * s + 0.06 * wob;
    if (T > 2.9) next('beanRise');
  } else if (f.phase === 'beanRise') {            // something rises out of the cake...
    girl.root.position.copy(girlFly);
    const p = clamp(f.t / 2.4, 0, 1);
    bean.visible = true;
    bean.position.set(0, lerp(-6, 12, easeOutBack(p)), 0);
    bean.scale.setScalar(Math.max(0.01, ease(Math.min(1, p * 1.6))));
    bean.rotation.z = Math.sin(t * 3) * 0.12;
    sb.pop = [0, 0, 0]; poseBerryBoy(t, 0);   // he's still tucked inside
    camPos = F(6, 17, 40); look = F(0, 11, 0);
    if (p >= 1) { next('beanWait'); $('whatsThat').classList.remove('hidden'); }
  } else if (f.phase === 'beanWait') {            // "What's that?"
    girl.root.position.copy(girlFly);
    bean.position.y = 12 + Math.sin(t * 2) * 0.4;
    bean.rotation.z = Math.sin(t * 3) * 0.12 + Math.sin(t * 31) * 0.05 * Math.pow(Math.max(0, Math.sin(t * 1.3)), 8);
    poseBerryBoy(t, 0);
    camPos = F(6, 17, 40); look = F(0, 11, 0);
  } else if (f.phase === 'beanOpen') {            // the strawberry wiggles... then pop, pop, pop: head, arms, legs!
    girl.root.position.copy(girlFly);
    const T = f.t;
    berryBody.rotation.z = T < 0.9 ? Math.sin(T * 40) * 0.16 * (T / 0.9) : berryBody.rotation.z;
    const popAt = [0.9, 1.3, 1.65];
    popAt.forEach((at, k) => {
      if (T >= at && !(f.pops ??= [])[k]) {
        f.pops[k] = true; popSound();
        burst(bean.localToWorld(V(0, k === 0 ? 0.6 : k === 1 ? 0 : -0.9, 0.9)), [0xfff176, 0xffffff, 0xffc0d0][k], 18, 8, 0.8, 1);
        if (k === 0) { shake = 0.35; collectSound(); }
        if (k === 1) popLabel('👋 hi!', () => sb.head.localToWorld(V(0.9, 0.95, 0.3)), 2.2, 2.6, '#e8566f');   // a little wave hello
      }
    });
    sb.pop = popAt.map(at => clamp((T - at) / 0.45, 0, 1));
    poseBerryBoy(t, T > 1.9 ? clamp((T - 1.9) / 0.6, 0, 1) : 0);
    camPos = F(6, 16, 36); look = F(0, 12, 0);
    if (T > 2.6) next('struggle');
  } else if (f.phase === 'struggle') {            // he flails about, but a strawberry isn't built for walking
    girl.root.position.copy(girlFly);
    poseBerryBoy(t, 1);
    bean.position.x = Math.sin(f.t * 2.2) * 0.8;   // shuffles a little, gets nowhere
    if (Math.random() < dt * 3) burst(bean.localToWorld(V((Math.random() - 0.5) * 1.6, 1.1, 0.6)), 0xbfe6ff, 1, 2.5, 0.5, 0.8);   // effort droplets
    camPos = F(5, 15, 34); look = F(0, 12, 0);
    if (f.t > 3.4) next('meet');
  } else if (f.phase === 'meet') {             // she floats round behind the strawberry...
    const p = clamp(f.t / 3, 0, 1), e = ease(p);
    poseBerryBoy(t, 1 - e * 0.85);
    bean.position.x = lerp(bean.position.x, 0, 0.1);
    girl.root.position.copy(girlFly).lerp(BITE_G(), e);
    girl.root.quaternion.copy(f.fq).multiply(tq.setFromAxisAngle(AY, lerp(f.gy || 0, biteYaw(), e)));
    camPos = F(4.5, 16, 30); look = F(0, 7, 0).lerp(F(2.6, 13, 0), e); camSpeed = 1.2;
    if (p >= 1) next('bite');
  } else if (f.phase === 'bite') {             // ...hugs it, and takes a cute little nibble
    const T = f.t;
    girl.root.position.copy(BITE_G()).add(F(-0.25, 0, 0.2).multiplyScalar(Math.min(1, T * 2)));
    girl.root.quaternion.copy(f.fq).multiply(tq.setFromAxisAngle(AY, biteYaw())).multiply(tq.setFromAxisAngle(AX, 0.22));
    // nom… nom… nom
    const chomping = T > 0.5 && T < 2.9;
    f.nod = chomping ? 0.28 + Math.max(0, Math.sin((T - 0.5) * 13)) * 0.22 : 0.18;
    f.chompT = (f.chompT ?? 0.5) - dt;
    if (chomping && f.chompT <= 0) {
      f.chompT = 0.48;
      noiseSound(0.12, 2400, 0.12, 0.005); tone(380, 0.02, 0.08, 0.06, 'square');
      const at = sb.bite.getWorldPosition(V());
      burst(at, 0xe8283f, 4, 3, 0.35, 0.6, glowTex, false);
      burst(at.clone().add(F(0, 1.5, 0)), 0xffffff, 1, 1.5, 0.9, 1.6, heartTex, false);
      f.bites = (f.bites || 0) + 1;
      if (f.bites === 1) popLabel('mankeaw mankeaw', () => sb.bite.getWorldPosition(V()).add(F(-1.4, 2.8, 1.2)), 2.1, 3.2);
    }
    if ((f.bites || 0) >= 2) sb.bite.scale.setScalar(Math.min(1, sb.bite.scale.x + dt * 4));   // the bite mark appears
    // he's surprised… then blushes and turns to look at her
    sb.blush.opacity = Math.min(0.85, sb.blush.opacity + dt * (T > 1 ? 0.8 : 0));
    poseBerryBoy(t, T < 1 ? 0.6 : 0.25);
    sb.head.rotation.y = lerp(sb.head.rotation.y, 0.5, 0.06);
    camPos = F(4.5, 15.5, 26); look = F(2.8, 13.5, 0); camSpeed = 1;
    if (T > 3.6) { f.nod = null; next('orbit'); startOrbit(); }
  } else if (f.phase === 'orbit') {            // the planet comes back, and everyone circles it together
    const T = f.t;
    // the cake melts away and the planet grows back where it was
    cake.scale.setScalar(Math.max(0.001, 1 - ease(clamp(T / 1.8, 0, 1))));
    if (T > 1.8) cake.visible = false;
    if (T > 0.8 && !planetGroup.visible) { planetGroup.visible = true; planetGroup.scale.setScalar(0.01); burst(V(), 0xffffff, 50, 18, 2.4, 1.6); chime(); }
    if (planetGroup.visible) planetGroup.scale.setScalar(Math.max(0.01, easeOutBack(clamp((T - 0.8) / 2.6, 0, 1))));
    const o = f.orbit;
    o.angle += dt * 0.11;
    o.items.forEach((it, k) => {
      const th = o.angle + k * (Math.PI * 2 / o.items.length), r = it.radius;
      const pos = o.u.clone().multiplyScalar(Math.cos(th) * r).addScaledVector(o.v, Math.sin(th) * r).addScaledVector(o.n, it.lift + Math.sin(t * 1.1 + k) * 0.5);
      const tan = o.u.clone().multiplyScalar(-Math.sin(th)).addScaledVector(o.v, Math.cos(th));
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V().crossVectors(o.n, tan), o.n, tan));
      const e = ease(clamp((T - 1.2 - k * 0.05) / 3.2, 0, 1));   // glide from wherever they are into the ring
      it.obj.position.copy(it.from).lerp(pos, e);
      it.obj.quaternion.copy(it.fromQ).slerp(q, e);
      if (it.spin) {   // zero gravity: they can't steady themselves — tipping, kicking, flapping, trying to stay upright
        const sd = it.seed, tt = t + sd;
        const tipX = Math.sin(tt * 1.7) * 0.55 + Math.sin(tt * 4.3) * 0.18;
        const tipZ = Math.sin(tt * 1.3 + 1) * 0.65 + Math.sin(tt * 3.7) * 0.2;
        const lurch = Math.pow(Math.max(0, Math.sin(tt * 0.55)), 12) * 2.2;   // every so often a big tumble, then they flail back upright
        it.obj.rotateY(Math.sin(tt * 0.6) * 0.9 * e);
        it.obj.rotateX((tipX + lurch) * e); it.obj.rotateZ(tipZ * e);
        for (const [j, f] of (it.ch.feet || []).entries()) f.rotation.x = Math.sin(tt * 15 + j * Math.PI) * 0.9 * e;   // frantic little kicks
        for (const [j, l] of it.ch.leaves.entries()) l.rotation.x = Math.sin(tt * 11 + j * 1.7) * 0.45 * e;           // leaves flapping like arms
        it.ch.root.position.y = Math.sin(tt * 6) * 0.08 * e;
      }
      it.obj.scale.setScalar(lerp(it.fromS, it.s, e));
    });
    const ep = ease(clamp(T / 1.6, 0, 1));
    for (const pr of f.pair) { pr.obj.position.lerpVectors(pr.p0, pr.p1, ep); pr.obj.quaternion.copy(pr.q0).slerp(new THREE.Quaternion(), ep); pr.obj.scale.setScalar(lerp(pr.s0, pr.s1, ep)); }
    poseBerryBoy(t, 0.3);
    // she can zoom (↑ ↓ / mouse wheel) and swing round (← →) to watch everyone float by
    const zin = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
    f.zoom = clamp((f.zoom ?? 1) * Math.exp(-zin * dt * 0.9) * Math.exp((f.wheel || 0) * 0.0015), 0.52, 1.5); f.wheel = 0;
    f.camYaw = (f.camYaw || 0) + ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * dt * 0.8;
    // closer = lower, almost level with the ring, so the orbiting gang drifts right past the camera
    const dist = 109 * f.zoom, el = lerp(0.1, 0.36, clamp((f.zoom - 0.52) / 0.48, 0, 1));
    camPos = F(0, Math.sin(el) * dist, Math.cos(el) * dist).applyAxisAngle(F(0, 1, 0), f.camYaw);
    look = F(0, lerp(6, 2, clamp((f.zoom - 0.52) / 0.48, 0, 1)), 0); camSpeed = zin || f.camYaw ? 2.2 : 0.7;
    if (T > 8 && !f.ended) { f.ended = true; store.set('bday-done', '1'); openOverlay('ending'); }   // from now on, visits are free roam
  }

  // night falls once she leaves the ground
  if (!['gift', 'board', 'inflate'].includes(f.phase) && (f.phase !== 'lift' || f.t > 4)) { const nk = 1 - Math.exp(-dt * 0.7); sky.material.uniforms.uTop.value.lerp(SKY.nightTop, nk); sky.material.uniforms.uBottom.value.lerp(SKY.nightBottom, nk); starsMat.opacity = Math.min(1, starsMat.opacity + dt * 0.25); }
  // she turns to face the cake (the meet phase handles her turn toward him)
  if (!['meet', 'bite', 'orbit'].includes(f.phase)) {
    const rel = cake.localToWorld(V(0, CAKE_TOP, 0)).sub(girl.root.position).applyQuaternion(f.fq.clone().invert());
    let target = cake.visible ? Math.atan2(rel.x, rel.z) : f.giantYaw ?? 0;   // riding: she looks where the giant looks
    if (f.phase === 'gift') { const g = G.p0.clone().sub(girl.root.position).applyQuaternion(f.fq.clone().invert()); target = Math.atan2(g.x, g.z); }
    f.gy = lerp(f.gy || 0, target, 1 - Math.exp(-dt * 3));
    girl.root.quaternion.copy(f.fq).multiply(tq.setFromAxisAngle(AY, f.gy));
  }
  animateCharacter(girl, t, 0, f.phase === 'bite' ? 'hug' : f.phase === 'gift' ? 'offer' : f.phase === 'board' ? (f.riding ? 'sit' : 'jump') : f.riding ? 'sit' : 'fly');
  if (f.nod != null) girl.parts.head.rotation.x = f.nod;

  // candles flicker, lean away when she blows, and go out
  f.gust = Math.max(0, (f.gust || 0) - dt * 3);
  const blownOut = ['blown', 'awaitCut', 'cut', 'beanRise', 'beanWait', 'beanOpen', 'struggle', 'meet', 'bite', 'orbit'].includes(f.phase);
  for (const [k, fl] of flames.entries()) {
    if (blownOut && fl.out < 1) {
      if (fl.out === 0) puff(fl.half.localToWorld(fl.base.clone().add(V(0, 0.6, 0))), V(0, 2, 0).applyQuaternion(f.fq), 1.2, 1.6, 0xd8d4de);
      fl.out = Math.min(1, fl.out + dt * (2 + k * 0.4));
    }
    const lean = f.gust * (0.6 + Math.sin(t * 40 + k) * 0.25);
    const sc = (1 - fl.out) * (1 + Math.sin(t * 20 + k * 1.7) * 0.12) * (1 - f.gust * 0.3);
    fl.glow.scale.set(1.2 * Math.max(0.001, sc), 1.8 * Math.max(0.001, sc), 1);
    fl.core.scale.setScalar(Math.max(0.001, sc));
    fl.core.rotation.z = fl.glow.material.rotation = lean;
  }

  // chouchous tumbling through space, slowly settling into a gentle drift
  const axis = F(0, 1, 0);
  if (f.phase !== 'orbit') for (const c of flung) {
    c.g.position.addScaledVector(c.vel, dt);
    c.vel.multiplyScalar(Math.exp(-dt * 0.85));
    const d = c.g.position.length();
    if (d > 58) c.g.position.multiplyScalar(58 / d);
    c.g.position.applyAxisAngle(axis, dt * 0.05);
    c.g.position.addScaledVector(axis, Math.sin(t * 0.8 + c.phase) * dt * 0.4);
    c.g.rotation.x += c.spin.x * dt; c.g.rotation.y += c.spin.y * dt; c.g.rotation.z += c.spin.z * dt;
    c.spin.multiplyScalar(Math.exp(-dt * 0.35));
    const cap = c.cap ?? 2.2;   // the giant shrinks back from its balloon size to a big-but-normal chouchou
    c.g.scale.setScalar(c.g.scale.x < cap ? Math.min(cap, c.g.scale.x + dt * 0.6) : Math.max(cap, c.g.scale.y - dt * 1.5));
  }
  updateSmoke(dt);
  updateLabels(dt);

  const k = 1 - Math.exp(-dt * camSpeed);
  camera.position.lerp(camPos, k);
  camLook.lerp(look, k * 1.5);
  // never fly the camera through an elephant cloud
  for (const c of cloudPivot.children) c.visible = c.getWorldPosition(V()).distanceTo(camera.position) > 13;
  camera.up.lerp(F(0, 1, 0), k).normalize();
  shake = Math.max(0, shake - dt * (f.phase === 'rumble' ? 0 : 1.4));
  camera.lookAt(camLook);
  if (shake > 0) camera.position.add(randDir(Math.random).multiplyScalar(shake * 0.35));
}

// ============================================================ adaptive quality
// If the device struggles, quietly step down: resolution, then fuzz shells, then glow and shadows.
const QUALITY = [
  { pr: Math.min(devicePixelRatio, 1.5), shells: true, bloom: true, shadows: true },
  { pr: Math.min(devicePixelRatio, 1.25), shells: true, bloom: true, shadows: true },
  { pr: 1, shells: false, bloom: true, shadows: true },
  { pr: 0.8, shells: false, bloom: false, shadows: true },
  { pr: 0.65, shells: false, bloom: false, shadows: false },
];
const quality = { level: 0, frames: 0, time: 0, settle: 1.5 };
const showShells = obj => obj.traverse(o => { if (o.userData.fuzzShell) o.visible = QUALITY[quality.level].shells; });
function applyQuality() {
  const L = QUALITY[quality.level];
  renderer.setPixelRatio(L.pr); composer.setPixelRatio(L.pr); composer.setSize(innerWidth, innerHeight);
  bloom.enabled = L.bloom;
  sun.castShadow = L.shadows;
  showShells(scene);
}
function watchQuality(realDt) {
  if (quality.settle > 0) { quality.settle -= realDt; return; }
  quality.frames++; quality.time += realDt;
  if (quality.time >= 2) {
    const fps = quality.frames / quality.time;
    if (fps < 28 && quality.level < QUALITY.length - 1) { quality.level++; applyQuality(); quality.settle = 1; }
    quality.frames = 0; quality.time = 0;
  }
}
applyQuality();

// ============================================================ time of day
// The sky follows the real clock in her timezone: starry night, a peachy sunrise, a bright sunny
// day with crisp shadows, a warm sunset, then night again.
const LOOKS = {
  night: { top: 0x0a1033, bottom: 0x272f6b, hemi: 0x8796e0, ground: 0x2b3a44, hemiI: 0.55, sun: 0xa9bbff, sunI: 0.75, stars: 1, soft: 6, exp: 1, cloud: 0.06 },
  dawn:  { top: 0x4660b0, bottom: 0xffb790, hemi: 0xffdcc8, ground: 0x7c8a5c, hemiI: 0.8, sun: 0xffb27c, sunI: 1.5, stars: 0.12, soft: 4, exp: 1, cloud: 0.3 },
  day:   { top: 0x0848c0, bottom: 0x4fa8f2, hemi: 0xeaf5ff, ground: 0x8fb872, hemiI: 0.78, sun: 0xfff1d8, sunI: 2.5, stars: 0, soft: 1.5, exp: 1.05, cloud: 0.42 },
  // the finale keeps its own lighting (the night sky there is handled by the finale itself)
  finale: { hemi: 0xeaf5ff, ground: 0x8fb872, hemiI: 1.05, sun: 0xfff4e6, sunI: 1.6, soft: 5, exp: 1, cloud: 0.42 },
};
for (const L of Object.values(LOOKS)) for (const k of ['top', 'bottom', 'hemi', 'ground', 'sun']) if (L[k] !== undefined) L[k] = new THREE.Color(L[k]);
// sunrise ~06:15, sunset ~17:50 in Bangkok in mid-November
const KEYS = [[0, 'night'], [5.2, 'night'], [6.3, 'dawn'], [7.6, 'day'], [16.6, 'day'], [17.9, 'dawn'], [19, 'night'], [24, 'night']];
const startHour = (() => {   // hour-of-day of startTime in her timezone (fixed offset, Thailand has no DST)
  try {
    const p = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: CONFIG.timeZone }).formatToParts(new Date(startMs));
    return +p.find(x => x.type === 'hour').value + +p.find(x => x.type === 'minute').value / 60;
  } catch { return 0; }
})();
let skyHourOverride = null;
const hourOfDay = () => skyHourOverride ?? (DEMO
  ? ((((now() - openMs) / SKY_HOUR) % 24) + 24) % 24   // demo: midnight when the planet opens, a whole day in ten minutes
  : ((((now() - startMs) / HOUR + startHour) % 24) + 24) % 24);
const look = { top: new THREE.Color(), bottom: new THREE.Color(), hemi: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color() };
function lookAt(h) {
  let i = 0; while (KEYS[i + 1][0] < h) i++;
  const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1], A = LOOKS[a], B = LOOKS[b];
  const k = THREE.MathUtils.smoothstep(h, h0, h1);
  for (const c of ['top', 'bottom', 'hemi', 'ground', 'sun']) look[c].copy(A[c]).lerp(B[c], k);
  for (const n of ['hemiI', 'sunI', 'stars', 'soft', 'exp', 'cloud']) look[n] = lerp(A[n], B[n], k);
  return look;
}
const sunSide = V(), camDirV = V();
let cloudMat = null;   // the elephant clouds glow softly by day and dim down at night
cloudPivot.traverse(o => { if (o.isMesh && o.material.emissive && !cloudMat) cloudMat = o.material; });
// while she waits for the countdown, the night sky drifts through different moods of space
const SPACE = [
  { top: 0x0a1033, bottom: 0x2a2f72, a: 0x6a3fa0, b: 0xd06aa8, neb: 0.6 },   // midnight indigo, violet + pink
  { top: 0x03121e, bottom: 0x0b4150, a: 0x2fd6a0, b: 0x3a6bd6, neb: 0.7 },   // aurora: teal and green
  { top: 0x190d3a, bottom: 0x7a3668, a: 0xff9a8a, b: 0xa07ad6, neb: 0.62 },   // rose dusk: peach and lilac
  { top: 0x020820, bottom: 0x123a7a, a: 0x4ac0e0, b: 0x6a4ad0, neb: 0.65 },   // deep ocean: cyan and purple
  { top: 0x120626, bottom: 0x3f1a5e, a: 0xe05ab0, b: 0xffc070, neb: 0.68 },    // galaxy plum: magenta and gold
].map(P => ({ top: new THREE.Color(P.top), bottom: new THREE.Color(P.bottom), a: new THREE.Color(P.a), b: new THREE.Color(P.b), neb: P.neb }));
let skySnap = true;   // jump straight to the right look on the first frame
function updateSky(dt) {
  const nk = skySnap ? 1 : 1 - Math.exp(-dt * 0.6), u = sky.material.uniforms;
  const h = hourOfDay(), dayT = clamp((h - 6) / 12, 0, 1);
  const L = waitingMode ? lookAt(0) : lookAt(h);
  if (weather.rain > 0 && !waitingMode) {   // a soft grey rainy sky, dimmer sun
    const k = weather.rain;
    L.top.lerp(RAIN_TOP, 0.55 * k); L.bottom.lerp(RAIN_BOTTOM, 0.55 * k); L.sunI *= 1 - 0.6 * k; L.hemiI *= 1 - 0.15 * k; L.stars *= 1 - k;
  }
  u.uTime.value += dt;
  // waiting page: a new space palette every ~22 s (the slow lerp makes the crossfade); at night in play, just a hint of nebula
  const P = waitingMode ? SPACE[Math.floor(u.uTime.value / 22) % SPACE.length] : null;
  const nebK = 1 - Math.exp(-dt * 0.35);
  u.uNeb.value = lerp(u.uNeb.value, P ? P.neb : state === 'finale' ? 0.18 : L.stars * 0.12, skySnap ? 1 : nebK);
  if (P) { u.uNebA.value.lerp(P.a, skySnap ? 1 : nebK); u.uNebB.value.lerp(P.b, skySnap ? 1 : nebK); }
  if (state !== 'finale') {
    u.uTop.value.lerp(P ? P.top : L.top, P ? (skySnap ? 1 : nebK) : nk); u.uBottom.value.lerp(P ? P.bottom : L.bottom, P ? (skySnap ? 1 : nebK) : nk);
    starsMat.opacity = lerp(starsMat.opacity, L.stars, nk);
  }
  const T = state === 'finale' ? LOOKS.finale : L;
  hemi.color.lerp(T.hemi, nk); hemi.groundColor.lerp(T.ground, nk);
  hemi.intensity = lerp(hemi.intensity, T.hemiI, nk);
  sun.color.lerp(T.sun, nk); sun.intensity = lerp(sun.intensity, T.sunI, nk);
  sun.shadow.radius = lerp(sun.shadow.radius, T.soft, nk);
  renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, T.exp, nk);
  starsBigMat.opacity = starsMat.opacity;
  if (cloudMat) cloudMat.emissiveIntensity = lerp(cloudMat.emissiveIntensity, T.cloud, nk);
  // the sun stays on the camera's side so she's always lit, but swings across through the day:
  // low from one side in the morning (long shadows), high at noon, low from the other side at sunset
  camDirV.copy(camera.position).normalize();
  sunSide.crossVectors(camDirV, camera.up).normalize();
  const day = state !== 'finale' && !waitingMode && h > 5.5 && h < 18.5;
  const swing = day ? Math.cos(dayT * Math.PI) * 75 : 25, lift = day ? lerp(20, 45, Math.sin(dayT * Math.PI)) : 25;
  sun.userData.swing = lerp(sun.userData.swing ?? swing, swing, nk); sun.userData.lift = lerp(sun.userData.lift ?? lift, lift, nk);
  sun.position.copy(camDirV).multiplyScalar(60).addScaledVector(sunSide, sun.userData.swing).addScaledVector(camera.up, sun.userData.lift);
  skySnap = false;
  updateShootingStar(dt);
}
function updateShootingStar(dt) {
  const m = shooting.material;
  if (shooting.visible) {
    shoot.t += dt;
    const k = shoot.t / shoot.life;
    shooting.position.addScaledVector(shoot.vel, dt);
    m.opacity = Math.sin(Math.min(1, k) * Math.PI) * starsMat.opacity;
    shooting.scale.set(lerp(8, 34, Math.min(1, k * 2.5)), 0.9, 1);
    if (k >= 1) { shooting.visible = false; shoot.wait = waitingMode ? 2 + Math.random() * 5 : state === 'play' ? (DEMO ? 10 + Math.random() * 12 : 18 + Math.random() * 25) : 5 + Math.random() * 12; }   // lots while she waits; rarer (wish-worthy) in play
    return;
  }
  if (starsMat.opacity < 0.5 || (shoot.wait -= dt) > 0) return;
  // start somewhere in the upper part of the view and fall diagonally across it
  const fwd = V(), right = V(), up = V();
  camera.matrixWorld.extractBasis(right, up, fwd); fwd.negate();
  const dir = Math.random() < 0.5 ? 1 : -1, ang = -(0.25 + Math.random() * 0.35);   // slope, in screen terms
  shooting.position.copy(camera.position).addScaledVector(fwd, 220)
    .addScaledVector(up, 45 + Math.random() * 45).addScaledVector(right, (-dir) * (40 + Math.random() * 90));
  shoot.vel.copy(right).multiplyScalar(Math.cos(ang) * dir).addScaledVector(up, Math.sin(ang)).multiplyScalar(150 + Math.random() * 60);
  m.rotation = dir > 0 ? ang : Math.PI - ang;
  shoot.t = 0; shoot.life = 0.9 + Math.random() * 0.5; shooting.visible = true; shoot.wished = false;
}
if (DEBUG) { window.__hour = h => { skyHourOverride = h; }; window.__shoot = () => { shoot.wait = 0; }; }

// ============================================================ loop
const clock = new THREE.Clock();
let simT = 0;
function frame() {
  fitView();
  const rawDt = clock.getDelta();
  watchQuality(rawDt);
  step(Math.min(rawDt, 0.05), clock.elapsedTime + simT);
  requestAnimationFrame(frame);
}
// debug: advance the game by hand (works even while the tab is hidden)
if (DEBUG) window.__tick = (n = 30, dt = 1 / 30) => { for (let i = 0; i < n; i++) { simT += dt; step(dt, clock.elapsedTime + simT); } };
function step(dt, t) {
  if (state === 'finale') updateFinale(dt, t); else updatePlayer(dt, t);
  updateChickens(dt, t);
  if (state === 'play') updateWaterhole(dt);
  updateBerries(dt);
  updateStatue(dt, t);
  updateLife(dt, t);
  updateParticles(dt);
  cloudPivot.rotation.y += dt * 0.02;
  for (const c of cloudPivot.children) {   // elephants gently bob up and down
    c.userData.base ??= c.position.clone();
    c.position.copy(c.userData.base).multiplyScalar(1 + 0.012 * Math.sin(t * 0.8 + (c.userData.bob || 0)));
  }
  updateSky(dt);
  hemi.position.copy(camera.up);   // sky light always comes from her "up"
  sky.position.copy(camera.position);
  sky.material.uniforms.uUp.value.copy(camera.up);
  scene.fog.color.copy(sky.material.uniforms.uBottom.value);
  if (DEBUG && window.__cam) { camera.position.copy(window.__cam.pos); camera.up.copy(window.__cam.pos).normalize(); camera.lookAt(window.__cam.look); }   // debug: hold the camera on a spot
  composer.render();
}

// keep the game exactly the size of the window. Checked every frame as well as on 'resize',
// because some window changes (zoom, fullscreen, docked panels) don't always send a resize event.
let viewW = 0, viewH = 0;
function fitView() {
  const w = innerWidth, h = innerHeight;
  if (w === viewW && h === viewH) return;
  viewW = w; viewH = h;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false); composer.setSize(w, h);
}
addEventListener('resize', fitView);

// chickens pulled out on earlier visits: roaming, or still waiting to hand over their letter
for (const i of pulled) addRoamer(i, new THREE.Quaternion().setFromUnitVectors(AY, flowerDirs[i]), makeCabbageChicken(new THREE.Color(PALETTE[i % PALETTE.length])), false);
// on a return visit, the waterhole already has its regulars
for (const r of roamers.filter(x => x.mode === 'roam').slice(0, WATER_SPOTS.length)) sendToWater(r, WATER_SPOTS.find(sp => !sp.taken), true);
{
  const extra = [rain.lines, rainbow, fireflies.points, butterflies.left, butterflies.right, nameLabel, ...bottles.map(b => b.mesh), ...ripples];
  const was = extra.map(o => o.visible); extra.forEach(o => { o.visible = true; });
  renderer.compile(scene, camera);
  extra.forEach((o, i) => { o.visible = was[i]; });
}
updateBerryHUD(false);
syncChickens();
if (store.get('bday-done') === '1') enterPostGame();
updateTimeUI();
setInterval(() => { syncChickens(); updateTimeUI(); }, 1000);
frame();
