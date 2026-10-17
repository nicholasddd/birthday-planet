// Chibi plush-doll characters (based on the character sheet):
// big head, blank cream face with two oval eyes, messy hair, cosy sweater dress, stubby boots.
import * as THREE from 'three';
import { softify } from './planet.js';

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
  const hairM = softify(soft(o.hair, 0x9a6a55, { roughness: 0.85, sheenRoughness: 0.4 }), { scale: 1.6, strength: 0.7 });
  const faceM = soft(o.face, 0xffffff);
  const skinM = soft(o.skin, 0xffe8dc);
  const bootM = soft(o.boots, 0x8a6a5a);
  const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x1c1214, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 });

  // stubby legs + round boots
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.17 * s, 0.34, 0.02);
    hip.add(mesh(new THREE.CapsuleGeometry(0.12, 0.08, 6, 12), bootM, 0, -0.12, 0));
    const boot = mesh(ball(0.155), bootM, 0, -0.21, 0.04); boot.scale.set(1, 0.72, 1.25); hip.add(boot);
    rig.add(hip); parts[s < 0 ? 'hipR' : 'hipL'] = hip;
  }

  // bell-shaped oversized sweater with a soft wavy hem
  const profile = [[0.0, 0.26], [0.5, 0.27], [0.6, 0.33], [0.59, 0.44], [0.5, 0.62], [0.38, 0.77], [0.25, 0.88], [0.14, 0.93], [0.0, 0.94]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const dressG = new THREE.LatheGeometry(profile, 48);
  { const p = dressG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
      const k = 1 + 0.05 * Math.sin(a * 7) * THREE.MathUtils.smoothstep(0.55, 0.27, y);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    dressG.computeVertexNormals(); }
  rig.add(new THREE.Mesh(dressG, sweaterM));
  const collar = mesh(new THREE.TorusGeometry(0.14, 0.055, 10, 28), sweaterM, 0, 0.92, 0); collar.rotation.x = Math.PI / 2; rig.add(collar);

  // puffy sleeves with tiny hands
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.28 * s, 0.82, 0);
    const sleeve = mesh(new THREE.CapsuleGeometry(0.15, 0.18, 8, 16), sweaterM, 0, -0.18, 0); sleeve.scale.set(1.05, 1, 0.95);
    const cuff = mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 20), sweaterM, 0, -0.38, 0); cuff.rotation.x = Math.PI / 2;
    sh.add(sleeve, cuff, mesh(ball(0.08, 16), skinM, 0, -0.44, 0));
    rig.add(sh); parts[s < 0 ? 'shR' : 'shL'] = sh;
  }

  // big round head with a blank cream face
  const head = new THREE.Group(); head.position.y = 1.6; head.scale.setScalar(1.3); rig.add(head); parts.head = head;   // big chibi head
  const skull = mesh(ball(0.58, 40), faceM); skull.scale.set(1, 0.95, 0.95); head.add(skull);
  for (const s of [-1, 1]) {
    const eye = mesh(ball(0.1, 24), eyeM, 0.2 * s, -0.04, 0.5); eye.scale.set(0.72, 1.12, 0.35); head.add(eye);
    const ear = mesh(ball(0.09, 16), skinM, 0.58 * s, -0.12, 0.02); ear.scale.set(0.55, 1, 0.8); head.add(ear);
  }

  // hair: back cap, fringe, side strands
  head.add(mesh(ball(0.63, 40), hairM, 0, 0.04, -0.14));
  const fringe = mesh(ball(0.5, 32), hairM, 0, 0.36, 0.16); fringe.scale.set(1.12, 0.4, 0.66); head.add(fringe);
  for (const s of [-1, 1]) {
    head.add(strand(hairM, [0.1 * s, 0.42, 0.4], [0.4 * s, 0.14, 0.44], 0.085));     // parted bangs sweeping to the sides
    head.add(strand(hairM, [0.45 * s, 0.2, 0.32], [0.55 * s, -0.36, 0.22], 0.075));     // face-framing locks
    head.add(strand(hairM, [0.56 * s, 0.05, 0.12], [0.62 * s, -0.42, 0.06], 0.05));   // loose wisps
  }

  if (isGirl) {
    // messy high bun
    const bun = new THREE.Group(); bun.position.set(0.04, 0.66, -0.2); bun.scale.setScalar(1.35); head.add(bun);
    bun.add(mesh(ball(0.26, 28), hairM));
    for (const [rx, ry, r] of [[0.4, 0.2, 0.17], [1.3, 1.1, 0.15], [0.9, 2.2, 0.13]]) {
      const coil = mesh(new THREE.TorusGeometry(r, 0.075, 10, 24), hairM, 0, 0.06, 0); coil.rotation.set(rx, ry, 0); bun.add(coil);
    }
    bun.add(mesh(ball(0.14, 20), hairM, -0.05, 0.22, 0.02));
    bun.add(strand(hairM, [0.1, 0.25, 0.05], [0.24, 0.32, 0.1], 0.03));                // flyaway strands
    bun.add(strand(hairM, [-0.12, 0.2, -0.05], [-0.28, 0.24, -0.12], 0.03));

    // blue scrunchie + ribbon bow with long tails
    const ribbonM = softify(soft(o.ribbon, 0xd8e4ff, { side: THREE.DoubleSide }), { scale: 2, strength: 0.3 });
    const scr = mesh(new THREE.TorusGeometry(0.2, 0.06, 10, 28), ribbonM, 0.04, 0.5, -0.18); scr.rotation.x = Math.PI / 2 - 0.3; head.add(scr);
    const bow = new THREE.Group(); bow.position.set(0.46, 0.56, -0.2); bow.rotation.set(0, 1.1, -0.3); bow.scale.setScalar(1.35); head.add(bow);
    for (const s of [-1, 1]) {
      const loop = mesh(new THREE.TorusGeometry(0.11, 0.065, 12, 24), ribbonM, 0.16 * s, 0.05, 0); loop.scale.set(1.45, 0.85, 2.0); loop.rotation.z = -0.4 * s; bow.add(loop);
      const tail = mesh(new THREE.BoxGeometry(0.13, 0.8, 0.025), ribbonM, 0.08 * s, -0.36, 0.16); tail.rotation.set(-0.4, 0, 0.2 * s); bow.add(tail);
    }
    bow.add(mesh(ball(0.075, 16), ribbonM));
  } else {
    // short messy tufts
    for (const [x, y, z, r] of [[0, 0.55, -0.05, 0.2], [0.22, 0.5, 0.05, 0.16], [-0.24, 0.5, 0.02, 0.17], [0.08, 0.45, 0.3, 0.15], [-0.12, 0.42, -0.35, 0.18]])
      head.add(mesh(ball(r, 20), hairM, x, y, z));
  }

  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
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
  const s = Math.sin(t * 12) * 0.8 * walk;
  p.hipL.rotation.x = s; p.hipR.rotation.x = -s;
  p.shL.rotation.x = -s * 0.7; p.shR.rotation.x = s * 0.7;
  p.shL.rotation.z = 0.35; p.shR.rotation.z = -0.35;
  p.head.rotation.z = Math.sin(t * 6) * 0.05 * walk;           // little head waddle
  ch.rig.rotation.z = Math.sin(t * 12) * 0.05 * walk;
  ch.rig.position.y = Math.abs(Math.sin(t * 12)) * 0.07 * walk + Math.sin(t * 2) * 0.015;
}
