import * as THREE from "three";
import { hash } from "./noise";
import { terrainHeight } from "./terrain";
import type { PreparedModel } from "./assets";
import { getActiveMap } from "./maps";
import type { Obstacle } from "./collisions";
import { BUILDING_COLLISION_RADIUS } from "./collisions";
import {
  BLOCK,
  SIDEWALK_OFF,
  gridCoord,
  gridLineX,
  gridLineZ,
} from "./roadNetwork";

export const BUILDING_COUNT = 260;
export const STREETLIGHT_COUNT = 220;
export const WINDOW_PANE_COUNT = 2048;
const LAMP_LIGHT_POOL = 16;

type QualityTier = "low" | "medium" | "high" | "ultra";

interface LampRecord {
  x: number;
  y: number;
  z: number;
  heading: number;
}

const makeLightPoolTexture = (): THREE.CanvasTexture => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255, 228, 160, 0.95)");
  g.addColorStop(0.35, "rgba(255, 200, 110, 0.55)");
  g.addColorStop(0.7, "rgba(255, 170, 70, 0.12)");
  g.addColorStop(1, "rgba(255, 150, 50, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

export interface CitySystem {
  group: THREE.Group;
  buildingMesh: THREE.InstancedMesh;
  windowMesh: THREE.InstancedMesh;
  streetlights: THREE.InstancedMesh;
  update: (px: number, pz: number, nightFactor: number) => void;
  getObstacles: () => Obstacle[];
  getBuildingObstacles: () => Obstacle[];
  setQuality: (q: QualityTier) => void;
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
    color: 0x8a929c,
    roughness: 0.82,
    metalness: 0.22,
  });
  const podiumMat = new THREE.MeshStandardMaterial({
    color: 0x6a7078,
    roughness: 0.88,
    metalness: 0.12,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x4a5058,
    roughness: 0.75,
    metalness: 0.28,
  });

  const buildingMesh = new THREE.InstancedMesh(buildingGeo, buildingMat, BUILDING_COUNT);
  buildingMesh.castShadow = true;
  buildingMesh.receiveShadow = true;
  buildingMesh.frustumCulled = false;
  const podiumMesh = new THREE.InstancedMesh(buildingGeo, podiumMat, BUILDING_COUNT);
  podiumMesh.castShadow = true;
  podiumMesh.receiveShadow = true;
  podiumMesh.frustumCulled = false;
  const roofMesh = new THREE.InstancedMesh(buildingGeo, roofMat, BUILDING_COUNT);
  roofMesh.castShadow = true;
  roofMesh.frustumCulled = false;
  group.add(podiumMesh, buildingMesh, roofMesh);

  const windowGeo = new THREE.BoxGeometry(1, 1, 1);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  const windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, WINDOW_PANE_COUNT);
  windowMesh.frustumCulled = false;
  group.add(windowMesh);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xe8e4dc,
    roughness: 0.5,
    metalness: 0.42,
    emissive: new THREE.Color(0xffd070),
    emissiveIntensity: 0.0,
  });
  const streetlights = new THREE.InstancedMesh(lamppost.geometry, lampMat, STREETLIGHT_COUNT);
  streetlights.castShadow = true;
  streetlights.frustumCulled = false;
  group.add(streetlights);

  const poolTex = makeLightPoolTexture();
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const lightPools = new THREE.InstancedMesh(poolGeo, poolMat, LAMP_LIGHT_POOL);
  lightPools.frustumCulled = false;
  group.add(lightPools);

  // Point lights actually illuminate road/trees/buildings (not just emissive pole glow)
  const lampPoints: THREE.PointLight[] = [];
  for (let i = 0; i < LAMP_LIGHT_POOL; i++) {
    const pl = new THREE.PointLight(0xffe4b8, 0, 22, 1.5);
    pl.castShadow = false;
    scene.add(pl);
    lampPoints.push(pl);
  }

  const dummy = new THREE.Object3D();
  const hidden = new THREE.Object3D();
  hidden.scale.set(0, 0, 0);
  hidden.updateMatrix();

  const lampRecords: LampRecord[] = [];
  const buildingObstacles: Obstacle[] = [];
  let activeLampCount = 0;
  let lastUpdate = { x: 99999, z: 99999 };
  let nightFactorStored = 0;
  let qualityTier: QualityTier = "high";
  let lightPoolSize = LAMP_LIGHT_POOL;

  const setQuality = (q: QualityTier) => {
    qualityTier = q;
    lightPoolSize = q === "low" ? 6 : q === "medium" ? 10 : LAMP_LIGHT_POOL;
  };

  const syncLampLights = (px: number, pz: number) => {
    if (nightFactorStored < 0.04) {
      for (let i = 0; i < lampPoints.length; i++) {
        lampPoints[i].intensity = 0;
        dummy.position.set(px, -500, pz);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        lightPools.setMatrixAt(i, dummy.matrix);
      }
      lightPools.instanceMatrix.needsUpdate = true;
      return;
    }

    const sorted = lampRecords
      .slice(0, activeLampCount)
      .map((l, idx) => ({ ...l, idx, dist: (l.x - px) ** 2 + (l.z - pz) ** 2 }))
      .sort((a, b) => a.dist - b.dist);

    const poolCount = Math.min(lightPoolSize, sorted.length);
    const baseI = qualityTier === "ultra" ? 26 : qualityTier === "high" ? 22 : 16;
    const intensity = baseI * nightFactorStored;

    for (let i = 0; i < lampPoints.length; i++) {
      if (i >= poolCount) {
        lampPoints[i].intensity = 0;
        dummy.position.set(px, -500, pz);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        lightPools.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const lamp = sorted[i];
      const lx = lamp.x;
      const ly = lamp.y + 4.6;
      const lz = lamp.z;
      const fwdX = Math.sin(lamp.heading);
      const fwdZ = Math.cos(lamp.heading);
      const bulbX = lx + fwdX * 0.45;
      const bulbZ = lz + fwdZ * 0.45;

      lampPoints[i].position.set(bulbX, ly, bulbZ);
      lampPoints[i].intensity = intensity;
      lampPoints[i].distance = 26 + nightFactorStored * 8;

      const poolScale = 4 + nightFactorStored * 2.5;
      dummy.position.set(bulbX, lamp.y + 0.06, bulbZ);
      dummy.rotation.set(0, lamp.heading, 0);
      dummy.scale.set(poolScale, poolScale, 1);
      dummy.updateMatrix();
      lightPools.setMatrixAt(i, dummy.matrix);
    }

    for (let i = poolCount; i < lampPoints.length; i++) {
      lampPoints[i].intensity = 0;
      dummy.position.set(px, -500, pz);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      lightPools.setMatrixAt(i, dummy.matrix);
    }
    lightPools.count = poolCount;
    lightPools.instanceMatrix.needsUpdate = true;
    poolMat.opacity = 0.18 + nightFactorStored * 0.22;
  };

  const placeWindowGrid = (
    wx: number,
    wz: number,
    gy: number,
    h: number,
    w: number,
    nx: number,
    nz: number,
    side: number,
    d: number,
    nightFactor: number,
    wi: { value: number },
  ): void => {
    const rows = Math.max(2, Math.min(14, Math.floor(h / 3.2)));
    const cols = Math.max(2, Math.min(7, Math.floor(w / 2.1)));
    const paneW = (w * 0.72) / cols;
    const paneH = (h * 0.82) / rows;
    const facadeX = wx - nx * (d * 0.5 + 0.08) * side;
    const facadeZ = wz - nz * (d * 0.5 + 0.08) * side;
    const rightX = -nz * side;
    const rightZ = nx * side;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (wi.value >= WINDOW_PANE_COUNT) return;
        const litRand = hash(wx * 0.17 + wz * 0.23 + row * 7.1 + col * 11.3);
        const floorBias = 0.12 + (row / rows) * 0.35;
        const lit = litRand < 0.58 + floorBias * 0.28;
        const warmth = hash(wx + col * 3.7 + row * 5.1);
        const hue = warmth > 0.72 ? 0.58 : warmth > 0.4 ? 0.1 : 0.07;
        const u = (col + 0.5) / cols - 0.5;
        const v = (row + 0.5) / rows;
        const px = facadeX + rightX * u * w * 0.78;
        const pz = facadeZ + rightZ * u * w * 0.78;
        const py = gy + v * h * 0.88 + paneH * 0.1;

        dummy.position.set(px, py, pz);
        dummy.rotation.set(0, Math.atan2(-nx * side, -nz * side), 0);
        dummy.scale.set(paneW * 0.88, paneH * 0.9, 0.12);
        dummy.updateMatrix();
        windowMesh.setMatrixAt(wi.value, dummy.matrix);

        if (lit && nightFactor > 0.12) {
          const bright = 0.35 + hash(row * 13 + col * 19) * 0.45;
          const tint = new THREE.Color().setHSL(hue, 0.4 + warmth * 0.2, bright * nightFactor);
          windowMesh.setColorAt(wi.value, tint);
        } else {
          const glass = new THREE.Color().setHSL(0.62, 0.25, 0.06 + nightFactor * 0.04);
          windowMesh.setColorAt(wi.value, glass);
        }
        wi.value++;
      }
    }
  };

  const update: CitySystem["update"] = (px, pz, nightFactor) => {
    nightFactorStored = nightFactor;
    windowMat.opacity = 0.8 + nightFactor * 0.08;
    lampMat.emissiveIntensity = 0.02 + nightFactor * 0.8;

    const needsRebuild = Math.hypot(px - lastUpdate.x, pz - lastUpdate.z) >= 72;
    if (needsRebuild) {
      lastUpdate = { x: px, z: pz };
      lampRecords.length = 0;
      buildingObstacles.length = 0;

      let li = 0;
      const gx0 = gridCoord(px) - 3;
      const gx1 = gridCoord(px) + 3;
      const gz0 = gridCoord(pz) - 3;
      const gz1 = gridCoord(pz) + 3;

      for (let gx = gx0; gx <= gx1; gx++) {
        for (let gz = gz0; gz <= gz1; gz++) {
          const cx = gridLineX(gx);
          const cz = gridLineZ(gz);
          for (const [lx, lz, heading] of [
            [cx + SIDEWALK_OFF, cz, 0],
            [cx - SIDEWALK_OFF, cz, Math.PI],
            [cx, cz + SIDEWALK_OFF, Math.PI / 2],
            [cx, cz - SIDEWALK_OFF, -Math.PI / 2],
          ] as [number, number, number][]) {
            if (li >= STREETLIGHT_COUNT) break;
            const gy = Math.max(0, terrainHeight(lx, lz));
            dummy.position.set(lx, gy, lz);
            dummy.rotation.set(0, heading, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            streetlights.setMatrixAt(li, dummy.matrix);
            lampRecords.push({ x: lx, y: gy, z: lz, heading });
            li++;
          }
        }
      }
      activeLampCount = li;
      for (let i = li; i < STREETLIGHT_COUNT; i++) streetlights.setMatrixAt(i, hidden.matrix);
      streetlights.count = li;
      streetlights.instanceMatrix.needsUpdate = true;

      let bi = 0;
      let wi = 0;
      const map = getActiveMap();
      const inset = BLOCK * 0.5 - 16;

      for (let gx = gx0; gx <= gx1 && bi < BUILDING_COUNT; gx++) {
        for (let gz = gz0; gz <= gz1 && bi < BUILDING_COUNT; gz++) {
          if (hash(gx * 31.7 + gz * 17.3) < map.citySkipChance * 0.5) continue;

          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              if (bi >= BUILDING_COUNT) break;
              const wx = gridLineX(gx) + sx * inset + sx * (hash(gx + gz) - 0.5) * 6;
              const wz = gridLineZ(gz) + sz * inset + sz * (hash(gz + gx) - 0.5) * 6;
              const gy = Math.max(0, terrainHeight(wx, wz));
              const bType = Math.floor(hash(wx * 0.1 + wz * 0.1) * 3);
              const towerH = bType === 2
                ? 8 + hash(wx * 0.02) * 12
                : 18 + hash(wx * 0.01 + wz * 0.011) * 55;
              const towerW = 5 + hash(wx * 0.03) * 5;
              const towerD = 5 + hash(wz * 0.04) * 5;
              const rot = hash(wx + wz) * Math.PI * 0.5;
              const facadeSide = sx > 0 ? 1 : -1;

              const podiumH = 3 + hash(wx) * 2;
              dummy.position.set(wx, gy + podiumH * 0.5, wz);
              dummy.rotation.set(0, rot, 0);
              dummy.scale.set(towerW * 1.15, podiumH, towerD * 1.15);
              dummy.updateMatrix();
              podiumMesh.setMatrixAt(bi, dummy.matrix);

              dummy.position.set(wx, gy + podiumH + towerH * 0.5, wz);
              dummy.scale.set(towerW * (bType === 1 ? 0.82 : 0.92), towerH, towerD * (bType === 1 ? 0.82 : 0.92));
              dummy.updateMatrix();
              buildingMesh.setMatrixAt(bi, dummy.matrix);
              const tint = new THREE.Color().setHSL(
                0.06 + hash(wx * 0.7 + wz) * 0.14,
                0.08 + hash(wx + wz) * 0.2,
                0.26 + hash(wx * 1.1) * 0.42,
              );
              buildingMesh.setColorAt(bi, tint);
              podiumMesh.setColorAt(bi, tint.clone().multiplyScalar(0.85));

              const roofH = 1.2 + hash(wz) * 1.5;
              dummy.position.set(wx, gy + podiumH + towerH + roofH * 0.5, wz);
              dummy.scale.set(towerW * 0.75, roofH, towerD * 0.75);
              dummy.updateMatrix();
              roofMesh.setMatrixAt(bi, dummy.matrix);

              const nx = Math.cos(rot);
              const nz = -Math.sin(rot);
              const winIdx = { value: wi };
              placeWindowGrid(wx, wz, gy + podiumH, towerH, towerW, nx, nz, facadeSide, towerD, nightFactor, winIdx);
              wi = winIdx.value;
              buildingObstacles.push({
                x: wx,
                z: wz,
                r: BUILDING_COLLISION_RADIUS * (0.75 + hash(wx + wz) * 0.35),
              });
              bi++;
            }
          }
        }
      }

      for (let i = bi; i < BUILDING_COUNT; i++) {
        buildingMesh.setMatrixAt(i, hidden.matrix);
        podiumMesh.setMatrixAt(i, hidden.matrix);
        roofMesh.setMatrixAt(i, hidden.matrix);
      }
      for (let i = wi; i < WINDOW_PANE_COUNT; i++) windowMesh.setMatrixAt(i, hidden.matrix);

      buildingMesh.count = bi;
      podiumMesh.count = bi;
      roofMesh.count = bi;
      windowMesh.count = wi;
      buildingMesh.instanceMatrix.needsUpdate = true;
      podiumMesh.instanceMatrix.needsUpdate = true;
      roofMesh.instanceMatrix.needsUpdate = true;
      windowMesh.instanceMatrix.needsUpdate = true;
      if (buildingMesh.instanceColor) buildingMesh.instanceColor.needsUpdate = true;
      if (podiumMesh.instanceColor) podiumMesh.instanceColor.needsUpdate = true;
      if (windowMesh.instanceColor) windowMesh.instanceColor.needsUpdate = true;
    }

    syncLampLights(px, pz);
  };

  const upgradeLamppost = (model: PreparedModel) => {
    streetlights.geometry.dispose();
    streetlights.geometry = model.geometry;
  };

  const dispose = () => {
    for (const pl of lampPoints) {
      scene.remove(pl);
      pl.dispose();
    }
    poolTex.dispose();
    poolMat.dispose();
    poolGeo.dispose();
    buildingGeo.dispose();
    buildingMat.dispose();
    podiumMat.dispose();
    roofMat.dispose();
    podiumMesh.dispose();
    roofMesh.dispose();
    windowGeo.dispose();
    windowMat.dispose();
    lampMat.dispose();
    streetlights.geometry.dispose();
    streetlights.dispose();
    lightPools.dispose();
    scene.remove(group);
  };

  const getObstacles = (): Obstacle[] =>
    lampRecords.map((r) => ({ x: r.x, z: r.z, r: 0.42 }));

  const getBuildingObstacles = (): Obstacle[] => buildingObstacles;

  return {
    group,
    buildingMesh,
    windowMesh,
    streetlights,
    update,
    getObstacles,
    getBuildingObstacles,
    setQuality,
    upgradeLamppost,
    dispose,
  };
};
