import * as THREE from "three";
import { hash } from "./noise";
import {
  BLOCK,
  densityAt,
  gridCoord,
  gridLineX,
  gridLineZ,
  roadSurfaceY,
  trafficLightState,
  ROAD_HALF,
  SIDEWALK_OFF,
} from "./roadNetwork";

export const PED_COUNT = 140;

type PedState = "walk" | "cross" | "flee";

interface Pedestrian {
  gx: number;
  gz: number;
  axis: "ns" | "ew";
  t: number;
  speed: number;
  dir: 1 | -1;
  lane: -1 | 1;
  phase: number;
  state: PedState;
  crossProgress: number;
  seed: number;
}

const createPedGeometry = (): THREE.BufferGeometry => {
  const parts = [
    { w: 0.38, h: 0.52, d: 0.22, ox: 0, oy: 0.68, oz: 0 },
    { w: 0.24, h: 0.26, d: 0.22, ox: 0, oy: 1.12, oz: 0 },
    { w: 0.14, h: 0.42, d: 0.14, ox: -0.1, oy: 0.21, oz: 0 },
    { w: 0.14, h: 0.42, d: 0.14, ox: 0.1, oy: 0.21, oz: 0 },
  ];
  const posArr: number[] = [];
  const normArr: number[] = [];
  const idxArr: number[] = [];
  let vOff = 0;

  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d);
    g.computeVertexNormals();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const norm = g.attributes.normal as THREE.BufferAttribute;
    const idx = g.index!;
    for (let i = 0; i < pos.count; i++) {
      posArr.push(pos.getX(i) + p.ox, pos.getY(i) + p.oy, pos.getZ(i) + p.oz);
      normArr.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
    for (let i = 0; i < idx.count; i++) idxArr.push(idx.getX(i) + vOff);
    vOff += pos.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normArr, 3));
  merged.setIndex(idxArr);
  return merged;
};

export interface PedestrianSystem {
  update: (px: number, pz: number, dt: number, timeSec: number) => void;
  setPlayerSpeed: (speedMs: number) => void;
  dispose: () => void;
}

export const createPedestrians = (scene: THREE.Scene): PedestrianSystem => {
  const group = new THREE.Group();
  scene.add(group);

  const pedGeo = createPedGeometry();
  const pedMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.05,
  });
  const walkers = new THREE.InstancedMesh(pedGeo, pedMat, PED_COUNT);
  walkers.castShadow = true;
  walkers.receiveShadow = true;
  group.add(walkers);

  const colors = [
    0x8b3a3a, 0x3a5a8b, 0x3a6b4a, 0x6b5a3a, 0x5a3a6b, 0x2a2a2a, 0xc8c0b0, 0x4a4a52,
    0xb45309, 0x0e7490, 0x65a30d, 0xbe185d, 0x6d28d9, 0x0f766e, 0xd97706, 0x1d4ed8,
    0xf472b6, 0x78716c, 0x0369a1, 0x15803d,
  ];
  for (let i = 0; i < PED_COUNT; i++) {
    walkers.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  }

  const peds: Pedestrian[] = Array.from({ length: PED_COUNT }, (_, i) => ({
    gx: Math.round((hash(i * 7.3) - 0.5) * 6),
    gz: Math.round((hash(i * 13.1) - 0.5) * 6),
    axis: hash(i * 3.1) > 0.5 ? "ns" : "ew" as "ns" | "ew",
    t: (hash(i * 11) - 0.5) * BLOCK * 0.75,
    speed: 0.9 + hash(i * 17) * 0.9,
    dir: hash(i * 19) > 0.5 ? 1 : -1 as 1 | -1,
    lane: hash(i * 23) > 0.5 ? 1 : -1 as -1 | 1,
    phase: hash(i * 29) * 10,
    state: "walk" as PedState,
    crossProgress: 0,
    seed: hash(i * 37),
  }));

  const dummy = new THREE.Object3D();
  const hidden = new THREE.Object3D();
  hidden.scale.set(0, 0, 0);
  hidden.updateMatrix();

  let playerSpeedMs = 0;

  const update = (px: number, pz: number, dt: number, timeSec: number) => {
    const baseGx = gridCoord(px);
    const baseGz = gridCoord(pz);
    let count = 0;
    const time = performance.now() * 0.001;

    for (let i = 0; i < peds.length && count < PED_COUNT; i++) {
      const p = peds[i];
      if (Math.abs(p.gx - baseGx) > 4 || Math.abs(p.gz - baseGz) > 4) {
        p.gx = baseGx + Math.round((hash(i * 7.3 + baseGx * 0.1) - 0.5) * 8);
        p.gz = baseGz + Math.round((hash(i * 13.1 + baseGz * 0.1) - 0.5) * 8);
        p.t = (hash(i * 11 + baseGx + baseGz) - 0.5) * BLOCK * 0.75;
      }

      const d = densityAt(p.gx, p.gz);
      if (d < 0.15 && hash(i * 13.7 + baseGx) > 0.85) {
        walkers.setMatrixAt(count, hidden.matrix);
        count++;
        continue;
      }

      const sidewalkLane = p.lane * SIDEWALK_OFF;
      const junctionHalf = BLOCK * 0.46;

      if (p.state === "walk" || p.state === "flee") {
        let estX = gridLineX(p.gx) + (p.axis === "ns" ? sidewalkLane : p.t);
        let estZ = gridLineZ(p.gz) + (p.axis === "ew" ? sidewalkLane : p.t);
        const fleeDist = Math.hypot(estX - px, estZ - pz);

        if (fleeDist < 10 && playerSpeedMs > 3) {
          p.state = "flee";
          p.speed = 2.4 + hash(i) * 0.7;
          const away = Math.atan2(estZ - pz, estX - px);
          p.dir = (Math.cos(away) > 0 ? 1 : -1) as 1 | -1;
        } else if (p.state === "flee" && fleeDist > 16) {
          p.state = "walk";
          p.speed = 0.9 + hash(i * 17) * 0.9;
        }

        p.t += p.speed * dt * p.dir;
        if (p.state === "walk" && Math.abs(p.t) > junctionHalf) {
          const lights = trafficLightState(p.gx, p.gz, timeSec);
          const pedCanCross = p.axis === "ns" ? !lights.nsGreen : !lights.ewGreen;
          if (pedCanCross && hash(i * 5.3 + Math.floor(timeSec / 4)) > 0.38) {
            p.state = "cross";
            p.crossProgress = 0;
            p.t = Math.sign(p.t) * junctionHalf;
          } else {
            p.dir = (-p.dir) as 1 | -1;
            p.t = Math.sign(p.t) * (junctionHalf - 0.5);
          }
        }
      } else if (p.state === "cross") {
        p.crossProgress += p.speed / (SIDEWALK_OFF * 2 + ROAD_HALF * 2) * dt;
        if (p.crossProgress >= 1) {
          p.lane = (-p.lane) as -1 | 1;
          p.state = "walk";
          p.crossProgress = 0;
        }
      }

      let wx: number;
      let wz: number;
      let heading: number;

      if (p.state === "cross") {
        const crossStart = sidewalkLane;
        const crossEnd = -p.lane * SIDEWALK_OFF;
        const crossOff = crossStart + (crossEnd - crossStart) * p.crossProgress;
        if (p.axis === "ns") {
          wx = gridLineX(p.gx) + crossOff;
          wz = gridLineZ(p.gz) + p.t;
          heading = crossEnd > crossStart ? Math.PI / 2 : -Math.PI / 2;
        } else {
          wx = gridLineX(p.gx) + p.t;
          wz = gridLineZ(p.gz) + crossOff;
          heading = crossEnd > crossStart ? 0 : Math.PI;
        }
      } else if (p.axis === "ns") {
        wx = gridLineX(p.gx) + sidewalkLane;
        wz = gridLineZ(p.gz) + p.t;
        heading = p.dir > 0 ? 0 : Math.PI;
      } else {
        wx = gridLineX(p.gx) + p.t;
        wz = gridLineZ(p.gz) + sidewalkLane;
        heading = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      if (Math.hypot(wx - px, wz - pz) > 220) {
        walkers.setMatrixAt(count, hidden.matrix);
        count++;
        continue;
      }

      const gy = roadSurfaceY(wx, wz);
      const walkCycle = Math.sin(time * 7 + p.phase);
      const bob = walkCycle * 0.025;
      const fleeLean = p.state === "flee" ? 0.1 : 0;

      dummy.position.set(wx, gy + bob, wz);
      dummy.rotation.set(walkCycle * 0.08 + fleeLean, heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      walkers.setMatrixAt(count, dummy.matrix);
      count++;
    }

    for (let i = count; i < PED_COUNT; i++) walkers.setMatrixAt(i, hidden.matrix);
    walkers.count = count;
    walkers.instanceMatrix.needsUpdate = true;
    if (walkers.instanceColor) walkers.instanceColor.needsUpdate = true;
  };

  const dispose = () => {
    pedGeo.dispose();
    pedMat.dispose();
    walkers.dispose();
    scene.remove(group);
  };

  return {
    update,
    setPlayerSpeed: (speedMs: number) => { playerSpeedMs = speedMs; },
    dispose,
  };
};
