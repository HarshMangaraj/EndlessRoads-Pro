import * as THREE from "three";
import { hash } from "./noise";
import { terrainHeight } from "./terrain";
import {
  BLOCK,
  LANE_OFF,
  RoadAxis,
  axisMayProceed,
  densityAt,
  distToJunctionAhead,
  gridCoord,
  gridLineX,
  gridLineZ,
  positionOnLane,
  trafficLightState,
} from "./roadNetwork";

export const TRAFFIC_COUNT = 32;

interface TrafficCar {
  group: THREE.Group;
  axis: RoadAxis;
  line: number;
  t: number;
  lane: -1 | 1;
  dir: 1 | -1;
  speed: number;
  targetSpeed: number;
  // turn state
  turning: boolean;
  turnProgress: number;  // 0‥1 through the intersection
  turnFromAxis: RoadAxis;
  turnFromLine: number;
  turnFromT: number;
  turnToAxis: RoadAxis;
  turnToLine: number;
  turnDir: 1 | -1;   // +1 = right turn, -1 = left turn
  seed: number;
}

const CAR_COLORS = [0xc23b22, 0x2563eb, 0x16a34a, 0xeab308, 0xf97316, 0x111827, 0xe5e7eb, 0x7c3aed,
                    0xdc2626, 0x0ea5e9, 0xd97706, 0x4ade80, 0xfbbf24, 0x94a3b8, 0x8b5cf6, 0xf43f5e];

const makeCar = (color: number): THREE.Group => {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.32 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x101820, metalness: 0.6, roughness: 0.1, transparent: true, opacity: 0.7,
  });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x3a0000, emissive: new THREE.Color(0xcc1111), emissiveIntensity: 0.9,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff5cc, emissive: new THREE.Color(0xffeeaa), emissiveIntensity: 1.2,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 4.0), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 2.0), bodyMat);
  cab.position.set(0, 1.05, -0.1); cab.castShadow = true; g.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.4, 1.85), glassMat);
  glass.position.set(0, 1.07, -0.1); g.add(glass);

  ([[0.78, 0.35, 1.3], [-0.78, 0.35, 1.3], [0.78, 0.35, -1.25], [-0.78, 0.35, -1.25]] as const).forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14), wheelMat);
    w.position.set(x, y, z); w.rotation.z = Math.PI / 2; w.castShadow = true; g.add(w);
  });

  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.05), tailMat);
  tail.position.set(0, 0.7, -2.0); g.add(tail);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.05), headMat);
  head.position.set(0, 0.7, 2.0); g.add(head);

  return g;
};

export interface TrafficSystem {
  update: (px: number, pz: number, timeSec: number, dt: number) => void;
  getPositions: () => { x: number; z: number; speed: number }[];
}

export const createTraffic = (scene: THREE.Scene): TrafficSystem => {
  const cars: TrafficCar[] = [];

  const makeCar_ = (i: number, px: number, pz: number): TrafficCar => {
    const seed = hash(i * 3.1 + 0.1);
    const color = CAR_COLORS[i % CAR_COLORS.length];
    const grp = makeCar(color);
    scene.add(grp);
    const axis: RoadAxis = hash(seed + 0.11) > 0.5 ? "ns" : "ew";
    const gxBase = gridCoord(px), gzBase = gridCoord(pz);
    const line = axis === "ns"
      ? gxBase + Math.round((hash(seed + 0.22) - 0.5) * 6)
      : gzBase + Math.round((hash(seed + 0.33) - 0.5) * 6);
    const dir: 1 | -1 = hash(seed + 0.44) > 0.5 ? 1 : -1;
    const lane: -1 | 1 = dir > 0 ? 1 : -1;
    const tBase = axis === "ns" ? pz : px;
    const t = tBase + (hash(seed + 0.55) - 0.5) * BLOCK * 4;
    const spd = 8 + hash(seed + 0.66) * 10;
    return {
      group: grp, axis, line, t, lane, dir,
      speed: spd, targetSpeed: spd,
      turning: false, turnProgress: 0,
      turnFromAxis: axis, turnFromLine: line, turnFromT: t,
      turnToAxis: axis, turnToLine: line, turnDir: 1,
      seed,
    };
  };

  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    cars.push(makeCar_(i, 0, 0));
  }

  const update: TrafficSystem["update"] = (px, pz, timeSec, dt) => {
    const playerGx = gridCoord(px);
    const playerGz = gridCoord(pz);
    const VIEW = 5; // grid cells

    for (let ci = 0; ci < cars.length; ci++) {
      const c = cars[ci];
      const carWorldX = c.axis === "ns" ? gridLineX(c.line) : c.t;
      const carWorldZ = c.axis === "ew" ? gridLineZ(c.line) : c.t;

      // Recycle far-away cars based on density zone
      const carGx = gridCoord(carWorldX);
      const carGz = gridCoord(carWorldZ);
      const outOfView = Math.abs(carGx - playerGx) > VIEW + 1 || Math.abs(carGz - playerGz) > VIEW + 1;
      if (outOfView) {
        // Respawn somewhere in view
        const dx = Math.round((hash(ci + timeSec * 0.001) - 0.5) * VIEW * 1.6);
        const dz = Math.round((hash(ci + timeSec * 0.002 + 0.5) - 0.5) * VIEW * 1.6);
        const respawnGx = playerGx + dx;
        const respawnGz = playerGz + dz;
        const d = densityAt(respawnGx, respawnGz);
        // Skip respawn in very sparse areas sometimes
        if (d < 0.25 && hash(ci * 7.1 + timeSec * 0.003) > d * 3) { c.group.visible = false; continue; }
        c.group.visible = true;
        c.axis = hash(ci * 2.1 + timeSec * 0.001) > 0.5 ? "ns" : "ew";
        c.line = c.axis === "ns" ? respawnGx : respawnGz;
        c.t    = c.axis === "ns"
          ? gridLineZ(respawnGz) + (hash(ci) - 0.5) * BLOCK
          : gridLineX(respawnGx) + (hash(ci) - 0.5) * BLOCK;
        c.dir  = hash(ci * 5.3 + timeSec * 0.001) > 0.5 ? 1 : -1;
        c.lane = c.dir > 0 ? 1 : -1;
        c.speed = c.targetSpeed;
        c.turning = false;
        continue;
      }

      if (c.turning) {
        // Interpolate through the turn arc
        c.turnProgress += c.speed / (BLOCK * 0.5) * dt;
        if (c.turnProgress >= 1) {
          c.turning = false;
          c.axis = c.turnToAxis;
          c.line = c.turnToLine;
          c.dir  = c.turnDir;
          c.lane = c.dir > 0 ? 1 : -1;
          // t is already updated to junction + a bit forward
        }
        // Blend position along arc during turn
        const p0 = positionOnLane(c.turnFromAxis, c.turnFromLine, c.turnFromT, c.lane);
        const p1 = positionOnLane(c.turnToAxis, c.turnToLine, c.t, c.lane);
        const tp = c.turnProgress;
        const bx = p0.x + (p1.x - p0.x) * tp;
        const bz = p0.z + (p1.z - p0.z) * tp;
        const bh = p0.heading + ((p1.heading - p0.heading + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * tp;
        const gy = Math.max(0, terrainHeight(bx, bz));
        c.group.position.set(bx, gy + 0.05, bz);
        c.group.rotation.y = bh;
        continue;
      }

      // Check upcoming junction
      const pos = positionOnLane(c.axis, c.line, c.t, c.lane);
      const ahead = distToJunctionAhead(c.axis, pos.x, pos.z, c.dir);
      const canGo = axisMayProceed(c.axis, ahead.jx, ahead.jz, timeSec);
      const stopDist = 12 + c.speed * 0.6;

      if (!canGo && ahead.dist < stopDist) {
        c.speed = Math.max(0, c.speed - 20 * dt);
      } else {
        c.speed += (c.targetSpeed - c.speed) * dt * 1.6;
      }

      // Advance t
      c.t += c.speed * dt * c.dir;

      // At junction: decide to turn?
      if (ahead.dist < 3 && canGo) {
        const jxWorld = gridLineX(ahead.jx);
        const jzWorld = gridLineZ(ahead.jz);
        const jDist = c.axis === "ns"
          ? Math.abs(c.t - jzWorld)
          : Math.abs(c.t - jxWorld);

        if (jDist < 3) {
          const turnRoll = hash(c.seed + Math.floor(timeSec / 8) + ci);
          if (turnRoll > 0.45) {
            // Decide turn direction: >0.7 = right, <0.45 = left, middle = straight
            const turnSide = turnRoll > 0.7 ? 1 : -1;
            const newAxis: RoadAxis = c.axis === "ns" ? "ew" : "ns";
            const newLine = c.axis === "ns" ? ahead.jx : ahead.jz;
            const newDir = (c.axis === "ns")
              ? (turnSide > 0 ? 1 : -1) as 1 | -1
              : (turnSide > 0 ? 1 : -1) as 1 | -1;

            // Verify light allows the new axis
            const newCanGo = axisMayProceed(newAxis, ahead.jx, ahead.jz, timeSec);
            if (newCanGo) {
              c.turnFromAxis = c.axis;
              c.turnFromLine = c.line;
              c.turnFromT    = c.t;
              c.turnToAxis   = newAxis;
              c.turnToLine   = newLine;
              c.turnDir      = newDir;
              c.turning      = true;
              c.turnProgress = 0;
              c.t = newAxis === "ns"
                ? jzWorld + newDir * 3
                : jxWorld + newDir * 3;
              continue;
            }
          }
        }
      }

      // Update visuals on straight road
      const p = positionOnLane(c.axis, c.line, c.t, c.lane);
      const gy = Math.max(0, terrainHeight(p.x, p.z));
      c.group.position.set(p.x, gy + 0.05, p.z);
      c.group.rotation.y = p.heading;
      c.group.visible = true;
    }
  };

  const getPositions = () =>
    cars.filter(c => c.group.visible).map(c => ({
      x: c.group.position.x,
      z: c.group.position.z,
      speed: c.speed,
    }));

  return { update, getPositions };
};
