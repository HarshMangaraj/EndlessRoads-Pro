import * as THREE from "three";
import { hash } from "./noise";
import {
  BLOCK,
  gridCoord,
  gridLineX,
  gridLineZ,
  roadSurfaceY,
  SIDEWALK_OFF,
} from "./roadNetwork";

const PARKED_COUNT = 40;
const PROP_COUNT = 48;

export interface WorldPropsSystem {
  update: (px: number, pz: number, nightFactor: number) => void;
  dispose: () => void;
}

export const createWorldProps = (scene: THREE.Scene): WorldPropsSystem => {
  const group = new THREE.Group();
  scene.add(group);

  const carBodyMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.75, metalness: 0.35 });
  const carColors = [0x1e3a5f, 0x7f1d1d, 0x14532d, 0x713f12, 0x374151, 0xc2410c, 0x4c1d95];
  const parkedCars: THREE.Mesh[] = [];

  for (let i = 0; i < PARKED_COUNT; i++) {
    const mat = carBodyMat.clone();
    mat.color.setHex(carColors[i % carColors.length]);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 3.6), mat);
    body.castShadow = true;
    group.add(body);
    parkedCars.push(body);
  }

  const benchMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9 });
  const binMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.85, metalness: 0.2 });
  const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6, metalness: 0.3 });
  const signMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.7 });
  const props: THREE.Mesh[] = [];
  const propTypes = [
    () => new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.5), benchMat),
    () => new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), binMat),
    () => new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.75, 10), hydrantMat),
    () => new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.5), signMat),
  ];
  for (let i = 0; i < PROP_COUNT; i++) {
    const m = propTypes[i % propTypes.length]();
    m.castShadow = true;
    group.add(m);
    props.push(m);
  }

  let lastGx = 99999;
  let lastGz = 99999;

  const update = (px: number, pz: number, _nightFactor: number) => {
    const gx = gridCoord(px);
    const gz = gridCoord(pz);
    if (gx === lastGx && gz === lastGz) return;
    lastGx = gx;
    lastGz = gz;

    let ci = 0;
    let pi = 0;
    const gx0 = gx - 2;
    const gx1 = gx + 2;
    const gz0 = gz - 2;
    const gz1 = gz + 2;

    for (let gxi = gx0; gxi <= gx1; gxi++) {
      for (let gzi = gz0; gzi <= gz1; gzi++) {
        const cx = gridLineX(gxi);
        const cz = gridLineZ(gzi);
        const slots: Array<[number, number, number]> = [
          [cx + SIDEWALK_OFF + 1.1, cz + BLOCK * 0.2, 0],
          [cx - SIDEWALK_OFF - 1.1, cz - BLOCK * 0.15, Math.PI],
          [cx + BLOCK * 0.12, cz + SIDEWALK_OFF + 1, Math.PI / 2],
          [cx - BLOCK * 0.15, cz - SIDEWALK_OFF - 1, -Math.PI / 2],
        ];

        for (let si = 0; si < slots.length && ci < PARKED_COUNT; si++) {
          const seed = hash(gxi * 17.1 + gzi * 23.7 + si * 3.3);
          if (seed < 0.18) continue;
          const [bx, bz, rot] = slots[si];
          const jx = bx + (hash(seed + 0.1) - 0.5) * 5;
          const jz = bz + (hash(seed + 0.2) - 0.5) * 5;
          const car = parkedCars[ci++];
          car.position.set(jx, roadSurfaceY(jx, jz) + 0.42, jz);
          car.rotation.y = rot;
          car.visible = true;
        }

        for (let k = 0; k < 3 && pi < PROP_COUNT; k++) {
          const seed = hash(gxi * 9.3 + gzi * 13.1 + k);
          const side = seed > 0.5 ? 1 : -1;
          const wx = cx + side * (SIDEWALK_OFF + 0.5);
          const wz = cz + (hash(seed + 0.4) - 0.5) * BLOCK * 0.65;
          const prop = props[pi++];
          prop.position.set(wx, roadSurfaceY(wx, wz) + 0.15, wz);
          prop.rotation.y = hash(seed + 0.5) * Math.PI * 2;
          prop.visible = true;
        }
      }
    }

    for (let i = ci; i < PARKED_COUNT; i++) parkedCars[i].visible = false;
    for (let i = pi; i < PROP_COUNT; i++) props[i].visible = false;
  };

  const dispose = () => {
    carBodyMat.dispose();
    benchMat.dispose();
    binMat.dispose();
    hydrantMat.dispose();
    signMat.dispose();
    parkedCars.forEach((m) => {
      (m.material as THREE.Material).dispose();
      m.geometry.dispose();
    });
    props.forEach((m) => m.geometry.dispose());
    scene.remove(group);
  };

  return { update, dispose };
};
