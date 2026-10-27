// Little things she can carry: a glowing star wand (I), a chouchou parasol (P) and a chouchou pool float (O).
// Each is built once, baked into a handful of draw calls, and simply shown or hidden.
import * as THREE from 'three';
import { bake } from './perf.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const CREAM = 0xfff6e2, LEAF = 0x8fd061, LEAF_DARK = 0x6fb84a, BEAK = 0xffcf3f, INK = 0x2a1d1a;

// a chouchou face (two eyes + a little beak) stuck onto a surface point, facing outward along `n`
function face(group, at, n, size = 1) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const black = std(INK, { roughness: 0.3 }), yellow = std(BEAK, { roughness: 0.5 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055 * size, 10, 8), black);
    eye.position.copy(at).addScaledVector(side, s * 0.17 * size).addScaledVector(up, 0.06 * size);
    eye.scale.set(0.8, 1.15, 0.5); eye.quaternion.copy(q); group.add(eye);
  }
  const beak = new THREE.Mesh(new THREE.SphereGeometry(0.075 * size, 12, 8), yellow);
  beak.position.copy(at).addScaledVector(up, -0.06 * size).addScaledVector(n, 0.03 * size);
  beak.scale.set(1.2, 0.8, 0.9); beak.quaternion.copy(q); group.add(beak);
}

// ---------------------------------------------------------------- star wand
export function makeStarWand(glowTex) {
  const root = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.55, 8), std(0xfff0c8, { roughness: 0.35 }));
  stick.position.y = 0.27; root.add(stick);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), std(0xffc6dc)); root.add(knob);
  const shape = new THREE.Shape();
  for (let k = 0; k <= 10; k++) {
    const r = k % 2 ? 0.1 : 0.24, a = (k / 10) * Math.PI * 2 + Math.PI / 2;
    k ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2 });
  g.center();
  const star = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc23a, emissiveIntensity: 1.1, roughness: 0.4 }));
  star.position.y = 0.66; root.add(star);
  root.traverse(m => { if (m.isMesh) m.castShadow = true; });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe3a0, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = 0.66; halo.scale.setScalar(0.85); root.add(halo);
  return { root, star, halo };
}

// ---------------------------------------------------------------- parasol (Animal-Crossing style, chouchou-themed)
export function makeParasol() {
  const root = new THREE.Group();
  const RAD = 1.35, H = 0.62;
  // canopy: a scalloped cream dome with a leafy green rim, like a chouchou's body under its cabbage leaves
  const dome = new THREE.SphereGeometry(RAD, 48, 12, 0, Math.PI * 2, 0, Math.PI * 0.46);
  const p = dome.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color(), cream = new THREE.Color(CREAM), leaf = new THREE.Color(0xa6dc78);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), phi = Math.atan2(z, x), rim = 1 - y / RAD;   // 0 at the top, ~1 at the edge
    const k = 1 + 0.06 * Math.pow(rim, 3) * Math.cos(phi * 10);                                    // scalloped edge
    p.setXYZ(i, x * k, y * H, z * k);
    c.copy(cream).lerp(leaf, THREE.MathUtils.smoothstep(rim, 0.8, 0.9) * (0.75 + 0.25 * Math.cos(phi * 10)));
    if (Math.cos(phi * 5) > 0.92 && rim < 0.82) c.multiplyScalar(0.94);                             // faint panel seams
    cols.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  dome.computeVertexNormals();
  const canopy = new THREE.Mesh(dome, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.y = 2.3; root.add(canopy);
  // cabbage leaves on top, just like a chouchou's head
  const leafM = std(LEAF, { roughness: 0.9 }), leafD = std(LEAF_DARK, { roughness: 0.9 });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4, l = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10), k % 2 ? leafD : leafM);
    l.position.set(Math.cos(a) * 0.24, 2.3 + RAD * H + 0.02, Math.sin(a) * 0.24); l.scale.set(1, 0.42, 0.78); l.rotation.y = -a; root.add(l);
  }
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), leafM); bud.position.y = 2.3 + RAD * H + 0.13; root.add(bud);
  // its face on the front of the canopy
  const th = 0.95, at = new THREE.Vector3(0, Math.cos(th) * RAD * H, Math.sin(th) * RAD).add(new THREE.Vector3(0, 2.3, 0));
  const n = new THREE.Vector3(0, Math.cos(th) / H, Math.sin(th)).normalize();
  face(root, at.addScaledVector(n, 0.01), n, 1.4);
  // pole + curved handle
  const wood = std(0xd9a877, { roughness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 2.5, 8), wood); pole.position.y = 1.15; root.add(pole);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 8, 16, Math.PI), wood); hook.position.set(0.11, -0.1, 0); hook.rotation.z = Math.PI; root.add(hook);
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  bake(root);
  return { root };
}

// ---------------------------------------------------------------- pool float
export function makeFloat() {
  const root = new THREE.Group();
  const g = new THREE.TorusGeometry(0.95, 0.34, 12, 36);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color(), cream = new THREE.Color(CREAM), leaf = new THREE.Color(0xa6dc78);
  for (let i = 0; i < p.count; i++) {   // cream and leaf-green stripes
    const a = Math.atan2(p.getZ(i), p.getX(i));
    c.copy(Math.sin(a * 4) > 0 ? cream : leaf);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  root.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 })));
  // a chouchou head on the front, with its little leaves
  const n = new THREE.Vector3(0, 0.25, 1).normalize();
  face(root, new THREE.Vector3(0, 0.1, 1.27), n, 1.3);
  const leafM = std(LEAF, { roughness: 0.9 });
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), leafM); l.position.set(s * 0.14, 0.36, 0.98); l.scale.set(1, 0.45, 0.8); l.rotation.z = s * 0.4; root.add(l); }
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  bake(root);
  return { root };
}

// ---------------------------------------------------------------- a little cupcake, for a sunny-day snack
export function makeCupcake() {
  const root = new THREE.Group();
  // pleated paper case: alternating stripes, a little wider at the top
  const caseG = new THREE.CylinderGeometry(0.2, 0.15, 0.2, 20, 1, true);
  const p = caseG.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.set(Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 10) > 0 ? 0xf7f1e6 : 0xe9dcc8); cols.set([c.r, c.g, c.b], i * 3); }
  caseG.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const wrap = new THREE.Mesh(caseG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  root.add(wrap);
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20).rotateX(Math.PI / 2), std(0xe9dcc8)); base.position.y = -0.1; root.add(base);
  // chocolate sponge top + a swirl of white frosting
  const cake = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x7a4a2e, { roughness: 0.85 }));
  cake.position.y = 0.09; cake.scale.y = 0.6; root.add(cake);
  const frost = std(0xfffaf2, { roughness: 0.5 });
  [[0.17, 0.16], [0.12, 0.24], [0.07, 0.31]].forEach(([r, y]) => { const f = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), frost); f.position.y = y; f.scale.y = 0.62; root.add(f); });
  // rainbow sprinkles
  const sprM = ['#ff7fae', '#7cc4ff', '#ffd54a', '#8fe08a', '#c9a6ff'].map(h => std(h, { roughness: 0.6 }));
  for (let k = 0; k < 12; k++) {
    const a = k * 2.4, r = 0.05 + (k % 3) * 0.04, sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.035, 2, 4), sprM[k % sprM.length]);
    sp.position.set(Math.cos(a) * r, 0.31 - r * 0.6, Math.sin(a) * r); sp.rotation.set(a, a * 1.7, 1.2); root.add(sp);
  }
  root.traverse(m => { if (m.isMesh) m.castShadow = true; });
  bake(root);
  return { root };
}
