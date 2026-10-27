// Little bits of life on the planet: fireflies, butterflies, rain, a rainbow, message bottles.
// Everything here is built to cost one or two draw calls, however many there are.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const zTex = canvasTex(64, 64, (x) => {   // a sleepy "z"
  x.font = 'bold 46px Quicksand, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(255,255,255,.95)'; x.strokeText('z', 32, 34);
  x.fillStyle = '#7d88c9'; x.fillText('z', 32, 34);
});
export const noteTex = canvasTex(64, 64, (x) => {   // a music note, for dancing
  x.font = 'bold 44px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ff7fae'; x.fillText('♪', 32, 34);
});

// ---------------------------------------------------------------- fireflies: one Points cloud, moved on the CPU (cheap at ~50)
export function makeFireflies(n, glowTex) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ map: glowTex, color: 0xfff09a, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const points = new THREE.Points(g, mat); points.frustumCulled = false;
  return { points, mat, n };
}

// ---------------------------------------------------------------- butterflies: left + right wings as two instanced meshes
export function makeButterflies(n) {
  const wing = new THREE.CircleGeometry(0.24, 12); wing.scale(1.2, 1, 1); wing.translate(0.28, 0.06, 0);
  const lower = new THREE.CircleGeometry(0.15, 10); lower.translate(0.19, -0.17, 0);
  const shape = mergeGeometries([wing, lower]); shape.rotateX(-Math.PI / 2);   // lying flat, hinge along the body (z axis)
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });   // unlit pastel, so they read from any angle
  const left = new THREE.InstancedMesh(shape, mat, n), right = new THREE.InstancedMesh(shape, mat, n);
  const cols = [0xffc3e1, 0xfff1a6, 0xc9b6ff, 0xa8e6ff, 0xffd0a8];
  for (let i = 0; i < n; i++) { const c = new THREE.Color(cols[i % cols.length]); left.setColorAt(i, c); right.setColorAt(i, c); }
  left.frustumCulled = right.frustumCulled = false;
  return { left, right, n };
}

// ---------------------------------------------------------------- rain: short falling streaks around her
export function makeRain(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xd6e8ff, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat); lines.frustumCulled = false;
  return { lines, mat, n, drops: Array.from({ length: n }, () => ({ x: 0, y: -1, z: 0 })) };
}

// ---------------------------------------------------------------- a soft rainbow (billboard in the sky after rain)
export function makeRainbow() {
  const tex = canvasTex(512, 256, (x, w, h) => {
    const cols = ['#ff7b7b', '#ffb36b', '#ffe57a', '#8fe08a', '#7cc4ff', '#9b8cff', '#d39bff'];
    x.lineCap = 'round'; x.filter = 'blur(3px)';
    cols.forEach((c, k) => { x.strokeStyle = c; x.globalAlpha = 0.75; x.lineWidth = 12; x.beginPath(); x.arc(w / 2, h, h * 0.92 - k * 11, Math.PI, 0); x.stroke(); });
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  mesh.visible = false; mesh.renderOrder = -0.5;
  return mesh;
}

// ---------------------------------------------------------------- message in a bottle (one mesh, vertex-coloured)
export function makeBottle() {
  const tint = (geo, hex) => {
    const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (geo.index) geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
    return geo;
  };
  const prof = [[0, 0], [0.2, 0], [0.24, 0.05], [0.25, 0.42], [0.2, 0.55], [0.09, 0.65], [0.08, 0.82], [0, 0.82]].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = tint(new THREE.LatheGeometry(prof, 16), 0xa9e3dc);
  const cork = tint(new THREE.CylinderGeometry(0.075, 0.07, 0.14, 10).translate(0, 0.86, 0), 0xb98a5a);
  const paper = tint(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 10).translate(0, 0.25, 0), 0xfff2d0);
  const ribbon = tint(new THREE.TorusGeometry(0.115, 0.018, 6, 14).rotateX(Math.PI / 2).translate(0, 0.26, 0), 0xff7fae);
  const geo = mergeGeometries([glass, cork, paper, ribbon]);
  geo.rotateZ(Math.PI / 2 - 0.25); geo.translate(0.35, 0.1, 0);   // lying on its side, a little tilted, as if washed ashore
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.05 }));
  mesh.castShadow = true;
  return mesh;
}
