import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { buildPlanet, R, mulberry32, randDir } from './planet.js';
import { makeChibi, animateCharacter } from './characters.js';
import { makeCabbageChicken } from './chickens.js';

// ============================================================ utils
const TOTAL = 24;
const HOUR = 3600 * 1000;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AY = V(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const $ = id => document.getElementById(id);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ============================================================ time + progress
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
let timeOffset = DEBUG ? Number(store.get('bday-offset') || 0) : 0;
const startMs = new Date(CONFIG.startTime).getTime();
const now = () => Date.now() + timeOffset;
const unlockTime = i => startMs + i * HOUR;
function unlockedCount() {
  const t = now() - startMs;
  if (t < 0) return 0;
  return Math.min(TOTAL, Math.floor(t / HOUR) + 1);
}
let collected = new Set();
try { collected = new Set(JSON.parse(store.get('bday-collected') || '[]')); } catch {}
let pulled = new Set();      // chickens pulled out of the ground (letter may not be taken yet)
try { pulled = new Set(JSON.parse(store.get('bday-pulled') || '[]')); } catch {}
for (const i of collected) pulled.add(i);
const saveProgress = () => {
  store.set('bday-collected', JSON.stringify([...collected]));
  store.set('bday-pulled', JSON.stringify([...pulled]));
};

// ============================================================ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
  uniforms: { uTop: { value: SKY.dayTop.clone() }, uBottom: { value: SKY.dayBottom.clone() }, uUp: { value: new THREE.Vector3(0, 1, 0) } },
  vertexShader: `varying vec3 vDir; void main() { vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uUp; varying vec3 vDir;
    void main() { float h = dot(normalize(vDir), uUp); gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(-0.25, 0.75, h)), 1.0); }`,
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
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 140 });
sun.shadow.bias = -0.0005;
sun.shadow.radius = 5;
scene.add(sun, sun.target);

// stars (only shown when night falls in the finale)
const starsMat = new THREE.PointsMaterial({ color: 0xfff6e0, size: 1.3, sizeAttenuation: true, transparent: true, opacity: 0, fog: false });
{
  const g = new THREE.BufferGeometry(), pts = [], rng = mulberry32(7);
  for (let i = 0; i < 1500; i++) pts.push(...randDir(rng).multiplyScalar(250 + rng() * 100).toArray());
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, starsMat));
}

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
scene.add(girl.root);
const boy = makeChibi(CONFIG.boy, false);
boy.root.visible = false;
scene.add(boy.root);

// arrow above her head pointing at the nearest stuck chicken
const arrowPivot = new THREE.Group(); arrowPivot.position.y = 3.1; girl.root.add(arrowPivot);
{
  const g = new THREE.ConeGeometry(0.22, 0.6, 12); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.9);
  arrowPivot.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc400, emissiveIntensity: 1.5 })));
}

// ============================================================ cabbage chickens
// Each hour a cabbage chicken gets stuck in the ground (glowing so it's easy to find).
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
  const d = AY.clone().applyQuaternion(r.q);
  r.group.position.copy(d).multiplyScalar(R + world.standHeight(d).h);
  r.group.quaternion.copy(r.q);
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
let modalOpen = false;
let lastUnlocked = unlockedCount();
const pendingFinale = { v: false };

function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p2 = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p2(m)}:${p2(ss)}` : `${m}:${p2(ss)}`;
}
function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
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
  $('clock').textContent = new Date(now()).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const u = unlockedCount();
  let waiting = 0, holding = 0;
  for (let i = 0; i < u; i++) { if (!pulled.has(i)) waiting++; else if (!collected.has(i)) holding++; }
  $('count').textContent = `${collected.size} / ${TOTAL}`;
  $('catBadge').textContent = collected.size;
  const st = $('status');
  st.classList.toggle('ready', waiting + holding > 0);
  if (state === 'finale') st.classList.add('hidden');
  else if (collected.size === TOTAL) {
    if (!$('btnFinale')) {
      st.innerHTML = '💖 All 24 cabbage chickens rescued! <button id="btnFinale">Begin the finale ✨</button>';
      $('btnFinale').onclick = startFinale;
    }
  } else if (u === 0) st.textContent = `🌙 The first cabbage chicken pops up in ${fmtDur(startMs - now())}`;
  else {
    const next = u < TOTAL ? ` · next in ${fmtDur(unlockTime(u) - now())}` : '';
    st.textContent = waiting > 0
      ? `🥬 ${waiting} cabbage chicken${waiting > 1 ? 's are' : ' is'} stuck in the ground!${next}`
      : holding > 0
        ? `💌 ${holding > 1 ? holding + ' chickens are' : 'A chicken is'} waiting to give you a letter!${next}`
        : `🌱 Next cabbage chicken pops up in ${fmtDur(unlockTime(u) - now())}`;
  }
  if (u > lastUnlocked) {
    toast('🥬 A cabbage chicken just got stuck somewhere! Follow the light ✨');
    chime();
    notify('🥬 A cabbage chicken is stuck!', 'Go pull it out — it has a letter for you 💌');
  }
  lastUnlocked = u;
}

function renderCatalogue() {
  const grid = $('grid'); grid.innerHTML = '';
  const u = unlockedCount();
  $('catSummary').textContent = `${collected.size} of ${TOTAL} letters collected`;
  for (let i = 0; i < TOTAL; i++) {
    const el = document.createElement('button');
    const L = CONFIG.letters[i] || {};
    if (collected.has(i)) {
      el.className = 'slot collected';
      el.style.setProperty('--c', '#' + new THREE.Color(PALETTE[i % PALETTE.length]).getHexString());
      el.innerHTML = `<span class="em">🐣${EMOJI[i % EMOJI.length]}</span><b></b>`;
      el.querySelector('b').textContent = L.title || `Hour ${i + 1}`;
      el.onclick = () => { closeOverlay('catalogue'); openLetter(i); };
    } else if (pulled.has(i)) {
      el.className = 'slot waiting';
      el.innerHTML = `<span class="em">🐣💌</span><b>Hour ${i + 1}</b><span>Has a letter for you!</span>`;
      el.onclick = () => closeOverlay('catalogue');
    } else if (i < u) {
      el.className = 'slot waiting';
      el.innerHTML = `<span class="em">🥬</span><b>Hour ${i + 1}</b><span>Stuck in the ground!</span>`;
      el.onclick = () => closeOverlay('catalogue');
    } else {
      el.className = 'slot locked';
      el.innerHTML = `<span class="em">🔒</span><b>Hour ${i + 1}</b><span>${new Date(unlockTime(i)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    }
    grid.appendChild(el);
  }
}

function openOverlay(id) { $(id).classList.add('open'); modalOpen = true; }
function closeOverlay(id) {
  $(id).classList.remove('open');
  modalOpen = ['intro', 'offer', 'letter', 'catalogue', 'ending'].some(k => $(k).classList.contains('open'));
}

function openLetter(i) {
  const L = CONFIG.letters[i] || {};
  $('letterHour').textContent = `Cabbage chicken ${i + 1} of ${TOTAL}`;
  $('letterTitle').textContent = L.title || `Hour ${i + 1}`;
  const img = $('letterImg'), txt = $('letterText');
  img.classList.add('hidden'); txt.classList.add('hidden');
  txt.textContent = L.text || '';
  if (L.image) {
    img.onload = () => img.classList.remove('hidden');
    img.onerror = () => txt.classList.remove('hidden');
    img.src = L.image;
  } else txt.classList.remove('hidden');
  openOverlay('letter');
}

$('btnStart').onclick = () => {
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  closeOverlay('intro');
  state = 'play';
  $('hud').classList.remove('hidden');
  if (matchMedia('(pointer: coarse)').matches) $('joystick').classList.remove('hidden');
  else $('keys').classList.remove('hidden');
  let waiting = 0; for (let i = 0; i < unlockedCount(); i++) if (!pulled.has(i)) waiting++;
  if (waiting) setTimeout(() => toast(`🥬 ${waiting} cabbage chicken${waiting > 1 ? 's are' : ' is'} stuck and waiting for you!`), 600);
};
$('btnIntroBell').onclick = askNotify;
$('btnBell').onclick = askNotify;
$('btnSound').onclick = () => { muted = !muted; store.set('bday-muted', muted ? '1' : '0'); $('btnSound').textContent = muted ? '🔇' : '🔊'; };
$('btnSound').textContent = muted ? '🔇' : '🔊';
$('btnCat').onclick = () => { renderCatalogue(); openOverlay('catalogue'); };
$('btnCloseCat').onclick = () => closeOverlay('catalogue');
$('btnCloseLetter').onclick = () => {
  closeOverlay('letter');
  if (pendingFinale.v) { pendingFinale.v = false; toast('💫 Something magical is happening…'); setTimeout(startFinale, 1500); }
};
$('btnEndCat').onclick = () => { closeOverlay('ending'); renderCatalogue(); openOverlay('catalogue'); };
$('btnReplay').onclick = () => location.reload();
$('introTitle').textContent = `Happy Birthday, ${CONFIG.herName}! 🎂`;
$('endTitle').textContent = `Happy Birthday, ${CONFIG.herName} 💖`;
updateBell();

// debug panel: open the page with ?debug to time-travel while testing
if (DEBUG) {
  const d = document.createElement('div'); d.id = 'debug';
  const add = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; d.appendChild(b); };
  const setOff = v => { timeOffset = v; store.set('bday-offset', String(v)); syncChickens(); updateTimeUI(); };
  d.append('DEBUG');
  add('Jump to start', () => setOff(startMs - Date.now() + 1000));
  add('+1 hour', () => setOff(timeOffset + HOUR));
  add('Unlock all', () => setOff(startMs + TOTAL * HOUR - Date.now()));
  add('Collect all → finale', () => { for (let i = 0; i < TOTAL; i++) if (!collected.has(i)) freeChicken(i, true); for (const r of roamers) if (r.mode === 'present') receiveFrom(r, true); updateTimeUI(); startFinale(); });
  add('Planet view on/off', () => { overview = !overview; });
  add('Teleport to a chicken', () => {
    const b = buried.values().next().value; if (!b) return toast('No stuck chickens right now');
    const d = AY.clone().applyQuaternion(b.quaternion);
    pq.setFromUnitVectors(AY, d).multiply(tq.setFromAxisAngle(AX, -2.2 / R));   // stand just behind it
  });
  add('Reset everything', () => { store.set('bday-collected', '[]'); store.set('bday-pulled', '[]'); store.set('bday-offset', '0'); location.reload(); });
  document.body.appendChild(d);
}

// ============================================================ input
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state === 'finale' && finale?.phase === 'await' && (e.code === 'Space' || e.code === 'Enter')) cutCake();
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (nearHolder) offerLetter(nearHolder); else pullPress(); } }
});
$('btnPull').addEventListener('pointerdown', e => { e.preventDefault(); pullPress(); });
$('btnAsk').addEventListener('pointerdown', e => { e.preventDefault(); if (nearHolder) offerLetter(nearHolder); });
$('btnReceive').onclick = () => { closeOverlay('offer'); if (offering) receiveFrom(offering); offering = null; };
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
renderer.domElement.addEventListener('pointerdown', () => { if (state === 'finale' && finale?.phase === 'await') cutCake(); });

// ============================================================ player
const pq = new THREE.Quaternion();   // her orientation on the planet
const tq = new THREE.Quaternion();
const camLook = V(0, R, 0);
camera.position.set(0, R + 7, -11);
let walkAmt = 0, wet = false, girlH = 0, overview = false;
let faceYaw = 0, faceTarget = 0;   // which way she visually faces, relative to the camera's heading

function blocked(oldDir, newDir, pad = 0.35) {
  for (const o of obstacles) {
    const dn = o.dir.angleTo(newDir) * R;
    if (dn < o.rad + pad && dn < o.dir.angleTo(oldDir) * R) return true;
  }
  return false;
}

let nearChicken = null, nearHolder = null, offering = null;
function updatePlayer(dt, t) {
  const canMove = state === 'play' && !modalOpen;
  // camera-relative movement: W/S forward/back, A/D left/right. The camera never turns;
  // she simply runs (and faces) whichever way you push.
  let mx = 0, mz = 0;
  if (canMove) {
    mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    mx = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) - joy.x;
  }
  let len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; len = 1; }
  if (len > 0.05) {
    const axis = V(mz, 0, -mx).normalize();
    const nq = pq.clone().multiply(tq.setFromAxisAngle(axis, (len * (wet ? 4 : 7) * dt) / R));
    const od = AY.clone().applyQuaternion(pq), nd = AY.clone().applyQuaternion(nq);
    if (!blocked(od, nd)) pq.copy(nq);
    faceTarget = Math.atan2(mx, mz);
  }
  pq.normalize();
  const here = AY.clone().applyQuaternion(pq), stand = world.standHeight(here);
  wet = stand.wet;
  girlH = lerp(girlH, stand.h, 1 - Math.exp(-dt * 12));
  girl.root.position.copy(here).multiplyScalar(R + girlH);
  if (wet && len > 0.1 && Math.random() < 0.25) burst(here.clone().multiplyScalar(R - 0.1), 0xffffff, 2, 2.5, 0.35, 0.5);

  // nearest stuck chicken: arrow + pulling
  let best = null, bestD = Infinity;
  for (const b of buried.values()) {
    const d = b.position.distanceTo(girl.root.position);
    if (d < bestD) { bestD = d; best = b; }
  }
  nearChicken = best && bestD < 2.8 && canMove ? best : null;
  $('btnPull').classList.toggle('hidden', !nearChicken);
  nearHolder = null;
  if (canMove && !nearChicken) for (const r of roamers) if (r.mode === 'present' && r.group.position.distanceTo(girl.root.position) < 3) nearHolder = r;
  $('btnAsk').classList.toggle('hidden', !nearHolder);
  arrowPivot.visible = !!best && bestD > 6;
  if (best) {
    const local = girl.root.worldToLocal(best.position.clone());
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
  animateCharacter(girl, t, walkAmt, pulling ? 'pull' : 'walk');
  if (nearChicken) $('pullFill').style.width = `${Math.round(nearChicken.userData.pull * 100)}%`;

  // camera follows behind & above, always looking the same way
  const k = 1 - Math.exp(-dt * 4);
  camera.position.lerp((overview ? V(0, R * 2.4, -R * 1.6) : V(0, R + 7, -11)).applyQuaternion(pq), k);
  camLook.lerp(overview ? V() : V(0, R + 1.5, 4).applyQuaternion(pq), k);
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
    ch.root.position.y = SINK + 0.4;
    if (!instant) burst(holder.localToWorld(V(0, 0.6, 0)), PALETTE[i % PALETTE.length], 40, 7, 0.8, 1.4);
    else ch.root.position.y = 0;
  }
  pulled.add(i); if (instant) collected.add(i);
  saveProgress();
  if (instant) return;
  nearChicken = null; $('btnPull').classList.add('hidden');
  popSound();
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
  collected.add(r.i); saveProgress();
  updateTimeUI();
  if (silent) return;
  burst(r.group.localToWorld(V(0, 1.6, 0)), 0xffffff, 8, 2.5, 0.8, 1.6, heartTex, false);
  burst(r.group.localToWorld(V(0, 0.7, 0.8)), PALETTE[r.i % PALETTE.length], 24, 5, 0.6, 1.2);
  collectSound();
  if (collected.size === TOTAL) pendingFinale.v = true;
  setTimeout(() => openLetter(r.i), 400);
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
    u.ch.root.position.y = SINK + u.pull * 0.45 + u.tug * 0.06;
    u.ch.root.rotation.z = Math.sin(t * 35) * 0.12 * u.pull + Math.sin(t * 2 + u.i) * 0.04;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + u.i);
    u.halo.scale.setScalar(2.8 + pulse * 1.2);
    u.ring.scale.setScalar(1 + ((t * 0.6 + u.i * 0.1) % 1) * 1.5);
    u.ring.material.opacity = 1 - ((t * 0.6 + u.i * 0.1) % 1);
    u.beam.material.opacity = 0.45 + pulse * 0.3;
  }
  // freed chickens
  for (const r of roamers) {
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
}

// ============================================================ cake (finale)
const cake = new THREE.Group(); cake.visible = false; scene.add(cake);
const halfL = new THREE.Group(), halfR = new THREE.Group(); cake.add(halfL, halfR);
const flames = [];
{
  const tiers = [{ r: 16, h: 7, c: 0xffd6e7 }, { r: 11.5, h: 6, c: 0xfff3f8 }, { r: 7, h: 5, c: 0xffc1dc }];
  const sponge = new THREE.MeshStandardMaterial({ color: 0xf6d7a7, roughness: 0.9, side: THREE.DoubleSide });
  const jam = new THREE.MeshStandardMaterial({ color: 0xff5c7a, roughness: 0.6, side: THREE.DoubleSide });
  let y = -9;
  for (const [ti, tr] of tiers.entries()) {
    const icing = new THREE.MeshStandardMaterial({ color: tr.c, roughness: 0.5 });
    const trim = new THREE.MeshStandardMaterial({ color: ti % 2 ? 0xff8fb8 : 0xffffff, roughness: 0.4 });
    for (const [half, start, sgn] of [[halfR, 0, 1], [halfL, Math.PI, -1]]) {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(tr.r, tr.r, tr.h, 64, 1, false, start, Math.PI), icing);
      body.position.y = y + tr.h / 2; half.add(body);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(tr.r * 2, tr.h), sponge);
      face.rotation.y = Math.PI / 2; face.position.set(0.01 * sgn, y + tr.h / 2, 0); half.add(face);
      const filling = new THREE.Mesh(new THREE.PlaneGeometry(tr.r * 2 - 0.4, 0.6), jam);
      filling.rotation.y = Math.PI / 2; filling.position.set(0.02 * sgn, y + tr.h / 2, 0); half.add(filling);
      const tg = new THREE.TorusGeometry(tr.r, 0.45, 8, 48, Math.PI); tg.rotateX(Math.PI / 2); tg.rotateY((sgn * Math.PI) / 2);
      const top = new THREE.Mesh(tg, trim); top.position.y = y + tr.h; half.add(top);
      const bot = new THREE.Mesh(tg, trim); bot.position.y = y + 0.2; half.add(bot);
      // sprinkles of drips
      for (let k = 0; k < 10; k++) {
        const a = start + ((k + 0.5) / 10) * Math.PI;
        const drip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), trim);
        drip.scale.set(1, 1.8, 0.6);
        drip.position.set(Math.sin(a) * tr.r, y + tr.h - 0.8, Math.cos(a) * tr.r);
        half.add(drip);
      }
    }
    y += tr.h;
  }
  // candles around the top tier
  const candleMs = [0x6fd3ff, 0xfff176, 0xb084ff, 0x81f5c1].map(c => new THREE.MeshStandardMaterial({ color: c }));
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    const half = Math.sin(a) >= 0 ? halfR : halfL;
    const cdl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 10), candleMs[k % 4]);
    cdl.position.set(Math.sin(a) * 4.5, y + 1.2, Math.cos(a) * 4.5); half.add(cdl);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb340, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    fl.position.set(cdl.position.x, y + 2.9, cdl.position.z); fl.scale.set(1.2, 1.8, 1); half.add(fl); flames.push(fl);
  }
  shadowAll(cake);
}
const knife = new THREE.Group(); knife.visible = false; cake.add(knife);
{
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 26), new THREE.MeshStandardMaterial({ color: 0xe8eef7, metalness: 0.9, roughness: 0.2 }));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 7), new THREE.MeshStandardMaterial({ color: 0x8d5a3b }));
  handle.position.set(0, 0.3, 16.5);
  knife.add(blade, handle);
}

// ============================================================ finale
let finale = null;
const F = (x, y, z) => V(x, y, z).applyQuaternion(finale.fq);

function startFinale() {
  if (state === 'finale') return;
  state = 'finale';
  ['status', 'keys'].forEach(id => $(id).classList.add('hidden'));
  $('joystick').classList.add('hidden');
  arrowPivot.visible = false;
  for (const b of buried.values()) planetGroup.remove(b);
  buried.clear();
  $('btnPull').classList.add('hidden');
  finale = { phase: 'float', t: 0, fq: pq.clone(), start: girl.root.position.clone(), look: camLook.clone() };
  girl.root.quaternion.copy(pq);
  cake.quaternion.copy(finale.fq);
  cake.scale.setScalar(0.001);
  cake.visible = true;
  boy.root.quaternion.copy(finale.fq);
}
function cutCake() {
  if (finale.phase !== 'await') return;
  $('cutHint').classList.add('hidden');
  finale.phase = 'cut'; finale.t = 0;
}
function next(phase) { finale.phase = phase; finale.t = 0; }

function updateFinale(dt, t) {
  const f = finale; f.t += dt;
  let camPos = F(10, 24, 70), look = F(0, 6, 0), camSpeed = 1.5;
  const girlFly = F(-15, 14, 6);
  if (f.phase === 'float') {
    const p = clamp(f.t / 5, 0, 1), e = ease(p);
    girl.root.position.copy(f.start).lerp(F(0, R + 12, 0), e);
    girl.root.scale.setScalar(lerp(1, 3, e));
    camSpeed = 0.9;
    if (p >= 1) { next('morph'); burst(V(), 0xffffff, 80, 30, 3, 2); }
  } else if (f.phase === 'morph') {
    const p = clamp(f.t / 4, 0, 1);
    planetGroup.scale.setScalar(Math.max(0.001, 1 - ease(clamp(p / 0.6, 0, 1))));
    cake.scale.setScalar(Math.max(0.001, easeOutBack(clamp((p - 0.3) / 0.7, 0, 1))));
    girl.root.position.copy(F(0, R + 12, 0)).lerp(girlFly, ease(p));
    if (f.t > 1.2 && !f.puffed) { f.puffed = true; burst(F(0, 0, 0), 0xffd6e7, 60, 25, 2.5, 1.8); }
    if (p >= 1) { planetGroup.visible = false; next('await'); $('cutHint').classList.remove('hidden'); }
  } else if (f.phase === 'await') {
    girl.root.position.copy(girlFly);
  } else if (f.phase === 'cut') {
    const p = clamp(f.t / 4.5, 0, 1);
    girl.root.position.copy(girlFly);
    knife.visible = p < 0.6;
    if (p < 0.35) knife.position.set(0, lerp(22, -10, ease(p / 0.35)), -3);
    else knife.position.set(0, lerp(-10, 30, ease(clamp((p - 0.35) / 0.25, 0, 1))), -3);
    if (p > 0.3 && !f.sliced) { f.sliced = true; burst(F(0, 9, 0), 0xffffff, 40, 10, 1.2, 1.2); }
    const s = ease(clamp((p - 0.45) / 0.55, 0, 1));
    halfR.position.x = 8 * s; halfR.rotation.z = -0.12 * s;
    halfL.position.x = -8 * s; halfL.rotation.z = 0.12 * s;
    if (p >= 1) { next('reveal'); boy.root.visible = true; }
  } else if (f.phase === 'reveal') {
    const p = clamp(f.t / 3.5, 0, 1);
    girl.root.position.copy(girlFly);
    boy.root.position.copy(F(0, lerp(-6, 13, easeOutBack(p)), 0));
    boy.root.scale.setScalar(Math.max(0.01, lerp(0.5, 3, ease(p))));
    if (Math.random() < 0.3) burst(boy.root.position.clone().add(F(0, 4, 0)), 0xfff176, 2, 4, 0.8, 1);
    animateCharacter(boy, t, 0, 'fly');
    if (p >= 1) next('meet');
  } else if (f.phase === 'meet') {
    const p = clamp(f.t / 3, 0, 1), e = ease(p);
    girl.root.position.copy(girlFly);
    boy.root.position.copy(F(0, 13, 0)).lerp(F(-10.8, 14, 6), e).add(F(0, Math.sin(p * Math.PI) * 4, 0));
    girl.root.quaternion.copy(f.fq).multiply(tq.setFromAxisAngle(AY, 0.5 * e));
    boy.root.quaternion.copy(f.fq).multiply(tq.setFromAxisAngle(AY, -0.5 * e));
    animateCharacter(boy, t, 0, 'fly');
    look = F(0, 6, 0).lerp(F(-13, 16, 6), e);
    if (p >= 1) { next('fly'); burst(F(-12.9, 22, 6), 0xffffff, 18, 6, 2, 2, heartTex, false); }
  } else if (f.phase === 'fly') {
    const p = clamp(f.t / 7, 0, 1), e = ease(p);
    const lift = F(Math.sin(p * 6) * 3, 60 * e, -30 * e);
    girl.root.position.copy(girlFly).add(lift);
    boy.root.position.copy(F(-10.8, 14, 6)).add(lift);
    animateCharacter(boy, t, 0, 'fly');
    if (Math.random() < 0.25) burst(girl.root.position.clone().add(F(2, 2, 0)), 0xffffff, 1, 2, 1.4, 2.5, heartTex, false);
    look = F(-13, 16, 6).lerp(F(-13, 40, -10), e);
    if (p > 0.55 && !f.ended) { f.ended = true; openOverlay('ending'); }
  }
  if (f.phase !== 'float' || f.t > 1.5) { const nk = 1 - Math.exp(-dt * 0.8); sky.material.uniforms.uTop.value.lerp(SKY.nightTop, nk); sky.material.uniforms.uBottom.value.lerp(SKY.nightBottom, nk); starsMat.opacity = Math.min(1, starsMat.opacity + dt * 0.3); }
  animateCharacter(girl, t, 0, 'fly');
  for (const fl of flames) fl.scale.y = 1.6 + Math.sin(t * 20 + fl.position.x) * 0.25;

  const k = 1 - Math.exp(-dt * camSpeed);
  camera.position.lerp(camPos, k);
  camLook.lerp(look, k * 1.5);
  camera.up.lerp(F(0, 1, 0), k).normalize();
  camera.lookAt(camLook);
}

// ============================================================ loop
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (state === 'finale') updateFinale(dt, t); else updatePlayer(dt, t);
  updateChickens(dt, t);
  updateParticles(dt);
  cloudPivot.rotation.y += dt * 0.02;
  for (const c of cloudPivot.children) {   // elephants gently bob up and down
    c.userData.base ??= c.position.clone();
    c.position.copy(c.userData.base).multiplyScalar(1 + 0.012 * Math.sin(t * 0.8 + (c.userData.bob || 0)));
  }
  // keep the sun roughly behind the camera so the visible side is always lit
  const camDir = camera.position.clone().normalize();
  const side = V().crossVectors(camDir, camera.up).normalize();
  sun.position.copy(camDir).multiplyScalar(60).addScaledVector(side, 25).addScaledVector(camera.up, 25);
  hemi.position.copy(camera.up);   // sky light always comes from her "up"
  sky.position.copy(camera.position);
  sky.material.uniforms.uUp.value.copy(camera.up);
  scene.fog.color.copy(sky.material.uniforms.uBottom.value);
  composer.render();
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// chickens pulled out on earlier visits: roaming, or still waiting to hand over their letter
for (const i of pulled) addRoamer(i, new THREE.Quaternion().setFromUnitVectors(AY, flowerDirs[i]), makeCabbageChicken(new THREE.Color(PALETTE[i % PALETTE.length])), false);
syncChickens();
updateTimeUI();
setInterval(() => { syncChickens(); updateTimeUI(); }, 1000);
frame();
