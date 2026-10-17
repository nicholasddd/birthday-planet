// Cabbage chicken: a round, fluffy white plush chicken with a little yellow beak,
// sleepy slit eyes and a big fuzzy cabbage-leaf bow on its head.
import * as THREE from 'three';
import { softify } from './planet.js';
import { bake } from './perf.js';

const velvet = (color, sheenColor, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheenColor), ...extra,
});
const furM = softify(velvet(0xfbf9f3, 0xffffff), { scale: 3, strength: 0.3 });
const furShellM = softify(velvet(0xfbf9f3, 0xffffff), { scale: 3, strength: 0.3, shell: 0.56 });
const leafM = softify(velvet(0x86c93f, 0xd8ff9a), { scale: 2.6, strength: 0.75 });
const leafShellM = softify(velvet(0x86c93f, 0xd8ff9a), { scale: 2.6, strength: 0.75, shell: 0.56 });
// all the little coloured bits (beak, feet, eyes, envelope, flower) share ONE material and get
// their colour from the geometry, so they merge into a single draw call per group
const detailM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
const ball = new THREE.SphereGeometry(1, 18, 12);   // low-poly: up to 24 of these are on screen at once
const tinted = (geo, hex) => {
  const g = geo.clone(), col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const tintCache = new Map();
const tintedBall = hex => { if (!tintCache.has(hex)) tintCache.set(hex, tinted(ball, hex)); return tintCache.get(hex); };

// a fuzzy ellipsoid: velvet core plus a cut-out "fur" shell for a soft silhouette
function fuzzy(parent, core, shell, [x, y, z], [sx, sy, sz], [rx = 0, ry = 0, rz = 0] = []) {
  const m = typeof core === 'number' ? new THREE.Mesh(tintedBall(core), detailM) : new THREE.Mesh(ball, core);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  if (shell) { const s = new THREE.Mesh(ball, shell); s.scale.setScalar(1.06); s.userData.fuzzShell = true; m.add(s); }
  parent.add(m);
  return m;
}

export function makeCabbageChicken(flowerColor) {
  const root = new THREE.Group();     // feet at y = 0, facing +Z

  fuzzy(root, furM, furShellM, [0, 0.6, 0], [0.68, 0.58, 0.62]);                         // round fluffy body
  for (const s of [-1, 1]) {
    fuzzy(root, furM, furShellM, [0.64 * s, 0.55, -0.02], [0.13, 0.3, 0.32], [0, 0, 0.3 * s]);   // stubby wings
    fuzzy(root, 0xf1a43a, null, [0.2 * s, 0.03, 0.14], [0.11, 0.04, 0.15]);                        // feet
    fuzzy(root, 0x2a2030, null, [0.2 * s, 0.75, 0.56], [0.036, 0.013, 0.02], [0, 0.35 * s, 0.12 * s]); // sleepy slit eyes
  }
  fuzzy(root, 0xf2cd3c, null, [0, 0.66, 0.6], [0.12, 0.1, 0.15], [0.2, 0, 0]);               // little yellow beak

  // big fuzzy cabbage-leaf bow (the two big lobes can flap when it struggles)
  fuzzy(root, leafM, leafShellM, [0, 1.08, -0.03], [0.6, 0.26, 0.56]);
  const leaves = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0.15 * s, 1.2, -0.05); root.add(pivot);
    fuzzy(pivot, leafM, leafShellM, [0.25 * s, 0.1, 0], [0.42, 0.3, 0.3], [0, 0.2 * s, -0.55 * s]);
    return pivot;
  });
  fuzzy(root, leafM, leafShellM, [0, 1.26, 0.04], [0.17, 0.15, 0.15]);
  fuzzy(root, leafM, leafShellM, [0.15, 1.24, -0.38], [0.36, 0.28, 0.25], [-0.4, 0, 0]);

  // what it carries in its beak: a love letter and a flower
  const mouth = new THREE.Group(); mouth.position.set(0, 0.63, 0.74); root.add(mouth);
  const envelope = new THREE.Group(); envelope.position.set(0.2, -0.04, 0.02); envelope.rotation.z = -0.15; mouth.add(envelope);
  envelope.add(new THREE.Mesh(tinted(new THREE.BoxGeometry(0.42, 0.28, 0.03), 0xfff8ee), detailM));
  const flap = new THREE.Mesh(tinted(new THREE.ConeGeometry(0.21, 0.13, 4, 1), 0xfff8ee), detailM);
  flap.rotation.set(Math.PI / 2, Math.PI / 4, Math.PI); flap.scale.set(1.4, 1, 0.12); flap.position.set(0, 0.06, 0.02); envelope.add(flap);
  const seal = new THREE.Mesh(tinted(new THREE.SphereGeometry(0.04, 10, 6), 0xff6f91), detailM); seal.position.set(0, 0, 0.025); seal.scale.z = 0.4; envelope.add(seal);

  const flower = new THREE.Group(); flower.position.set(-0.08, 0.0, 0.03); mouth.add(flower);
  const stem = new THREE.Mesh(tinted(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6), 0x4caf50), detailM); stem.rotation.z = Math.PI / 2 + 0.25; stem.position.x = -0.18; flower.add(stem);
  const head = new THREE.Group(); head.position.set(-0.4, 0.06, 0); head.rotation.z = 0.3; flower.add(head);
  const petalG = tinted(new THREE.SphereGeometry(0.08, 8, 6), new THREE.Color(flowerColor).multiplyScalar(1.15).getHex());
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, p = new THREE.Mesh(petalG, detailM);
    p.scale.set(1, 0.45, 0.6); p.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0); p.rotation.z = a; head.add(p);
  }
  head.add(new THREE.Mesh(tinted(new THREE.SphereGeometry(0.05, 8, 6), 0xffe066), detailM));

  // merge the static parts so each chouchou is a handful of draw calls
  bake(root, [mouth, ...leaves]); bake(envelope); bake(flower);
  return { root, mouth, envelope, flower, leaves };
}
