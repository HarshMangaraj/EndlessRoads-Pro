import * as THREE from "three";
import { hash } from "./noise";
import { terrainHeight } from "./terrain";
import type { PreparedModel } from "./assets";
import { getActiveMap } from "./maps";

export const BUILDING_COUNT = 260;
export const STREETLIGHT_COUNT = 220;

export interface CitySystem {
  group: THREE.Group;
  buildingMesh: THREE.InstancedMesh;
  windowMesh: THREE.InstancedMesh;
  streetlights: THREE.InstancedMesh;
  update: (
    px: number,
    pz: number,
    samplePath: (s: number) => { x: number; z: number; h: number },
    carS: number,
    nightFactor: number,
  ) => void;
  upgradeLamppost: (model: PreparedModel) => void;
  dispose: () => void;
}

export const createCity = (
  scene: THREE.Scene,
  lamppost: PreparedModel,
): CitySystem => {
  const group = new THREE.Group();
  scene.add(group);

  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    roughness: 0.78,
    metalness: 0.18,
  });
  const buildingMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, BUILDING_COUNT);
  buildingMesh.castShadow = true;
  buildingMesh.receiveShadow = true;
  buildingMesh.frustumCulled = false;
  group.add(buildingMesh);

  const windowGeo = new THREE.BoxGeometry(1, 1, 1);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c22,
    emissive: new THREE.Color(0xffd47a),
    emissiveIntensity: 0.0,
    roughness: 0.3,
    metalness: 0.4,
  });
  const windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, BUILDING_COUNT);
  windowMesh.frustumCulled = false;
  group.add(windowMesh);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xe8e4dc,
    roughness: 0.45,
    metalness: 0.55,
    emissive: new THREE.Color(0xffd070),
    emissiveIntensity: 0.0,
  });
  const streetlights = new THREE.InstancedMesh(lamppost.geometry, lampMat, STREETLIGHT_COUNT);
  streetlights.castShadow = true;
  streetlights.frustumCulled = false;
  group.add(streetlights);

  const dummy = new THREE.Object3D();
  const hidden = new THREE.Object3D();
  hidden.scale.set(0, 0, 0);
  hidden.updateMatrix();

  let lastUpdate = { x: 99999, z: 99999 };

  const update: CitySystem["update"] = (px, pz, samplePath, carS, nightFactor) => {
    windowMat.emissiveIntensity = 0.05 + nightFactor * 2.4;
    lampMat.emissiveIntensity = 0.08 + nightFactor * 2.6;

    if (Math.hypot(px - lastUpdate.x, pz - lastUpdate.z) < 25) return;
    lastUpdate = { x: px, z: pz };

    let li = 0;
    const startS = Math.max(0, carS - 60);
    for (let s = startS; s < carS + 380 && li < STREETLIGHT_COUNT; s += 22) {
      const p = samplePath(s);
      const nx = Math.cos(p.h);
      const nz = -Math.sin(p.h);
      const offset = 7.2;

      for (const side of [1, -1]) {
        if (li >= STREETLIGHT_COUNT) break;
        const wx = p.x + nx * offset * side;
        const wz = p.z + nz * offset * side;
        const gy = Math.max(0, terrainHeight(wx, wz));
        dummy.position.set(wx, gy, wz);
        dummy.rotation.set(0, p.h + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        streetlights.setMatrixAt(li++, dummy.matrix);
      }
    }

    for (let i = li; i < STREETLIGHT_COUNT; i++) {
      streetlights.setMatrixAt(i, hidden.matrix);
    }
    streetlights.count = li;
    streetlights.instanceMatrix.needsUpdate = true;
    streetlights.computeBoundingSphere();

    let bi = 0;
    const map = getActiveMap();
    const zoneSpacing = map.cityZoneSpacing;
    const zoneLen = 200;
    const startZone = Math.floor((carS - 120) / zoneSpacing);
    const endZone = Math.floor((carS + 600) / zoneSpacing);

    for (let z = startZone; z <= endZone && bi < BUILDING_COUNT; z++) {
      if (z < 0) continue;
      const zoneCenterS = z * zoneSpacing + zoneSpacing * 0.5;
      const cityRand = hash(z * 31.7);
      if (cityRand < map.citySkipChance) continue;
      const isMetro = cityRand > 0.65;

      const buildingsPerSide = isMetro ? 11 : 6;
      for (let side = -1; side <= 1; side += 2) {
        for (let n = 0; n < buildingsPerSide && bi < BUILDING_COUNT; n++) {
          const sOff = (n / buildingsPerSide - 0.5) * zoneLen + (hash(z * 7 + n * 3 + side) - 0.5) * 14;
          const s = zoneCenterS + sOff;
          const p = samplePath(s);
          const nx = Math.cos(p.h);
          const nz = -Math.sin(p.h);
          const lateral = 13 + hash(z * 11 + n * 5 + side) * 9;
          const wx = p.x + nx * lateral * side;
          const wz = p.z + nz * lateral * side;
          const gy = Math.max(0, terrainHeight(wx, wz));

          const h = isMetro
            ? 16 + hash(wx * 0.01 + wz * 0.011) * 60
            : 6 + hash(wx * 0.02 + wz * 0.03) * 14;
          const w = 6 + hash(wx * 0.03 + wz * 0.02) * 7;
          const d = 6 + hash(wx * 0.04 + wz * 0.05) * 7;

          dummy.position.set(wx, gy + h * 0.5, wz);
          dummy.rotation.set(0, p.h + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
          dummy.scale.set(w, h, d);
          dummy.updateMatrix();
          buildingMesh.setMatrixAt(bi, dummy.matrix);
          const tint = new THREE.Color().setHSL(
            0.06 + hash(wx * 0.7 + wz) * 0.12,
            0.06 + hash(wx + wz * 1.3) * 0.18,
            0.32 + hash(wx * 1.1 + wz * 0.9) * 0.4,
          );
          buildingMesh.setColorAt(bi, tint);

          dummy.position.set(
            wx - nx * (d * 0.5 + 0.05) * side,
            gy + h * 0.5,
            wz - nz * (d * 0.5 + 0.05) * side,
          );
          dummy.scale.set(w * 0.78, h * 0.84, 0.1);
          dummy.updateMatrix();
          windowMesh.setMatrixAt(bi, dummy.matrix);
          bi++;
        }
      }
    }

    for (let i = bi; i < BUILDING_COUNT; i++) {
      buildingMesh.setMatrixAt(i, hidden.matrix);
      windowMesh.setMatrixAt(i, hidden.matrix);
    }
    buildingMesh.count = bi;
    windowMesh.count = bi;
    buildingMesh.instanceMatrix.needsUpdate = true;
    if (buildingMesh.instanceColor) buildingMesh.instanceColor.needsUpdate = true;
    windowMesh.instanceMatrix.needsUpdate = true;
    buildingMesh.computeBoundingSphere();
    windowMesh.computeBoundingSphere();
  };

  const upgradeLamppost = (model: PreparedModel) => {
    streetlights.geometry.dispose();
    streetlights.geometry = model.geometry;
  };

  const dispose = () => {
    buildingGeo.dispose();
    buildingMat.dispose();
    windowGeo.dispose();
    windowMat.dispose();
    lampMat.dispose();
    streetlights.geometry.dispose();
    streetlights.dispose();
    scene.remove(group);
  };

  return { group, buildingMesh, windowMesh, streetlights, update, upgradeLamppost, dispose };
};
