// Performance helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Merge every static mesh inside `container` into one mesh per material, so a model made of
// dozens of little parts costs a handful of draw calls. Subtrees listed in `skip` (things that
// animate or toggle on their own) are left untouched.
export function bake(container, skip = []) {
  const skipSet = new Set(skip);
  container.updateMatrixWorld(true);
  const inv = container.matrixWorld.clone().invert();
  const buckets = new Map();
  const remove = [];
  const walk = node => {
    for (const child of node.children) {
      if (skipSet.has(child)) continue;
      if (child.isMesh && !child.isInstancedMesh && !child.isSkinnedMesh) {
        let b = buckets.get(child.material);
        if (!b) buckets.set(child.material, b = { geos: [], cast: child.castShadow, receive: child.receiveShadow, data: { ...child.userData } });
        const g = child.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld));
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
        b.geos.push(g);
        remove.push(child);
      }
      walk(child);
    }
  };
  walk(container);
  if (remove.length < 2) return container;
  // keep anything skipped that lives under a mesh we're about to remove
  for (const m of remove) for (const c of [...m.children]) if (skipSet.has(c)) container.attach(c);
  for (const m of remove) m.parent?.remove(m);
  for (const [mat, b] of buckets) {
    // only keep attributes every part has (e.g. drop vertex colours if some parts don't carry them)
    const common = Object.keys(b.geos[0].attributes).filter(k => b.geos.every(g => g.attributes[k]));
    for (const g of b.geos) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
    const indexed = b.geos.every(g => g.index), geos = indexed ? b.geos : b.geos.map(g => (g.index ? g.toNonIndexed() : g));
    const merged = new THREE.Mesh(mergeGeometries(geos), mat);
    merged.castShadow = b.cast; merged.receiveShadow = b.receive; Object.assign(merged.userData, b.data);
    container.add(merged);
  }
  return container;
}
