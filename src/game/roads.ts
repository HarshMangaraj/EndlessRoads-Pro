import * as THREE from "three";
import {
  BLOCK,
  ROAD_HALF,
  SIDEWALK_OFF,
  gridCoord,
  gridLineX,
  gridLineZ,
  roadSurfaceY,
} from "./roadNetwork";

/** Blocks of city grid kept loaded around the player. */
const GRID_RADIUS = 5;

export interface RoadRenderer {
  update: (px: number, pz: number, nightFactor: number, isWet: boolean, dt: number) => void;
  dispose: () => void;
}

const makeAsphaltTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#252528";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    const g = 22 + Math.random() * 20;
    ctx.fillStyle = `rgb(${g},${g},${g + 3})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

export const createRoadRenderer = (scene: THREE.Scene): RoadRenderer => {
  const asphaltTex = makeAsphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    color: 0x888888,
    roughness: 0.9,
    metalness: 0.05,
    emissive: new THREE.Color(0x08080a),
    emissiveIntensity: 0.08,
    depthWrite: true,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a50,
    roughness: 0.92,
    metalness: 0.03,
  });
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.08,
    roughness: 0.8,
  });
  const zebraMat = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.06,
    roughness: 0.85,
  });

  const group = new THREE.Group();
  group.renderOrder = 10;
  scene.add(group);

  const meshes: THREE.Mesh[] = [];
  let cacheKey = "";

  const addStrip = (
    width: number,
    length: number,
    cx: number,
    cz: number,
    rotY: number,
    mat: THREE.Material,
    yOff = 0.02,
  ) => {
    const geo = new THREE.PlaneGeometry(width, length);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    const y = roadSurfaceY(cx, cz) + yOff;
    mesh.position.set(cx, y, cz);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    mesh.renderOrder = 10;
    group.add(mesh);
    meshes.push(mesh);
  };

  const rebuild = (centerGx: number, centerGz: number) => {
    for (const m of meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    meshes.length = 0;

    const gx0 = centerGx - GRID_RADIUS;
    const gx1 = centerGx + GRID_RADIUS;
    const gz0 = centerGz - GRID_RADIUS;
    const gz1 = centerGz + GRID_RADIUS;

    const span = BLOCK * (GRID_RADIUS * 2 + 1);
    const roadW = ROAD_HALF * 2;
    const shoulderW = (SIDEWALK_OFF - ROAD_HALF) * 2 + 0.4;
    const curbW = 0.5;
    const curbOff = ROAD_HALF + curbW * 0.5;

    for (let gx = gx0; gx <= gx1; gx++) {
      const x = gridLineX(gx);
      const zMid = (gridLineZ(gz0) + gridLineZ(gz1)) * 0.5;
      addStrip(roadW, span + 4, x, zMid, 0, roadMat);
      addStrip(shoulderW, span + 4, x + ROAD_HALF + shoulderW * 0.5, zMid, 0, roadMat, 0.015);
      addStrip(shoulderW, span + 4, x - ROAD_HALF - shoulderW * 0.5, zMid, 0, roadMat, 0.015);
      addStrip(curbW, span + 4, x + curbOff, zMid, 0, curbMat, 0.025);
      addStrip(curbW, span + 4, x - curbOff, zMid, 0, curbMat, 0.025);

      const steps = Math.floor(span / 12);
      for (let i = 0; i < steps; i += 2) {
        const t = -span * 0.5 + (i / steps) * span;
        addStrip(0.14, span / steps * 0.7, x, zMid + t, 0, markMat, 0.035);
      }
    }

    for (let gz = gz0; gz <= gz1; gz++) {
      const z = gridLineZ(gz);
      const xMid = (gridLineX(gx0) + gridLineX(gx1)) * 0.5;
      addStrip(span + 4, roadW, xMid, z, Math.PI / 2, roadMat);
      addStrip(span + 4, shoulderW, xMid, z + ROAD_HALF + shoulderW * 0.5, Math.PI / 2, roadMat, 0.015);
      addStrip(span + 4, shoulderW, xMid, z - ROAD_HALF - shoulderW * 0.5, Math.PI / 2, roadMat, 0.015);
      addStrip(span + 4, curbW, xMid, z + curbOff, Math.PI / 2, curbMat, 0.025);
      addStrip(span + 4, curbW, xMid, z - curbOff, Math.PI / 2, curbMat, 0.025);
    }

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const cx = gridLineX(gx);
        const cz = gridLineZ(gz);
        addStrip(roadW + 1, roadW + 1, cx, cz, 0, roadMat, 0.02);

        const stripeW = 0.5;
        const stripeGap = 1.3;
        for (let s = ROAD_HALF + 0.4; s < SIDEWALK_OFF - 0.3; s += stripeW + stripeGap) {
          addStrip(roadW, stripeW, cx, cz + s, 0, zebraMat, 0.04);
          addStrip(roadW, stripeW, cx, cz - s, 0, zebraMat, 0.04);
        }
      }
    }
  };

  const update = (px: number, pz: number, nightFactor: number, isWet: boolean, dt: number) => {
    const nf = Math.max(0, Math.min(1, nightFactor));
    
    const nightWetRough = isWet ? 0.18 : nf > 0.4 ? 0.42 : 0.78;
    const nightWetMetal = isWet ? 0.52 : nf > 0.4 ? 0.28 : 0.08;
    roadMat.roughness += (nightWetRough - roadMat.roughness) * dt * 1.8;
    roadMat.metalness += (nightWetMetal - roadMat.metalness) * dt * 1.8;
    roadMat.emissiveIntensity = 0.06 + nf * 0.22;

    markMat.emissiveIntensity = 0.1 + nf * 0.35;
    zebraMat.emissiveIntensity = 0.06 + nf * 0.22;

    const centerGx = gridCoord(px);
    const centerGz = gridCoord(pz);
    const key = `${centerGx}|${centerGz}`;
    if (key !== cacheKey) {
      cacheKey = key;
      rebuild(centerGx, centerGz);
    }
  };

  const dispose = () => {
    for (const m of meshes) {
      m.geometry.dispose();
      group.remove(m);
    }
    meshes.length = 0;
    asphaltTex.dispose();
    roadMat.dispose();
    curbMat.dispose();
    markMat.dispose();
    zebraMat.dispose();
    scene.remove(group);
  };

  return { update, dispose };
};
