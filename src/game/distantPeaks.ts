import * as THREE from "three";
import { hash } from "./noise";
import { terrainHeight } from "./terrain";
import { TWO_PI } from "./constants";
import { getActiveMap } from "./maps";

const PEAK_COUNT = 72;

export interface DistantPeaksSystem {
  update: (px: number, pz: number) => void;
  dispose: () => void;
}

/** Soft mountain silhouettes on the horizon (terrain-backed, not floating cones). */
export const createDistantPeaks = (scene: THREE.Scene): DistantPeaksSystem => {
  const geo = new THREE.ConeGeometry(1, 1, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a7580,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, PEAK_COUNT);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  let last = { x: 99999, z: 99999 };

  const update = (px: number, pz: number) => {
    if (!getActiveMap().showPeaks) {
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      for (let i = 0; i < PEAK_COUNT; i++) mesh.setMatrixAt(i, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }
    if (Math.hypot(px - last.x, pz - last.z) < 80) return;
    last = { x: px, z: pz };

    const spacing = 140;
    let i = 0;
    for (let gx = -4; gx <= 4 && i < PEAK_COUNT; gx++) {
      for (let gz = -2; gz <= 6 && i < PEAK_COUNT; gz++) {
        const wx =
          (Math.round(px / spacing) + gx) * spacing +
          (hash(gx * 9 + gz * 17) * 50 - 25);
        const wz =
          (Math.round(pz / spacing) + gz) * spacing +
          (hash(gx * 5 + gz * 23) * 50 - 25);
        const th = terrainHeight(wx, wz);
        if (th < 8) continue;

        const scale = 18 + th * 0.55 + hash(wx * 0.02 + wz) * 20;
        dummy.position.set(wx, th * 0.35, wz);
        dummy.scale.set(scale * 1.1, scale, scale * 1.1);
        dummy.rotation.y = hash(wx + wz) * TWO_PI;
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }

    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (; i < PEAK_COUNT; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.count = PEAK_COUNT;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  const dispose = () => {
    geo.dispose();
    mat.dispose();
    mesh.dispose();
    scene.remove(mesh);
  };

  return { update, dispose };
};
