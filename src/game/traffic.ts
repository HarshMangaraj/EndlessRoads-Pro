import * as THREE from "three";
import type { Obstacle } from "./collisions";
import { TRAFFIC_COLLISION_RADIUS } from "./collisions";
import { hash } from "./noise";
import {
  BLOCK,
  RoadAxis,
  axisMayProceed,
  densityAt,
  distToJunctionAhead,
  gridCoord,
  gridLineX,
  gridLineZ,
  positionOnLane,
  roadSurfaceY,
} from "./roadNetwork";

export const TRAFFIC_COUNT = 48;

interface TrafficCar {
  group: THREE.Group;
  axis: RoadAxis;
  line: number;
  t: number;
  lane: -1 | 1;
  dir: 1 | -1;
  speed: number;
  targetSpeed: number;
  turning: boolean;
  turnProgress: number;
  turnFromAxis: RoadAxis;
  turnFromLine: number;
  turnFromT: number;
  turnToAxis: RoadAxis;
  turnToLine: number;
  turnDir: 1 | -1;
  seed: number;
}

const CAR_COLORS = [0xc23b22, 0x2563eb, 0x16a34a, 0xeab308, 0xf97316, 0x111827, 0xe5e7eb, 0x7c3aed,
                    0xdc2626, 0x0ea5e9, 0xd97706, 0x4ade80, 0xfbbf24, 0x94a3b8, 0x8b5cf6, 0xf43f5e];

const trafficCarY = (x: number, z: number) => roadSurfaceY(x, z) + 0.5;

const makeCar = (color: number): THREE.Group => {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x101820, metalness: 0.5, roughness: 0.15, transparent: true, opacity: 0.75,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 4.0), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 2.0), bodyMat);
  cab.position.set(0, 1.05, -0.1); cab.castShadow = true; g.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.4, 1.85), glassMat);
  glass.position.set(0, 1.07, -0.1); g.add(glass);

  ([[0.78, 0.35, 1.3], [-0.78, 0.35, 1.3], [0.78, 0.35, -1.25], [-0.78, 0.35, -1.25]] as const).forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12), wheelMat);
    w.position.set(x, y, z); w.rotation.z = Math.PI / 2; w.castShadow = true; g.add(w);
  });

  return g;
};

const placeCar = (c: TrafficCar) => {
  const p = positionOnLane(c.axis, c.line, c.t, c.lane, c.dir);
  c.group.position.set(p.x, trafficCarY(p.x, p.z), p.z);
  c.group.rotation.y = p.heading;
  c.group.visible = true;
};

export interface TrafficSystem {
  update: (px: number, pz: number, timeSec: number, dt: number) => void;
  getPositions: () => { x: number; z: number; speed: number }[];
  getObstacles: () => Obstacle[];
  dispose: () => void;
}

export const createTraffic = (scene: THREE.Scene): TrafficSystem => {
  const cars: TrafficCar[] = [];

  const spawnNear = (c: TrafficCar, ci: number, px: number, pz: number, timeSec: number) => {
    const playerGx = gridCoord(px);
    const playerGz = gridCoord(pz);
    const dx = Math.round((hash(ci * 1.9 + timeSec * 0.01) - 0.5) * 8);
    const dz = Math.round((hash(ci * 2.7 + timeSec * 0.01) - 0.5) * 8);
    const respawnGx = playerGx + dx;
    const respawnGz = playerGz + dz;

    c.axis = hash(ci * 2.1) > 0.5 ? "ns" : "ew";
    c.line = c.axis === "ns" ? respawnGx : respawnGz;
    c.t = c.axis === "ns"
      ? gridLineZ(respawnGz) + (hash(ci + 0.5) - 0.5) * BLOCK * 0.8
      : gridLineX(respawnGx) + (hash(ci + 0.7) - 0.5) * BLOCK * 0.8;
    c.dir = hash(ci * 5.3) > 0.5 ? 1 : -1;
    c.lane = c.dir > 0 ? 1 : -1;
    const d = densityAt(respawnGx, respawnGz);
    c.speed = c.targetSpeed = 6 + hash(ci * 1.7) * 14 * (0.5 + d * 0.5);
    c.turning = false;
    placeCar(c);
  };

  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const seed = hash(i * 3.1 + 0.1);
    const grp = makeCar(CAR_COLORS[i % CAR_COLORS.length]);
    scene.add(grp);
    const c: TrafficCar = {
      group: grp, axis: "ns", line: 0, t: 0, lane: 1, dir: 1,
      speed: 10, targetSpeed: 10,
      turning: false, turnProgress: 0,
      turnFromAxis: "ns", turnFromLine: 0, turnFromT: 0,
      turnToAxis: "ns", turnToLine: 0, turnDir: 1,
      seed,
    };
    spawnNear(c, i, 0, 0, 0);
    cars.push(c);
  }

  const update: TrafficSystem["update"] = (px, pz, timeSec, dt) => {
    const playerGx = gridCoord(px);
    const playerGz = gridCoord(pz);
    const VIEW_CELLS = 7;

    for (let ci = 0; ci < cars.length; ci++) {
      const c = cars[ci];
      const pos = positionOnLane(c.axis, c.line, c.t, c.lane, c.dir);
      const carGx = gridCoord(pos.x);
      const carGz = gridCoord(pos.z);
      const distToPlayer = Math.hypot(pos.x - px, pos.z - pz);

      if (Math.abs(carGx - playerGx) > VIEW_CELLS || Math.abs(carGz - playerGz) > VIEW_CELLS) {
        spawnNear(c, ci, px, pz, timeSec);
        continue;
      }

      if (distToPlayer > 280) {
        c.group.visible = false;
        continue;
      }

      c.group.visible = true;
      c.targetSpeed = (8 + hash(c.seed) * 10) * (0.6 + densityAt(carGx, carGz) * 0.4);
      if (distToPlayer < 18) {
        c.targetSpeed *= 0.4 + (distToPlayer / 18) * 0.6;
      }

      if (c.turning) {
        c.turnProgress += c.speed / (BLOCK * 0.55) * dt;
        if (c.turnProgress >= 1) {
          c.turning = false;
          c.axis = c.turnToAxis;
          c.line = c.turnToLine;
          c.dir = c.turnDir;
          c.lane = c.dir > 0 ? 1 : -1;
        }
        const p0 = positionOnLane(c.turnFromAxis, c.turnFromLine, c.turnFromT, c.lane, c.dir);
        const p1 = positionOnLane(c.turnToAxis, c.turnToLine, c.t, c.lane, c.turnDir);
        const tp = Math.min(1, c.turnProgress);
        const bx = p0.x + (p1.x - p0.x) * tp;
        const bz = p0.z + (p1.z - p0.z) * tp;
        const bh = p0.heading + ((p1.heading - p0.heading + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * tp;
        c.group.position.set(bx, trafficCarY(bx, bz), bz);
        c.group.rotation.y = bh;
        continue;
      }

      const ahead = distToJunctionAhead(c.axis, pos.x, pos.z, c.dir);
      const canGo = axisMayProceed(c.axis, ahead.jx, ahead.jz, timeSec);
      const stopDist = 10 + c.speed * 0.5;

      if (!canGo && ahead.dist < stopDist) {
        c.speed = Math.max(0, c.speed - 18 * dt);
      } else {
        c.speed += (c.targetSpeed - c.speed) * dt * 2;
      }

      c.t += c.speed * dt * c.dir;

      if (ahead.dist < 4 && canGo) {
        const jxWorld = gridLineX(ahead.jx);
        const jzWorld = gridLineZ(ahead.jz);
        const jDist = c.axis === "ns"
          ? Math.abs(c.t - jzWorld)
          : Math.abs(c.t - jxWorld);

        if (jDist < 4 && hash(c.seed + Math.floor(timeSec / 6) + ci) > 0.42) {
          const turnSide = hash(c.seed + ci) > 0.62 ? 1 : -1;
          const newAxis: RoadAxis = c.axis === "ns" ? "ew" : "ns";
          const newLine = c.axis === "ns" ? ahead.jx : ahead.jz;
          const newDir = turnSide > 0 ? 1 : -1;

          if (axisMayProceed(newAxis, ahead.jx, ahead.jz, timeSec)) {
            c.turnFromAxis = c.axis;
            c.turnFromLine = c.line;
            c.turnFromT = c.t;
            c.turnToAxis = newAxis;
            c.turnToLine = newLine;
            c.turnDir = newDir;
            c.turning = true;
            c.turnProgress = 0;
            c.t = newAxis === "ns"
              ? jzWorld + newDir * 4
              : jxWorld + newDir * 4;
            continue;
          }
        }
      }

      placeCar(c);
    }
  };

  const getPositions = () =>
    cars.filter((c) => c.group.visible).map((c) => ({
      x: c.group.position.x,
      z: c.group.position.z,
      speed: c.speed,
    }));

  const getObstacles = (): Obstacle[] =>
    cars
      .filter((c) => c.group.visible)
      .map((c) => ({
        x: c.group.position.x,
        z: c.group.position.z,
        r: TRAFFIC_COLLISION_RADIUS,
      }));

  const dispose = () => {
    for (const c of cars) {
      scene.remove(c.group);
      c.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    cars.length = 0;
  };

  return { update, getPositions, getObstacles, dispose };
};
