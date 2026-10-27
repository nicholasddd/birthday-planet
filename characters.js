// Chibi plush-doll characters (based on the character sheet):
// big head, cream face with two oval eyes, stubby boots. She has shoulder-length side-parted hair,
// a white sleeveless dress and a little smile; he has a short cut, a jumper and trousers.
import * as THREE from 'three';
import { softify } from './planet.js';
import { bake } from './perf.js';

const soft = (color, sheenColor = 0xffffff, extra = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(sheenColor), ...extra });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
const ball = (r, seg = 24) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));

// a strand of hair or ribbon tail: a capsule pointing from a to b
function strand(mat, a, b, r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 6, 12), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}

export function makeChibi(o, isGirl) {
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig);
  const parts = {};
  const sweaterM = softify(soft(o.outfit, 0xffffff), { scale: 2.2, strength: 0.35 });
  const hairM = softify(soft(o.hair, o.hairSheen ?? 0x9a6a55, { roughness: 0.85, sheenRoughness: 0.4 }), { scale: 1.6, strength: 0.7 });
  const faceM = soft(o.face, 0xffffff);
  const skinM = soft(o.skin, 0xffe8dc);
  const bootM = soft(o.boots, 0x8a6a5a);
  const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x1c1214, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 });

  // stubby legs + round boots (the boy gets trousers that show below his sweater)
  const legM = isGirl ? bootM : soft(o.pants ?? 0x3e4a63, 0x8a9ac0);
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set((isGirl ? 0.17 : 0.16) * s, isGirl ? 0.34 : 0.48, 0.02);
    if (isGirl) hip.add(mesh(new THREE.CapsuleGeometry(0.12, 0.08, 6, 12), bootM, 0, -0.12, 0));
    else { hip.add(mesh(new THREE.CapsuleGeometry(0.135, 0.22, 6, 12), legM, 0, -0.2, 0)); hip.add(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.1, 14), bootM, 0, -0.34, 0)); }
    if (!isGirl) hip.position.y -= 0.14;   // boots sit on the ground
    const boot = mesh(ball(0.155), bootM, 0, isGirl ? -0.21 : -0.36, 0.04); boot.scale.set(1, 0.72, 1.25); hip.add(boot);
    if (!isGirl) hip.position.y += 0.15;
    rig.add(hip); parts[s < 0 ? 'hipR' : 'hipL'] = hip;
  }

  // girl: bell-shaped oversized sweater dress with a soft wavy hem · boy: a shorter, straighter jumper over trousers
  const profile = (isGirl
    ? [[0.0, 0.26], [0.5, 0.27], [0.6, 0.33], [0.59, 0.44], [0.5, 0.62], [0.38, 0.77], [0.25, 0.88], [0.14, 0.93], [0.0, 0.94]]
    : [[0.0, 0.44], [0.4, 0.45], [0.45, 0.5], [0.45, 0.64], [0.41, 0.78], [0.3, 0.89], [0.15, 0.94], [0.0, 0.95]])
    .map(([x, y]) => new THREE.Vector2(x, y));
  if (!isGirl) {   // trouser top + a ribbed jumper hem
    rig.add(mesh(new THREE.CylinderGeometry(0.34, 0.33, 0.14, 24), legM, 0, 0.45, 0));
    const hem = mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), sweaterM, 0, 0.47, 0); hem.rotation.x = Math.PI / 2; rig.add(hem);
  }
  const dressG = new THREE.LatheGeometry(profile, 48);
  { const p = dressG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
      const k = isGirl ? 1 + 0.05 * Math.sin(a * 7) * THREE.MathUtils.smoothstep(0.55, 0.27, y) : 1;
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    dressG.computeVertexNormals(); }
  rig.add(new THREE.Mesh(dressG, sweaterM));
  const collar = mesh(new THREE.TorusGeometry(0.14, 0.055, 10, 28), isGirl ? skinM : sweaterM, 0, 0.92, 0); collar.rotation.x = Math.PI / 2; rig.add(collar);

  // arms: puffy sleeves for him, bare arms + little shoulder straps for her sleeveless top
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.28 * s, 0.82, 0);
    if (isGirl) {
      sh.add(mesh(new THREE.CapsuleGeometry(0.095, 0.26, 8, 14), skinM, 0, -0.2, 0), mesh(ball(0.085, 16), skinM, 0, -0.42, 0));
      const strap = mesh(new THREE.CapsuleGeometry(0.05, 0.12, 6, 10), sweaterM, -0.1 * s, 0.07, 0); strap.rotation.z = 0.5 * s; rig.add(strap); strap.position.add(sh.position);
    } else {
      const sleeve = mesh(new THREE.CapsuleGeometry(0.15, 0.18, 8, 16), sweaterM, 0, -0.18, 0); sleeve.scale.set(1.05, 1, 0.95);
      const cuff = mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 20), sweaterM, 0, -0.38, 0); cuff.rotation.x = Math.PI / 2;
      sh.add(sleeve, cuff, mesh(ball(0.08, 16), skinM, 0, -0.44, 0));
    }
    rig.add(sh); parts[s < 0 ? 'shR' : 'shL'] = sh;
  }

  // big round head with a blank cream face
  const head = new THREE.Group(); head.position.y = 1.6; head.scale.setScalar(1.3); rig.add(head); parts.head = head;   // big chibi head
  const skull = mesh(ball(0.58, 40), faceM); skull.scale.set(1, 0.95, 0.95); head.add(skull);
  for (const s of [-1, 1]) {
    const eye = mesh(ball(0.1, 24), eyeM, 0.2 * s, -0.04, 0.5); eye.scale.set(0.72, 1.12, 0.35); head.add(eye);
    const ear = mesh(ball(0.09, 16), skinM, 0.58 * s, -0.12, 0.02); ear.scale.set(0.55, 1, 0.8); head.add(ear);
  }

  if (isGirl) {   // a soft closed-mouth smile and rosy cheeks
    const smile = mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 16, Math.PI * 0.8), eyeM, 0, -0.2, 0.535);
    smile.rotation.z = Math.PI * 1.1; head.add(smile);
    const blushM = new THREE.MeshBasicMaterial({ color: 0xf4a7a7, transparent: true, opacity: 0.55, depthWrite: false });
    for (const s of [-1, 1]) { const b = mesh(ball(0.07, 12), blushM, 0.31 * s, -0.17, 0.46); b.scale.set(1.3, 0.7, 0.3); b.rotation.y = 0.5 * s; head.add(b); }
  }

  // hair
  if (isGirl) {   // shoulder-length, straight, parted on one side, with a swept fringe and face-framing curtains
    head.add(mesh(ball(0.63, 40), hairM, 0, 0.06, -0.08));                                  // crown
    const back = mesh(ball(0.58, 32), hairM, 0, -0.32, -0.2); back.scale.set(1.02, 1.08, 0.7); head.add(back);   // falls to the shoulders
    const fringeA = mesh(ball(0.48, 32), hairM, 0.12, 0.41, 0.17); fringeA.scale.set(0.98, 0.34, 0.66); fringeA.rotation.z = -0.22; head.add(fringeA);
    const fringeB = mesh(ball(0.28, 24), hairM, -0.36, 0.36, 0.15); fringeB.scale.set(0.75, 0.45, 0.7); head.add(fringeB);
    head.add(strand(hairM, [-0.1, 0.52, 0.36], [0.46, 0.16, 0.42], 0.075));    // the long swept bang from the side part
    head.add(strand(hairM, [-0.22, 0.48, 0.36], [-0.47, 0.14, 0.38], 0.06));
    for (const s of [-1, 1]) {
      head.add(strand(hairM, [0.5 * s, 0.22, 0.26], [0.5 * s, -0.66, 0.24], 0.085));   // front curtains past the cheeks
      head.add(strand(hairM, [0.57 * s, 0.1, 0.04], [0.58 * s, -0.74, 0.0], 0.095));   // sides
      head.add(strand(hairM, [0.42 * s, 0.05, -0.36], [0.44 * s, -0.8, -0.3], 0.12));  // back sections
      head.add(mesh(ball(0.095, 16), hairM, 0.47 * s, -0.68, 0.24));                 // ends tucking softly inward
      head.add(mesh(ball(0.1, 16), hairM, 0.55 * s, -0.76, 0.0));
    }
    head.add(mesh(ball(0.18, 20), hairM, 0, -0.8, -0.3));
  } else {        // short boy cut: snug cap, short sides above the ears, a spiky little fringe
    const cap = mesh(ball(0.62, 40), hairM, 0, 0.1, -0.1); cap.scale.set(1, 0.92, 1); head.add(cap);
    const fringe = mesh(ball(0.5, 32), hairM, 0, 0.4, 0.2); fringe.scale.set(1.08, 0.34, 0.6); head.add(fringe);
    for (const [x, rz, len] of [[-0.3, 0.35, 0.26], [-0.1, 0.1, 0.3], [0.1, -0.12, 0.28], [0.3, -0.38, 0.24]]) {   // fringe spikes
      const spike = mesh(new THREE.ConeGeometry(0.1, len, 10), hairM, x, 0.34, 0.44); spike.rotation.set(Math.PI - 0.5, 0, rz); head.add(spike);
    }
    for (const s of [-1, 1]) { const side = mesh(ball(0.2, 20), hairM, 0.52 * s, 0.14, 0.02); side.scale.set(0.5, 0.9, 1.1); head.add(side); }   // short sides
  }

  if (!isGirl) {
    // a few messy tufts sticking up on top, and a cowlick
    for (const [x, y, z, r] of [[0, 0.6, -0.02, 0.2], [0.24, 0.52, 0.04, 0.15], [-0.25, 0.52, 0.0, 0.16], [-0.1, 0.46, -0.36, 0.17]])
      head.add(mesh(ball(r, 20), hairM, x, y, z));
    const lick = mesh(new THREE.ConeGeometry(0.06, 0.26, 8), hairM, 0.05, 0.8, -0.02); lick.rotation.z = -0.5; head.add(lick);
  }

  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  // merge static parts: body, then each moving limb/head on its own
  const pivots = [parts.hipL, parts.hipR, parts.shL, parts.shR, parts.head];
  bake(rig, pivots); pivots.forEach(p => bake(p));
  return { root, rig, parts };
}

export function animateCharacter(ch, t, walk, pose = 'walk') {
  const p = ch.parts, lerp = (a, b, k) => a + (b - a) * k;
  if (pose === 'fly') {
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.z = lerp(p[k].rotation.z, s * 2.6, 0.08); p[k].rotation.x = 0; }
    p.hipL.rotation.x = Math.sin(t * 2) * 0.3; p.hipR.rotation.x = -Math.sin(t * 2) * 0.3;
    p.head.rotation.z = Math.sin(t * 1.5) * 0.06;
    ch.rig.position.y = Math.sin(t * 2) * 0.1;
    return;
  }
  if (pose === 'hug') {             // arms wrapped round something in front of her
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.x = lerp(p[k].rotation.x, -1.25, 0.2); p[k].rotation.z = lerp(p[k].rotation.z, -0.35 * s, 0.2); }
    p.hipL.rotation.x = Math.sin(t * 3) * 0.25 - 0.2; p.hipR.rotation.x = -Math.sin(t * 3) * 0.25 - 0.2;   // happy little leg swing
    ch.rig.rotation.z = 0; ch.rig.position.y = 0;
    return;
  }
  if (pose === 'reach' || pose === 'offer') {   // reaching up to pick a berry / holding one out
    const up = pose === 'reach';
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.z = lerp(p[k].rotation.z, s * (up ? 2.3 : 0.25), 0.3); p[k].rotation.x = lerp(p[k].rotation.x, up ? -0.4 : -1.35, 0.3); }
    p.hipL.rotation.x *= 0.7; p.hipR.rotation.x *= 0.7;
    ch.rig.rotation.x = lerp(ch.rig.rotation.x, up ? -0.12 : 0.1, 0.3); ch.rig.rotation.z *= 0.8;
    ch.rig.position.y = up ? Math.abs(Math.sin(t * 10)) * 0.06 : 0;
    p.head.rotation.z = 0;
    return;
  }
  if (pose === 'sit') {             // sitting with her legs out in front, hands holding on, feet swinging happily
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.z = lerp(p[k].rotation.z, s * 0.75, 0.2); p[k].rotation.x = lerp(p[k].rotation.x, -0.35, 0.2); }
    p.hipL.rotation.x = -1.35 + Math.sin(t * 4) * 0.25; p.hipR.rotation.x = -1.35 - Math.sin(t * 4) * 0.25;
    ch.rig.rotation.x = lerp(ch.rig.rotation.x, -0.1, 0.2); ch.rig.rotation.z = Math.sin(t * 1.6) * 0.05;
    ch.rig.position.y = -0.22;
    p.head.rotation.z = Math.sin(t * 1.3) * 0.08;
    return;
  }
  if (pose === 'eat') {             // sitting, legs out, both hands holding a cupcake up to her mouth, chewing away
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.x = lerp(p[k].rotation.x, -1.15, 0.15); p[k].rotation.z = lerp(p[k].rotation.z, -0.42 * s, 0.15); }
    p.hipL.rotation.x = -1.35 + Math.sin(t * 2) * 0.12; p.hipR.rotation.x = -1.35 - Math.sin(t * 2) * 0.12;
    ch.rig.rotation.x = lerp(ch.rig.rotation.x, -0.06, 0.2); ch.rig.rotation.z = Math.sin(t * 1.2) * 0.03;
    ch.rig.position.y = -0.22;
    p.head.rotation.x = 0.12 + Math.abs(Math.sin(t * 6)) * 0.07;   // nom nom
    p.head.rotation.z = Math.sin(t * 1.5) * 0.05;
    return;
  }
  if (pose === 'dance') {           // a happy little dance: arms waving in turn, bouncing, hips swaying
    const b = Math.sin(t * 9);
    p.shL.rotation.set(-0.3, 0, 2.2 + Math.sin(t * 4.5) * 0.6); p.shR.rotation.set(-0.3, 0, -2.2 + Math.sin(t * 4.5 + Math.PI) * 0.6);
    p.hipL.rotation.x = Math.max(0, b) * -0.6; p.hipR.rotation.x = Math.max(0, -b) * -0.6;
    ch.rig.position.y = Math.abs(b) * 0.18; ch.rig.rotation.z = Math.sin(t * 4.5) * 0.14; ch.rig.rotation.x = 0;
    p.head.rotation.z = Math.sin(t * 4.5 + 1) * 0.15;
    return;
  }
  if (pose === 'stretch') {         // arms up high, up on her toes: a big lazy stretch
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.z = lerp(p[k].rotation.z, s * 2.8, 0.08); p[k].rotation.x = lerp(p[k].rotation.x, 0, 0.08); }
    p.hipL.rotation.x *= 0.8; p.hipR.rotation.x *= 0.8;
    ch.rig.rotation.x = lerp(ch.rig.rotation.x, -0.12, 0.06); ch.rig.position.y = lerp(ch.rig.position.y, 0.05, 0.06);
    p.head.rotation.z = Math.sin(t * 1.2) * 0.08;
    return;
  }
  if (pose === 'stargaze') {        // lying back on the grass, looking up at the stars
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.z = lerp(p[k].rotation.z, s * 1.4, 0.05); p[k].rotation.x = lerp(p[k].rotation.x, 0.2, 0.05); }
    p.hipL.rotation.x = lerp(p.hipL.rotation.x, 0.05 + Math.sin(t * 0.8) * 0.08, 0.05); p.hipR.rotation.x = lerp(p.hipR.rotation.x, -0.05, 0.05);
    ch.rig.rotation.x = lerp(ch.rig.rotation.x, -1.42, 0.04); ch.rig.position.y = lerp(ch.rig.position.y, 0.3, 0.04);
    p.head.rotation.z = Math.sin(t * 0.5) * 0.06;
    return;
  }
  if (pose === 'jump') {            // arms up, knees tucked
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.z = lerp(p[k].rotation.z, s * 1.9, 0.25); p[k].rotation.x = lerp(p[k].rotation.x, 0, 0.25); }
    p.hipL.rotation.x = lerp(p.hipL.rotation.x, -0.7, 0.25); p.hipR.rotation.x = lerp(p.hipR.rotation.x, -0.5, 0.25);
    ch.rig.rotation.x *= 0.8; ch.rig.rotation.z *= 0.8; ch.rig.position.y = 0;
    return;
  }
  if (pose === 'pull') {            // arms out, leaning back, tugging
    const tug = Math.sin(t * 18) * 0.08;
    for (const [k, s] of [['shL', 1], ['shR', -1]]) { p[k].rotation.x = lerp(p[k].rotation.x, -1.35, 0.3); p[k].rotation.z = 0.15 * s; }
    p.hipL.rotation.x = 0.35; p.hipR.rotation.x = 0.35;
    ch.rig.rotation.x = -0.28 + tug; ch.rig.rotation.z = 0;
    p.head.rotation.z = tug;
    ch.rig.position.y = 0;
    return;
  }
  ch.rig.rotation.x *= 0.8;
  const s = Math.sin(t * 12) * 0.8 * walk;
  p.hipL.rotation.x = s; p.hipR.rotation.x = -s;
  p.shL.rotation.x = -s * 0.7; p.shR.rotation.x = s * 0.7;
  p.shL.rotation.z = 0.35; p.shR.rotation.z = -0.35;
  p.head.rotation.z = Math.sin(t * 6) * 0.05 * walk;           // little head waddle
  ch.rig.rotation.z = Math.sin(t * 12) * 0.05 * walk;
  ch.rig.position.y = Math.abs(Math.sin(t * 12)) * 0.07 * walk + Math.sin(t * 2) * 0.015;
}
