import * as THREE from "three";
import { hash } from "./noise";
import { terrainHeight } from "./terrain";

/**
 * AI traffic cars driving on the opposite shoulder. They follow the road
 * spline ahead of the player and recycle once they pass behind.
 */
export const TRAFFIC_COUNT = 14;

interface TrafficCar {
  group: THREE.Group;
  s: number;
  speed: number;
  side: number; // -1 or +1
  color: THREE.Color;
}

const CAR_COLORS = [0xc23b22, 0x2563eb, 0x16a34a, 0xeab308, 0xf97316, 0x111827, 0xe5e7eb, 0x7c3aed];

const makeCar = (color: number): THREE.Group => {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.32 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101820, metalness: 0.6, roughness: 0.1, transparent: true, opacity: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.95 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x3a0000, emissive: new THREE.Color(0xcc1111), emissiveIntensity: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff5cc, emissive: new THREE.Color(0xffeeaa), emissiveIntensity: 1.2 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 4.0), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.55, 2.0), bodyMat);
  cab.position.set(0, 1.05, -0.1); cab.castShadow = true; g.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.4, 1.85), glassMat);
  glass.position.set(0, 1.07, -0.1); g.add(glass);

  ([[0.78, 0.35, 1.3], [-0.78, 0.35, 1.3], [0.78, 0.35, -1.25], [-0.78, 0.35, -1.25]] as const).forEach(([x, y, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 14), wheelMat);
    w.position.set(x, y, z); w.rotation.z = Math.PI / 2; w.castShadow = true;
    g.add(w);
  });

  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.05), tailMat);
  tail.position.set(0, 0.7, -2.0); g.add(tail);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.05), headMat);
  head.position.set(0, 0.7, 2.0); g.add(head);

  return g;
};

export interface TrafficSystem {
  cars: TrafficCar[];
  update: (
    carS: number,
    samplePath: (s: number) => { x: number; z: number; h: number },
    dt: number,
  ) => void;
}

export const createTraffic = (scene: THREE.Scene): TrafficSystem => {
  const cars: TrafficCar[] = [];
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    const color = CAR_COLORS[i % CAR_COLORS.length];
    const grp = makeCar(color);
    scene.add(grp);
    cars.push({
      group: grp,
      s: 60 + i * 80 + hash(i * 13.4) * 40,
      speed: 8 + hash(i * 7.7) * 9,
      side: i % 2 === 0 ? -1 : 1,
      color: new THREE.Color(color),
    });
  }

  const update: TrafficSystem["update"] = (carS, samplePath, dt) => {
    for (const c of cars) {
      c.s += c.speed * dt * c.side;
      // recycle when too far
      if (c.side > 0 && c.s > carS + 380) c.s = carS - 80 - Math.random() * 40;
      if (c.side > 0 && c.s < carS - 120) c.s = carS + 220 + Math.random() * 80;
      if (c.side < 0 && c.s < carS - 220) c.s = carS + 320 + Math.random() * 60;
      if (c.side < 0 && c.s > carS + 380) c.s = carS - 100 - Math.random() * 40;

      const p = samplePath(Math.max(0, c.s));
      const nx = Math.cos(p.h);
      const nz = -Math.sin(p.h);
      const lane = 1.6 * c.side;
      const wx = p.x + nx * lane;
      const wz = p.z + nz * lane;
      const gy = Math.max(0, terrainHeight(wx, wz));
      c.group.position.set(wx, gy + 0.05, wz);
      c.group.rotation.y = p.h + (c.side < 0 ? Math.PI : 0);
    }
  };

  return { cars, update };
};
