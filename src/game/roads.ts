import * as THREE from "three";
import { terrainHeight } from "./terrain";
import {
  BLOCK,
  ROAD_HALF,
  SIDEWALK_OFF,
  gridCoord,
  gridLineX,
  gridLineZ,
  roadSurfaceY,
} from "./roadNetwork";

const GRID_RADIUS = 3;

export interface RoadRenderer {
  update: (px: number, pz: number, nightFactor: number) => void;
  dispose: () => void;
}

const makeAsphaltTexture = (): THREE.CanvasTexture => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2a2a2e";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 800; i++) {
    const g = 20 + Math.random() * 18;
    ctx.fillStyle = `rgb(${g},${g},${g + 2})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

export const createRoadRenderer = (scene: THREE.Scene): RoadRenderer => {
  const asphaltTex = makeAsphaltTexture();
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    color: 0xaaaaaa,
    roughness: 0.88,
    metalness: 0.06,
    emissive: new THREE.Color(0x0c0c0e),
    emissiveIntensity: 0.12,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x5a5a5e,
    roughness: 0.9,
    metalness: 0.04,
  });
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xf4f4f4,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.06,
    roughness: 0.75,
  });
  const zebraMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.05,
    roughness: 0.82,
  });

  const group = new THREE.Group();
  group.renderOrder = 8;
  scene.add(group);

  const meshes: THREE.Mesh[] = [];
  let cacheKey = "";

  const sampleY = (x: number, z: number) => roadSurfaceY(x, z);

  const addPlane = (
    w: number,
    l: number,
    cx: number,
    cz: number,
    rotY: number,
    mat: THREE.Material,
    yOff = 0,
  ) => {
    const geo = new THREE.PlaneGeometry(w, l);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    const y = sampleY(cx, cz) + yOff;
    mesh.position.set(cx, y, cz);
    mesh.rotation.y = rotY;
    mesh.receiveShadow = true;
    mesh.renderOrder = 8;
    group.add(mesh);
    meshes.push(mesh);
  };

  const rebuild = (gx0: number, gx1: number, gz0: number, gz1: number) => {
    for (const m of meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    meshes.length = 0;

    const span = BLOCK * (GRID_RADIUS * 2 + 1);
    const roadW = ROAD_HALF * 2;
    const curbW = 0.55;
    const curbOff = ROAD_HALF + curbW * 0.5;

    for (let gx = gx0; gx <= gx1; gx++) {
      const x = gridLineX(gx);
      const zMid = (gridLineZ(gz0) + gridLineZ(gz1)) * 0.5;
      addPlane(roadW, span, x, zMid, 0, roadMat);
      addPlane(curbW, span, x + curbOff, zMid, 0, curbMat, 0.02);
      addPlane(curbW, span, x - curbOff, zMid, 0, curbMat, 0.02);
      // sparse center dashes
      const steps = Math.floor(span / 14);
      for (let i = 0; i < steps; i += 2) {
        const t = -span * 0.5 + (i / steps) * span;
        const geo = new THREE.PlaneGeometry(0.16, span / steps * 0.75);
        geo.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geo, markMat);
        m.position.set(x, sampleY(x, zMid + t) + 0.03, zMid + t);
        m.renderOrder = 9;
        group.add(m);
        meshes.push(m);
      }
    }

    for (let gz = gz0; gz <= gz1; gz++) {
      const z = gridLineZ(gz);
      const xMid = (gridLineX(gx0) + gridLineX(gx1)) * 0.5;
      addPlane(span, roadW, xMid, z, Math.PI / 2, roadMat);
      addPlane(span, curbW, xMid, z + curbOff, Math.PI / 2, curbMat, 0.02);
      addPlane(span, curbW, xMid, z - curbOff, Math.PI / 2, curbMat, 0.02);
    }

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const cx = gridLineX(gx);
        const cz = gridLineZ(gz);
        const pad = ROAD_HALF * 2 + 0.5;
        addPlane(pad, pad, cx, cz, 0, roadMat);

        const stripeW = 0.55;
        const stripeGap = 1.4;
        const start = ROAD_HALF + 0.5;
        const end = SIDEWALK_OFF - 0.4;
        for (let s = start; s < end; s += stripeW + stripeGap) {
          const z1 = cz + s;
          const z2 = cz + s + stripeW;
          const geo = new THREE.PlaneGeometry(roadW, stripeW);
          geo.rotateX(-Math.PI / 2);
          const m = new THREE.Mesh(geo, zebraMat);
          const zz = (z1 + z2) * 0.5;
          m.position.set(cx, sampleY(cx, zz) + 0.04, zz);
          m.renderOrder = 9;
          group.add(m);
          meshes.push(m);
          const z1b = cz - s;
          const z2b = cz - s - stripeW;
          const m2 = new THREE.Mesh(geo, zebraMat);
          const zz2 = (z1b + z2b) * 0.5;
          m2.position.set(cx, sampleY(cx, zz2) + 0.04, zz2);
          m2.renderOrder = 9;
          group.add(m2);
          meshes.push(m2);
        }
      }
    }
  };

  const update = (px: number, pz: number, nightFactor: number) => {
    const nf = Math.max(0, Math.min(1, nightFactor));
    roadMat.emissiveIntensity = 0.1 + nf * 0.28;
    markMat.emissiveIntensity = 0.06 + nf * 0.22;
    zebraMat.emissiveIntensity = 0.05 + nf * 0.25;

    const gx0 = gridCoord(px) - GRID_RADIUS;
    const gx1 = gridCoord(px) + GRID_RADIUS;
    const gz0 = gridCoord(pz) - GRID_RADIUS;
    const gz1 = gridCoord(pz) + GRID_RADIUS;
    const key = `${gx0}|${gx1}|${gz0}|${gz1}`;
    if (key !== cacheKey) {
      cacheKey = key;
      rebuild(gx0, gx1, gz0, gz1);
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
