import * as THREE from "three";
import { hash } from "./noise";
import { terrainHeight, biomeWeightsAt, dominantBiome } from "./terrain";
import { getActiveMap } from "./maps";
import { BiomeKey } from "./constants";
import type { GameAssets, PreparedModel, QualityTier } from "./assets";
import { createFoliageMaterial } from "./assets";

export interface VegCounts {
  pine: number;
  maple: number;
  broadleaf: number;
  palm: number;
  bush: number;
  rock: number;
  cactus: number;
}

const COUNTS_BY_QUALITY: Record<QualityTier, VegCounts> = {
  low:    { pine: 180, maple: 120, broadleaf: 140, palm: 80,  bush: 200, rock: 80,  cactus: 60 },
  medium: { pine: 320, maple: 220, broadleaf: 260, palm: 120, bush: 320, rock: 110, cactus: 90 },
  high:   { pine: 480, maple: 340, broadleaf: 400, palm: 160, bush: 400, rock: 130, cactus: 100 },
  ultra:  { pine: 620, maple: 440, broadleaf: 520, palm: 200, bush: 480, rock: 150, cactus: 120 },
};

export interface VegetationSystem {
  update: (
    cx: number,
    cz: number,
    carS: number,
    isNearRoad: (wx: number, wz: number, carS: number) => boolean,
  ) => void;
  upgradeTrees: (assets: GameAssets) => void;
  dispose: () => void;
}

export const createVegetation = (
  scene: THREE.Scene,
  assets: GameAssets,
  quality: QualityTier,
  vegRadius: number,
  vegCell: number,
  twoPi: number,
): VegetationSystem => {
  const counts = COUNTS_BY_QUALITY[quality];
  const pineMat = createFoliageMaterial();
  const mapleMat = createFoliageMaterial();
  const broadMat = createFoliageMaterial();

  const pineMesh = new THREE.InstancedMesh(assets.pine.geometry, pineMat, counts.pine);
  const mapleMesh = new THREE.InstancedMesh(assets.maple.geometry, mapleMat, counts.maple);
  const broadMesh = new THREE.InstancedMesh(assets.broadleaf.geometry, broadMat, counts.broadleaf);
  pineMesh.castShadow = mapleMesh.castShadow = broadMesh.castShadow = true;
  pineMesh.receiveShadow = mapleMesh.receiveShadow = broadMesh.receiveShadow = true;

  const palmLeafGeo = new THREE.SphereGeometry(1.2, 8, 6);
  palmLeafGeo.scale(1.9, 0.4, 1.9);
  const palmMesh = new THREE.InstancedMesh(
    palmLeafGeo,
    new THREE.MeshStandardMaterial({ color: 0x1e7a1e, roughness: 0.88 }),
    counts.palm,
  );
  const palmTrunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.21, 6, 7),
    new THREE.MeshStandardMaterial({ color: 0x7a5810, roughness: 1 }),
    counts.palm,
  );
  const bushMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.72, 8, 6),
    new THREE.MeshStandardMaterial({ roughness: 1, color: 0x295218 }),
    counts.bush,
  );
  const rockMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({ color: 0x5e5e59, roughness: 0.96 }),
    counts.rock,
  );
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3d6e22, roughness: 0.88 });
  const cactusMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.22, 2.6, 9),
    cactusMat,
    counts.cactus,
  );
  const cactusArmMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.12, 1.0, 9),
    cactusMat,
    counts.cactus,
  );

  const allMeshes = [
    pineMesh, mapleMesh, broadMesh, palmMesh, palmTrunkMesh,
    bushMesh, rockMesh, cactusMesh, cactusArmMesh,
  ];
  allMeshes.forEach((m) => {
    m.frustumCulled = false;
    scene.add(m);
  });

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let lastPos = { x: 99999, z: 99999 };

  const setTreeColor = (
    mesh: THREE.InstancedMesh,
    idx: number,
    dom: BiomeKey,
    h: number,
    snowy: boolean,
  ) => {
    if (snowy) {
      color.setHSL(0.58, 0.12, 0.72 + hash(h * 13) * 0.08);
    } else if (dom === "jungle") {
      color.setHSL(0.32 + hash(h * 11) * 0.04, 0.65, 0.22 + hash(h * 17) * 0.06);
    } else if (dom === "forest") {
      color.setHSL(0.30 + hash(h * 9) * 0.05, 0.52, 0.26 + hash(h * 15) * 0.08);
    } else if (dom === "mountain") {
      color.setHSL(0.28 + hash(h * 7) * 0.04, 0.38, 0.30 + hash(h * 19) * 0.06);
    } else if (dom === "desert") {
      color.setHSL(0.22, 0.35, 0.32);
    } else {
      color.setHSL(0.27 + hash(h * 21) * 0.06, 0.48, 0.30 + hash(h * 23) * 0.1);
    }
    mesh.setColorAt(idx, color);
  };

  const update: VegetationSystem["update"] = (cx, cz, carS, isNearRoad) => {
    if (Math.hypot(cx - lastPos.x, cz - lastPos.z) < 10) return;
    lastPos = { x: cx, z: cz };

    const map = getActiveMap();
    const grid = Math.ceil(vegRadius / vegCell);
    const baseX = Math.floor(cx / vegCell);
    const baseZ = Math.floor(cz / vegCell);

    let pi = 0, mai = 0, bi = 0, pai = 0, bui = 0, ri = 0, ci = 0;

    for (let gx = -grid; gx <= grid; gx++) {
      for (let gz = -grid; gz <= grid; gz++) {
        const wx = (baseX + gx) * vegCell;
        const wz = (baseZ + gz) * vegCell;
        const h = hash(wx * 12.9898 + wz * 78.233);
        if (h < map.vegSpawnThreshold) continue;

        const jx = wx + (hash(h * 7.1) - 0.5) * vegCell;
        const jz = wz + (hash(h * 3.7) - 0.5) * vegCell;
        if (Math.hypot(jx - cx, jz - cz) > vegRadius) continue;
        if (isNearRoad(jx, jz, carS)) continue;

        const gy = terrainHeight(jx, jz);
        if (gy < 0.15) continue;

        const scale = 0.75 + hash(h * 9.4) * 0.55;
        dummy.rotation.set(0, hash(h * 2.3) * twoPi, 0);
        const localBw = biomeWeightsAt(jx, jz);
        const localDom = dominantBiome(localBw);
        const dense = map.vegDensityMul;
        const isRock = hash(h * 5.2) > 0.91 - dense * 0.04;
        const isCactus = map.id === "plain" && localDom === "desert" && hash(h * 6.3) > 0.55 && !isRock;
        const isPalm =
          (map.id === "beach" || (localDom === "coastal" && hash(h * 8.1) > 0.35 - map.palmBias * 0.3)) &&
          hash(h * 8.1) > 0.42 - map.palmBias * 0.35 && gy < 8;
        const isSnowy = localDom === "tundra" && gy > map.snowLine - 8;
        const isPine =
          (map.id === "forest" || map.id === "hills" || localDom === "mountain" || localDom === "forest" || isSnowy) &&
          hash(h * 1.7) > 0.22 - dense * 0.08 && !isPalm && !isCactus && !isRock;
        const isMaple =
          (map.id === "forest" || localDom === "jungle") &&
          hash(h * 2.9) > 0.38 - dense * 0.06 && !isPine && !isPalm && !isCactus && !isRock;
        const isBush = hash(h * 4.4) > 0.76 && !isRock && !isCactus;

        if (isRock && ri < counts.rock) {
          dummy.position.set(jx, gy + scale * 0.35, jz);
          dummy.scale.set(scale, scale * 0.75, scale);
          dummy.updateMatrix();
          rockMesh.setMatrixAt(ri++, dummy.matrix);
        } else if (isCactus && ci < counts.cactus) {
          dummy.position.set(jx, gy, jz);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          cactusMesh.setMatrixAt(ci, dummy.matrix);
          dummy.position.set(jx + 0.4 * scale, gy + 0.55 * scale, jz);
          dummy.rotation.z = Math.PI / 3;
          dummy.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
          dummy.updateMatrix();
          cactusArmMesh.setMatrixAt(ci, dummy.matrix);
          dummy.rotation.z = 0;
          ci++;
        } else if (isPalm && pai < counts.palm) {
          dummy.position.set(jx, gy + 3, jz);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          palmTrunkMesh.setMatrixAt(pai, dummy.matrix);
          dummy.position.set(jx, gy + 6 + scale * 1.2, jz);
          dummy.scale.set(scale * 1.5, scale, scale * 1.5);
          dummy.updateMatrix();
          palmMesh.setMatrixAt(pai++, dummy.matrix);
        } else if (isPine && pi < counts.pine) {
          dummy.position.set(jx, gy, jz);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          pineMesh.setMatrixAt(pi, dummy.matrix);
          setTreeColor(pineMesh, pi, localDom, h, isSnowy);
          pi++;
        } else if (isMaple && mai < counts.maple) {
          dummy.position.set(jx, gy, jz);
          dummy.scale.set(scale * 1.05, scale * 1.05, scale * 1.05);
          dummy.updateMatrix();
          mapleMesh.setMatrixAt(mai, dummy.matrix);
          setTreeColor(mapleMesh, mai, localDom, h, false);
          mai++;
        } else if (isBush && bui < counts.bush) {
          dummy.position.set(jx, gy + scale * 0.45, jz);
          dummy.scale.set(scale, scale * 0.65, scale);
          dummy.updateMatrix();
          bushMesh.setMatrixAt(bui++, dummy.matrix);
        } else if (bi < counts.broadleaf) {
          dummy.position.set(jx, gy, jz);
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          broadMesh.setMatrixAt(bi, dummy.matrix);
          setTreeColor(broadMesh, bi, localDom, h, false);
          bi++;
        }
      }
    }

    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    const hide = dummy.matrix;

    const hideRange = (
      mesh: THREE.InstancedMesh,
      from: number,
      max: number,
    ) => {
      for (let i = from; i < max; i++) mesh.setMatrixAt(i, hide);
    };

    hideRange(pineMesh, pi, counts.pine);
    hideRange(mapleMesh, mai, counts.maple);
    hideRange(broadMesh, bi, counts.broadleaf);
    hideRange(palmMesh, pai, counts.palm);
    hideRange(palmTrunkMesh, pai, counts.palm);
    hideRange(bushMesh, bui, counts.bush);
    hideRange(rockMesh, ri, counts.rock);
    for (let i = ci; i < counts.cactus; i++) {
      cactusMesh.setMatrixAt(i, hide);
      cactusArmMesh.setMatrixAt(i, hide);
    }

    pineMesh.count = pi;
    mapleMesh.count = mai;
    broadMesh.count = bi;
    palmMesh.count = pai;
    palmTrunkMesh.count = pai;
    bushMesh.count = bui;
    rockMesh.count = ri;
    cactusMesh.count = ci;
    cactusArmMesh.count = ci;

    allMeshes.forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });
  };

  const upgradeTrees = (next: GameAssets) => {
    const pairs: [THREE.InstancedMesh, PreparedModel][] = [
      [pineMesh, next.pine],
      [mapleMesh, next.maple],
      [broadMesh, next.broadleaf],
    ];
    for (const [mesh, model] of pairs) {
      mesh.geometry.dispose();
      mesh.geometry = model.geometry;
    }
  };

  const dispose = () => {
    [pineMat, mapleMat, broadMat].forEach((m) => m.dispose());
    allMeshes.forEach((m) => {
      scene.remove(m);
      m.dispose();
    });
  };

  return { update, upgradeTrees, dispose };
};
