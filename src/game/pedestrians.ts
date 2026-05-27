import * as THREE from "three";
import { hash } from "./noise";
import { terrainHeight } from "./terrain";
import {
  BLOCK,
  densityAt,
  gridCoord,
  gridLineX,
  gridLineZ,
  SIDEWALK_OFF,
  trafficLightState,
  ROAD_HALF,
} from "./roadNetwork";

export const PED_COUNT = 120;

type PedState = "walk" | "wait" | "cross";

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
  crossProgress: number;  // 0‥1 across road
  crossFrom: number;      // world t where they started crossing
  seed: number;
}

export interface PedestrianSystem {
  update: (px: number, pz: number, dt: number, timeSec: number) => void;
  dispose: () => void;
}

export const createPedestrians = (scene: THREE.Scene): PedestrianSystem => {
  const group = new THREE.Group();
  scene.add(group);

  const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.55, 4, 8);
  const headGeo = new THREE.SphereGeometry(0.2, 8, 8);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const walkers = new THREE.InstancedMesh(bodyGeo, bodyMat, PED_COUNT);
  walkers.castShadow = true;
  const headMesh = new THREE.InstancedMesh(headGeo, bodyMat, PED_COUNT);
  group.add(walkers, headMesh);

  const colors = [
    0x8b3a3a, 0x3a5a8b, 0x3a6b4a, 0x6b5a3a, 0x5a3a6b, 0x2a2a2a, 0xc8c0b0, 0x4a4a52,
    0xb45309, 0x0e7490, 0x65a30d, 0xbe185d, 0x6d28d9, 0x0f766e, 0xd97706, 0x1d4ed8,
  ];
  for (let i = 0; i < PED_COUNT; i++) {
    walkers.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  }

  const peds: Pedestrian[] = Array.from({ length: PED_COUNT }, (_, i) => ({
    gx: 0, gz: 0,
    axis: hash(i * 3.1) > 0.5 ? "ns" : "ew" as "ns" | "ew",
    t: (hash(i * 11) - 0.5) * BLOCK * 0.8,
    speed: 0.9 + hash(i * 17) * 0.9,
    dir: hash(i * 19) > 0.5 ? 1 : -1 as 1 | -1,
    lane: hash(i * 23) > 0.5 ? 1 : -1 as -1 | 1,
    phase: hash(i * 29) * 10,
    state: "walk" as PedState,
    crossProgress: 0,
    crossFrom: 0,
    seed: hash(i * 37),
  }));

  const dummy = new THREE.Object3D();
  const hidden = new THREE.Object3D();
  hidden.scale.set(0, 0, 0);
  hidden.updateMatrix();

  const update = (px: number, pz: number, dt: number, timeSec: number) => {
    const baseGx = gridCoord(px);
    const baseGz = gridCoord(pz);
    let count = 0;
    const time = performance.now() * 0.001;

    for (let i = 0; i < peds.length && count < PED_COUNT; i++) {
      const p = peds[i];
      // Assign grid block each frame (cycles each ped through a nearby block)
      p.gx = baseGx + Math.round((hash(i * 7.1 + baseGx * 0.1) - 0.5) * 6);
      p.gz = baseGz + Math.round((hash(i * 11.3 + baseGz * 0.1) - 0.5) * 6);

      // Density culling: in suburbs, only show some peds
      const d = densityAt(p.gx, p.gz);
      if (d < 0.3 && hash(i * 13.7 + baseGx) > d * 2.5) {
        walkers.setMatrixAt(count, hidden.matrix);
        headMesh.setMatrixAt(count, hidden.matrix);
        count++;
        continue;
      }

      // --- Pedestrian crossing logic ---
      // Peds walk along sidewalk; when they near a junction, they check the light.
      // If pedestrian phase (opposite to car green), they cross the road.

      const sidewalkLane = p.lane * SIDEWALK_OFF;
      const junctionHalfPeriod = BLOCK * 0.48;

      if (p.state === "walk") {
        p.t += p.speed * dt * p.dir;

        // Bounce within block
        if (Math.abs(p.t) > junctionHalfPeriod) {
          const junctionT = Math.sign(p.t) * junctionHalfPeriod;
          // Check if we should cross here
          const jGx = p.axis === "ns" ? p.gx : gridCoord(gridLineX(p.gx) + junctionT);
          const jGz = p.axis === "ew" ? p.gz : gridCoord(gridLineZ(p.gz) + junctionT);
          const lights = trafficLightState(jGx, jGz, timeSec);
          // Pedestrians cross when the perpendicular road is red for cars
          const pedCanCross = p.axis === "ns" ? !lights.nsGreen : !lights.ewGreen;

          if (pedCanCross && hash(i * 5.3 + Math.floor(timeSec / 4)) > 0.4) {
            // Start crossing
            p.state = "cross";
            p.crossProgress = 0;
            p.crossFrom = junctionT;
            p.t = junctionT;
          } else {
            p.dir = (-p.dir) as 1 | -1;
            p.t = Math.sign(p.t) * (junctionHalfPeriod - 0.1);
          }
        }
      } else if (p.state === "wait") {
        // Re-check light
        const jGx = p.gx, jGz = p.gz;
        const lights = trafficLightState(jGx, jGz, timeSec);
        const pedCanCross = p.axis === "ns" ? !lights.nsGreen : !lights.ewGreen;
        if (pedCanCross) {
          p.state = "cross";
          p.crossProgress = 0;
        }
      } else if (p.state === "cross") {
        p.crossProgress += p.speed / (SIDEWALK_OFF * 2 + ROAD_HALF * 2) * dt;
        if (p.crossProgress >= 1) {
          // Finished crossing — end up on the other side of the road, keep walking
          p.lane = (-p.lane) as -1 | 1;
          p.state = "walk";
          p.crossProgress = 0;
        }
      }

      let wx: number, wz: number, heading: number;

      if (p.state === "cross") {
        // Cross perpendicular to walking direction
        const crossStart = sidewalkLane;
        const crossEnd   = -p.lane * SIDEWALK_OFF; // opposite side
        const crossLerp  = p.crossProgress;
        const crossOff   = crossStart + (crossEnd - crossStart) * crossLerp;

        if (p.axis === "ns") {
          wx = gridLineX(p.gx) + crossOff;
          wz = gridLineZ(p.gz) + p.t;
          heading = crossEnd > crossStart ? Math.PI / 2 : -Math.PI / 2;
        } else {
          wx = gridLineX(p.gx) + p.t;
          wz = gridLineZ(p.gz) + crossOff;
          heading = crossEnd > crossStart ? 0 : Math.PI;
        }
      } else {
        if (p.axis === "ns") {
          wx = gridLineX(p.gx) + sidewalkLane;
          wz = gridLineZ(p.gz) + p.t;
          heading = p.dir > 0 ? 0 : Math.PI;
        } else {
          wx = gridLineX(p.gx) + p.t;
          wz = gridLineZ(p.gz) + sidewalkLane;
          heading = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      }

      if (Math.hypot(wx - px, wz - pz) > 220) {
        walkers.setMatrixAt(count, hidden.matrix);
        headMesh.setMatrixAt(count, hidden.matrix);
        count++;
        continue;
      }

      const gy = Math.max(0, terrainHeight(wx, wz));
      const isMoving = p.state !== "wait";
      const bob = isMoving ? Math.sin(time * 8 + p.phase) * 0.04 : 0;

      dummy.position.set(wx, gy + 0.72 + bob, wz);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      walkers.setMatrixAt(count, dummy.matrix);
      dummy.position.set(wx, gy + 1.35 + bob, wz);
      dummy.updateMatrix();
      headMesh.setMatrixAt(count, dummy.matrix);
      count++;
    }

    for (let i = count; i < PED_COUNT; i++) {
      walkers.setMatrixAt(i, hidden.matrix);
      headMesh.setMatrixAt(i, hidden.matrix);
    }
    walkers.count = count;
    headMesh.count = count;
    walkers.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    if (walkers.instanceColor) walkers.instanceColor.needsUpdate = true;
  };

  const dispose = () => {
    bodyGeo.dispose();
    headGeo.dispose();
    bodyMat.dispose();
    walkers.dispose();
    headMesh.dispose();
    scene.remove(group);
  };

  return { update, dispose };
};
