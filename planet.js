// The planet: terrain, rivers, lake, paths, forests, bridges, meadows, clouds.
// Everything is generated from a seed so it looks the same on every visit.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const R = 20;            // planet radius
export const WATER = -0.15;     // water surface height (relative to R)
const AY = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randDir(rng) {
  const u = rng() * 2 - 1, th = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
}
const randTangent = (p, rng) => { const r = randDir(rng); return r.addScaledVector(p, -r.dot(p)).normalize(); };

// A wandering line over the sphere surface (used for rivers and paths)
class Line {
  constructor(rng, start, heading, steps, step, wiggle) {
    this.pts = [];
    const p = start.clone(), t = heading.clone();
    let curve = 0;
    for (let i = 0; i < steps; i++) {
      this.pts.push(p.clone());
      curve = (curve + (rng() - 0.5) * wiggle) * 0.92;
      t.applyAxisAngle(p, curve);
      p.addScaledVector(t, step).normalize();
      t.addScaledVector(p, -t.dot(p)).normalize();
    }
    this.a = new Float32Array(this.pts.flatMap(v => [v.x, v.y, v.z]));
  }
  dist(x, y, z) { // angular distance (radians) to the nearest point
    const a = this.a; let best = -2;
    for (let i = 0; i < a.length; i += 3) { const c = a[i] * x + a[i + 1] * y + a[i + 2] * z; if (c > best) best = c; }
    return Math.acos(Math.min(1, best));
  }
}

// ---------------------------------------------------------------- soft "moss" texturing
// A fuzzy grass-blade detail texture plus tiny wildflower specks, projected with
// triplanar mapping so it works on the sphere and on instanced trees without UVs.
function canvasTexture(size, draw, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const wrapDraw = (size, x, y, fn) => { for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(x + dx, y + dy); };
const detailTex = canvasTexture(512, (x, n) => {
  const r = mulberry32(5);
  x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, n, n);
  // soft clumps of light and shade
  for (let i = 0; i < 260; i++) {
    const px = r() * n, py = r() * n, rad = 18 + r() * 50, l = r() < 0.5 ? 70 : 200;
    wrapDraw(n, px, py, (X, Y) => {
      const g = x.createRadialGradient(X, Y, 0, X, Y, rad);
      g.addColorStop(0, `rgba(${l},${l},${l},0.35)`); g.addColorStop(1, `rgba(${l},${l},${l},0)`);
      x.fillStyle = g; x.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
    });
  }
  x.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const px = r() * n, py = r() * n, a = r() * Math.PI * 2, len = 6 + r() * 14, l = Math.floor(60 + r() * 140);
    x.strokeStyle = `rgba(${l},${l},${l},0.55)`; x.lineWidth = 2 + r() * 2.5;
    wrapDraw(n, px, py, (X, Y) => { x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len); x.stroke(); });
  }
});
const flowerTex = canvasTexture(512, (x, n) => {
  const r = mulberry32(9), cols = ['255,214,234', '255,255,255', '255,240,160', '255,158,200', '220,200,255'];
  for (let i = 0; i < 700; i++) {
    const px = r() * n, py = r() * n, rad = 4 + r() * 6, col = cols[Math.floor(r() * cols.length)];
    wrapDraw(n, px, py, (X, Y) => {
      const g = x.createRadialGradient(X, Y, 0, X, Y, rad);
      g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(0.6, `rgba(${col},0.85)`); g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(X, Y, rad, 0, Math.PI * 2); x.fill();
    });
  }
}, true);

export function softify(mat, { scale = 0.35, strength = 0.7, flowers = 0 } = {}) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, {
      uDetail: { value: detailTex }, uFlowers: { value: flowerTex },
      uScale: { value: scale }, uStrength: { value: strength }, uFlowerAmt: { value: flowers },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTPos;\nvarying vec3 vTNorm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 tpW = vec4(transformed, 1.0); vec3 tnW = objectNormal;
        #ifdef USE_INSTANCING
          tpW = instanceMatrix * tpW; tnW = mat3(instanceMatrix) * tnW;
        #endif
        vTPos = (modelMatrix * tpW).xyz; vTNorm = normalize(mat3(modelMatrix) * tnW);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTPos; varying vec3 vTNorm;
        uniform sampler2D uDetail; uniform sampler2D uFlowers;
        uniform float uScale; uniform float uStrength; uniform float uFlowerAmt;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 bw = pow(abs(normalize(vTNorm)), vec3(4.0)); bw /= dot(bw, vec3(1.0));
          vec3 p = vTPos * uScale;
          float d = texture2D(uDetail, p.yz).r * bw.x + texture2D(uDetail, p.xz).r * bw.y + texture2D(uDetail, p.xy).r * bw.z;
          diffuseColor.rgb *= mix(1.0, d * 2.0, uStrength);
          if (uFlowerAmt > 0.0) {
            vec3 q = p * 1.1;
            vec4 f = texture2D(uFlowers, q.yz) * bw.x + texture2D(uFlowers, q.xz) * bw.y + texture2D(uFlowers, q.xy) * bw.z;
            float grass = smoothstep(0.03, 0.12, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
            diffuseColor.rgb = mix(diffuseColor.rgb, f.rgb, clamp(f.a, 0.0, 1.0) * uFlowerAmt * grass);
          }
        }`);
  };
  mat.customProgramCacheKey = () => `soft-${scale}-${strength}-${flowers}`;
  return mat;
}

// soft blurry cloud sprite texture
const cloudTex = canvasTexture(256, (x, n) => {
  const r = mulberry32(3);
  for (let i = 0; i < 26; i++) {
    const px = n * (0.2 + r() * 0.6), py = n * (0.45 + (r() - 0.5) * 0.25), rad = n * (0.1 + r() * 0.14);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
  }
}, true);
cloudTex.wrapS = cloudTex.wrapT = THREE.ClampToEdgeWrapping;

export function buildPlanet(seed = 1) {
  const rng = mulberry32(seed * 7919 + 13);
  const group = new THREE.Group();

  // ---------------------------------------------------------------- features
  const RW = 0.045, PW = 0.032, LAKE = 0.27, BEACH = 0.38;
  let lakeC;
  do { lakeC = randDir(rng); } while (lakeC.angleTo(AY) < 0.75 || lakeC.angleTo(AY) > 1.0 || lakeC.z < 0.3);
  const river1 = new Line(rng, lakeC, randTangent(lakeC, rng), 190, 0.018, 0.22);
  const river2 = new Line(rng, river1.pts[80], randTangent(river1.pts[80], rng), 100, 0.018, 0.22);
  const rivers = [river1, river2];
  const paths = [0, 1, 2].map(k => {
    const h = new THREE.Vector3(Math.cos(k * 2.1 + rng()), 0, Math.sin(k * 2.1 + rng()));
    return new Line(rng, AY, h, 130, 0.02, 0.14);
  });

  const hills = (x, y, z) => 0.22 + 0.13 * Math.sin(3 * x + 1) * Math.sin(2.6 * y + 2) * Math.sin(3.3 * z)
    + 0.07 * Math.sin(7 * x + 5 * z) * Math.cos(6 * y);

  function sample(x, y, z) {
    const rd = Math.min(river1.dist(x, y, z), river2.dist(x, y, z));
    const ld = Math.acos(clamp(x * lakeC.x + y * lakeC.y + z * lakeC.z, -1, 1));
    const pd = Math.min(...paths.map(p => p.dist(x, y, z)));
    const pathF = smooth(PW, PW * 0.45, pd);
    const beachF = smooth(BEACH, LAKE, ld);
    const riverF = smooth(RW, RW * 0.5, rd);
    const lakeF = smooth(LAKE, LAKE * 0.55, ld);
    let h = hills(x, y, z);
    h = lerp(h, 0.08, pathF * 0.7);
    h = lerp(h, 0.03, beachF);
    h = lerp(h, -0.55, riverF);
    h = lerp(h, -1.0, lakeF);
    return { h, rd, ld, pd, pathF, beachF, riverF, lakeF };
  }
  const tmp = new THREE.Vector3();
  const heightAt = d => sample(d.x, d.y, d.z).h;

  // ---------------------------------------------------------------- terrain mesh
  let geo = new THREE.IcosahedronGeometry(R, 64);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const C = hex => new THREE.Color(hex);
  const grassA = C(0x6cbd3c), grassB = C(0x96d457), grassC = C(0x5aa836), sand = C(0xf4e4a8), path = C(0xf0d996);
  const riverBed = C(0x3fb1ea), deep = C(0x1d6fd0), foam = C(0xe9fbff);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).normalize();
    const s = sample(tmp.x, tmp.y, tmp.z);
    const n = Math.sin(tmp.x * 9 + tmp.y * 4) * Math.cos(tmp.z * 8 - tmp.x * 3) + 0.5 * Math.sin(tmp.y * 17 + tmp.z * 11);
    c.copy(grassA).lerp(grassB, clamp(n * 0.5 + 0.5, 0, 1));
    if (n < -0.9) c.lerp(grassC, 0.5);
    c.lerp(path, s.pathF);
    c.lerp(sand, s.beachF);
    if (s.h < WATER + 0.12 && s.h > WATER - 0.2) c.lerp(foam, 0.55);   // light shallows
    c.lerp(riverBed, smooth(WATER - 0.1, -0.5, s.h) * Math.max(s.riverF, s.lakeF));
    c.lerp(deep, smooth(0.5, 1, s.lakeF) * smooth(-0.5, -0.95, s.h));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    tmp.multiplyScalar(R + s.h);
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, softify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { scale: 0.15, strength: 0.9, flowers: 1.0 }));
  ground.receiveShadow = true;
  group.add(ground);

  const water = new THREE.Mesh(new THREE.SphereGeometry(R + WATER, 160, 120),
    new THREE.MeshStandardMaterial({ color: 0x6cc4f2, transparent: true, opacity: 0.85, roughness: 0.18, metalness: 0.0, emissive: 0x2a78b8, emissiveIntensity: 0.35 }));
  water.receiveShadow = true;
  group.add(water);

  // ---------------------------------------------------------------- helpers
  const isWet = s => s.rd < RW + 0.02 || s.ld < BEACH;
  function placeOnSurface(obj, dir, lift = 0, spin = 0) {
    obj.position.copy(dir).multiplyScalar(R + heightAt(dir) + lift);
    obj.quaternion.setFromUnitVectors(AY, dir);
    obj.rotateY(spin);
  }
  const shadowAll = o => o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  // ---------------------------------------------------------------- glowing flower spots
  const flowerDirs = [];
  while (flowerDirs.length < 24) {
    const d = randDir(rng);
    if (d.angleTo(AY) < 0.35) continue;
    const s = sample(d.x, d.y, d.z);
    if (isWet(s) || s.pd < PW) continue;
    if (flowerDirs.some(o => o.angleTo(d) < 0.3)) continue;
    flowerDirs.push(d);
  }

  // ---------------------------------------------------------------- bridges
  const bridges = [];
  const wood = new THREE.MeshStandardMaterial({ color: 0xb07a4f, roughness: 0.85 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.85 });
  for (const p of paths) {
    let run = [];
    const flush = () => {
      if (run.length) {
        const i = run[Math.floor(run.length / 2)];
        const d = p.pts[i], fwd = p.pts[Math.min(i + 1, p.pts.length - 1)].clone().sub(p.pts[Math.max(i - 1, 0)]).normalize();
        if (!bridges.some(b => b.dir.angleTo(d) < 0.15)) bridges.push({ dir: d.clone(), fwd });
      }
      run = [];
    };
    p.pts.forEach((d, i) => { if (Math.min(river1.dist(d.x, d.y, d.z), river2.dist(d.x, d.y, d.z)) < RW) run.push(i); else flush(); });
    flush();
  }
  const BL = RW * R * 2 + 1.6; // bridge length
  for (const b of bridges) {
    const br = new THREE.Group();
    const up = b.dir, fwd = b.fwd.addScaledVector(up, -b.fwd.dot(up)).normalize(), right = new THREE.Vector3().crossVectors(up, fwd);
    br.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    br.position.copy(up).multiplyScalar(R + 0.1);
    const segs = 9;
    for (let k = 0; k < segs; k++) {
      const z = ((k + 0.5) / segs - 0.5) * BL, y = 0.35 * Math.cos((z / BL) * Math.PI);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, BL / segs - 0.04), k % 2 ? wood : woodDark);
      plank.position.set(0, y, z); plank.rotation.x = Math.sin((z / BL) * Math.PI) * 0.35;
      br.add(plank);
      if (k % 2 === 0) for (const sx of [-0.75, 0.75]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), woodDark);
        post.position.set(sx, y + 0.3, z); br.add(post);
      }
    }
    for (const sx of [-0.75, 0.75]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, BL * 0.95), wood);
      rail.position.set(sx, 0.75, 0); br.add(rail);
    }
    shadowAll(br); group.add(br);
    b.half = BL / 2;
  }

  // ground height the player stands on (wades in water, walks over bridges)
  function standHeight(d) {
    const s = sample(d.x, d.y, d.z);
    let h = Math.max(s.h, -0.6);
    for (const b of bridges) if (b.dir.angleTo(d) * R < b.half) h = Math.max(h, 0.1 + 0.42 * Math.cos((b.dir.angleTo(d) * R / (b.half * 2)) * Math.PI));
    return { h, wet: s.h < WATER && h < 0 };
  }

  // ---------------------------------------------------------------- trees (instanced)
  const obstacles = [];
  const forests = Array.from({ length: 7 }, () => ({ c: randDir(rng), r: 0.35 + rng() * 0.25 }));
  const trees = [];
  for (let k = 0; k < 4000 && trees.length < 380; k++) {
    const d = randDir(rng);
    const inForest = forests.some(f => f.c.angleTo(d) < f.r);
    if (rng() > (inForest ? 0.95 : 0.1)) continue;
    if (d.angleTo(AY) < 0.16) continue;
    const s = sample(d.x, d.y, d.z);
    if (isWet(s) || s.pd < PW * 1.6) continue;
    if (flowerDirs.some(f => f.angleTo(d) < 0.11)) continue;
    if (bridges.some(b => b.dir.angleTo(d) < 0.12)) continue;
    const sc = 0.75 + rng() * 0.55;
    if (trees.some(t => t.d.angleTo(d) * R < (t.s + sc) * 0.75)) continue;
    trees.push({ d, s: sc, kind: inForest && rng() < 0.18 ? 'cedar' : 'round', spin: rng() * 6, fruit: rng() < 0.55 ? Math.floor(rng() * 3) : -1, tint: rng() });
  }
  const dummy = new THREE.Object3D(), m4 = new THREE.Matrix4();
  const sphere = (r, x, y, z) => new THREE.SphereGeometry(r, 16, 12).translate(x, y, z);
  const canopyG = mergeGeometries([sphere(1.0, 0, 2.05, 0), sphere(0.72, 0.6, 1.75, 0.2), sphere(0.7, -0.55, 1.8, -0.25), sphere(0.62, 0.05, 2.65, -0.1), sphere(0.6, -0.1, 1.75, 0.6)]);
  const trunkG = new THREE.CylinderGeometry(0.17, 0.26, 1.3, 8).translate(0, 0.65, 0);
  const cedarG = mergeGeometries([0, 1, 2].map(k => new THREE.ConeGeometry(1.1 - k * 0.28, 1.3, 10).translate(0, 1.3 + k * 0.75, 0)));
  const fruitOffsets = [[0.75, 2.05, 0.6], [-0.6, 2.2, 0.7], [0.2, 1.6, 0.95], [-0.85, 1.75, -0.4], [0.5, 2.6, -0.55]];
  const rounds = trees.filter(t => t.kind === 'round'), cedars = trees.filter(t => t.kind === 'cedar');
  const fruitCount = rounds.filter(t => t.fruit >= 0).length * fruitOffsets.length;

  const trunkI = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.9 }), trees.length);
  const canopyI = new THREE.InstancedMesh(canopyG, softify(new THREE.MeshStandardMaterial({ roughness: 1 }), { scale: 0.45, strength: 0.9, flowers: 0.3 }), Math.max(1, rounds.length));
  const cedarI = new THREE.InstancedMesh(cedarG, softify(new THREE.MeshStandardMaterial({ roughness: 1 }), { scale: 0.45, strength: 0.9 }), Math.max(1, cedars.length));
  const fruitI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.4 }), Math.max(1, fruitCount));
  const leafCols = [0x62b743, 0x77c853, 0x58a83c, 0x86d160].map(C), cedarCols = [0x4f9a5c, 0x5aa866].map(C), fruitCols = [0xff4a3d, 0xffb020, 0xff7aa8].map(C);
  let ri = 0, ci = 0, fi = 0;
  trees.forEach((t, i) => {
    placeOnSurface(dummy, t.d, -0.05, t.spin); dummy.scale.setScalar(t.s); dummy.updateMatrix();
    trunkI.setMatrixAt(i, dummy.matrix);
    if (t.kind === 'round') {
      canopyI.setMatrixAt(ri, dummy.matrix); canopyI.setColorAt(ri++, leafCols[Math.floor(t.tint * leafCols.length)]);
      if (t.fruit >= 0) for (const o of fruitOffsets) {
        fruitI.setMatrixAt(fi, m4.makeTranslation(o[0], o[1], o[2]).premultiply(dummy.matrix));
        fruitI.setColorAt(fi++, fruitCols[t.fruit]);
      }
    } else {
      cedarI.setMatrixAt(ci, dummy.matrix); cedarI.setColorAt(ci++, cedarCols[Math.floor(t.tint * cedarCols.length)]);
    }
    obstacles.push({ dir: t.d, rad: 0.45 * t.s });
  });
  canopyI.count = ri; cedarI.count = ci; fruitI.count = fi;
  for (const m of [trunkI, canopyI, cedarI, fruitI]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }

  // palms around the lagoon beach
  const palmTrunkM = new THREE.MeshStandardMaterial({ color: 0xc89a64, roughness: 0.9 }), palmLeafM = softify(new THREE.MeshStandardMaterial({ color: 0x74c35e, roughness: 1 }), { scale: 0.9, strength: 0.6 });
  for (let k = 0; k < 7; k++) {
    const t = randTangent(lakeC, rng), d = lakeC.clone().applyAxisAngle(t.cross(lakeC).normalize(), (LAKE + BEACH) / 2 + 0.02);
    const palm = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.62, 7), palmTrunkM);
      seg.position.set(j * j * 0.025, 0.3 + j * 0.58, 0); seg.rotation.z = -j * 0.05; palm.add(seg);
    }
    for (let j = 0; j < 7; j++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), palmLeafM);
      leaf.scale.set(0.35, 0.08, 1.6); const a = (j / 7) * Math.PI * 2;
      leaf.position.set(0.4 + Math.sin(a) * 0.7, 3.0, Math.cos(a) * 0.7); leaf.rotation.y = a; leaf.rotation.x = 0.35;
      palm.add(leaf);
    }
    palm.scale.setScalar(0.9 + rng() * 0.3);
    shadowAll(palm); placeOnSurface(palm, d, 0, rng() * 6); group.add(palm);
    obstacles.push({ dir: d, rad: 0.35 });
  }

  // ---------------------------------------------------------------- meadow flowers + grass tufts
  const petalG = mergeGeometries(Array.from({ length: 5 }, (_, k) => {
    const a = (k / 5) * Math.PI * 2; return new THREE.SphereGeometry(0.075, 6, 4).scale(1, 0.5, 1).translate(Math.sin(a) * 0.08, 0.12, Math.cos(a) * 0.08);
  }));
  const meadow = [];
  for (let k = 0; k < 70; k++) {
    const c0 = randDir(rng); const s0 = sample(c0.x, c0.y, c0.z);
    if (isWet(s0) || forests.some(f => f.c.angleTo(c0) < f.r * 0.8)) continue;
    const col = [0xff7eb6, 0xffffff, 0xc58cff, 0xff5a5a, 0xffe14d][Math.floor(rng() * 5)];
    for (let j = 0; j < 14; j++) {
      const d = c0.clone().addScaledVector(randTangent(c0, rng), rng() * 0.07).normalize();
      const s = sample(d.x, d.y, d.z); if (isWet(s) || s.pd < PW) continue;
      meadow.push({ d, col });
    }
  }
  const flowersI = new THREE.InstancedMesh(petalG, new THREE.MeshStandardMaterial({ roughness: 0.6 }), meadow.length);
  meadow.forEach((m, i) => { placeOnSurface(dummy, m.d, 0, rng() * 6); dummy.scale.setScalar(1); dummy.updateMatrix(); flowersI.setMatrixAt(i, dummy.matrix); flowersI.setColorAt(i, C(m.col)); });
  group.add(flowersI);

  const tuftG = mergeGeometries([-0.12, 0, 0.12].map((x, k) => new THREE.ConeGeometry(0.06, 0.35 - k * 0.05, 4).translate(x, 0.16, (k - 1) * 0.04)));
  const tufts = [];
  for (let k = 0; k < 8000 && tufts.length < 2600; k++) {
    const d = randDir(rng), s = sample(d.x, d.y, d.z);
    if (!isWet(s) && s.pd > PW) tufts.push(d);
  }
  const tuftI = new THREE.InstancedMesh(tuftG, new THREE.MeshStandardMaterial({ roughness: 1 }), tufts.length);
  const tuftCols = [0x64b23f, 0x7cc552, 0x579f37, 0x8fd05e].map(C);
  tufts.forEach((d, i) => {
    placeOnSurface(dummy, d, -0.02, rng() * 6); dummy.scale.setScalar(0.8 + rng() * 0.7); dummy.updateMatrix();
    tuftI.setMatrixAt(i, dummy.matrix); tuftI.setColorAt(i, tuftCols[Math.floor(rng() * tuftCols.length)]);
  });
  tuftI.receiveShadow = true;
  group.add(tuftI);

  // scattered wildflower dots (like the meadow in a field of pink/white/yellow)
  const dots = [];
  for (let k = 0; k < 9000 && dots.length < 3200; k++) {
    const d = randDir(rng), s = sample(d.x, d.y, d.z);
    if (!isWet(s) && s.pd > PW) dots.push(d);
  }
  const dotCols = [0xffc4de, 0xffffff, 0xfff0a0, 0xff9cc6, 0xe0ccff].map(C);
  const dotI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.7, 1).translate(0, 0.14, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), dots.length);
  dots.forEach((d, i) => {
    placeOnSurface(dummy, d, 0, 0); dummy.scale.setScalar(0.7 + rng() * 0.8); dummy.updateMatrix();
    dotI.setMatrixAt(i, dummy.matrix); dotI.setColorAt(i, dotCols[Math.floor(rng() * dotCols.length)]);
  });
  group.add(dotI);

  // a few river stones
  const stoneM = new THREE.MeshStandardMaterial({ color: 0xc9c4cf, roughness: 0.9 });
  for (let k = 0; k < 14; k++) {
    const rv = rivers[k % 2], d = rv.pts[Math.floor(rng() * rv.pts.length)].clone();
    d.addScaledVector(randTangent(d, rng), RW + 0.03).normalize();
    const s = sample(d.x, d.y, d.z); if (s.ld < BEACH) continue;
    const st = new THREE.Mesh(new THREE.SphereGeometry(0.35 + rng() * 0.3, 10, 8), stoneM); st.scale.y = 0.6;
    shadowAll(st); placeOnSurface(st, d, 0.05); group.add(st);
    obstacles.push({ dir: d, rad: 0.4 });
  }

  // ---------------------------------------------------------------- clouds
  const cloudPivot = new THREE.Group(); group.add(cloudPivot);
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    const w = 7 + rng() * 6; sp.scale.set(w, w * 0.55, 1);
    sp.position.copy(randDir(rng)).multiplyScalar(R + 8 + rng() * 5);
    cloudPivot.add(sp);
  }

  return { group, flowerDirs, obstacles, cloudPivot, placeOnSurface, standHeight, shadowAll };
}
