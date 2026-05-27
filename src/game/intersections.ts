import * as THREE from "three";
import type { Obstacle } from "./collisions";
import {
  gridCoord,
  gridLineX,
  gridLineZ,
  ROAD_HALF,
  roadSurfaceY,
  trafficLightState,
} from "./roadNetwork";

const JUNCTION_COUNT = 64;

const BRIGHT = new THREE.Color();
const DIM = new THREE.Color();

export interface IntersectionSystem {
  update: (px: number, pz: number, timeSec: number) => void;
  getObstacles: () => Obstacle[];
  dispose: () => void;
}

export const createIntersections = (scene: THREE.Scene): IntersectionSystem => {
  const group = new THREE.Group();
  scene.add(group);

  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.7, roughness: 0.35 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, JUNCTION_COUNT);
  poles.castShadow = true;
  group.add(poles);

  const housingGeo = new THREE.BoxGeometry(0.42, 1.05, 0.28);
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x141418, metalness: 0.55, roughness: 0.45 });
  const housings = new THREE.InstancedMesh(housingGeo, housingMat, JUNCTION_COUNT);
  group.add(housings);

  const visorGeo = new THREE.BoxGeometry(0.48, 0.12, 0.32);
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.4, roughness: 0.6 });
  const visors = new THREE.InstancedMesh(visorGeo, visorMat, JUNCTION_COUNT);
  group.add(visors);

  const lensGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12);
  lensGeo.rotateX(Math.PI / 2);

  const redMat = new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true });
  const yellowMat = new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true });
  const greenMat = new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true });

  const redLenses = new THREE.InstancedMesh(lensGeo, redMat, JUNCTION_COUNT);
  const yellowLenses = new THREE.InstancedMesh(lensGeo, yellowMat, JUNCTION_COUNT);
  const greenLenses = new THREE.InstancedMesh(lensGeo, greenMat, JUNCTION_COUNT);
  redLenses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(JUNCTION_COUNT * 3), 3);
  yellowLenses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(JUNCTION_COUNT * 3), 3);
  greenLenses.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(JUNCTION_COUNT * 3), 3);
  group.add(redLenses, yellowLenses, greenLenses);

  const stopLineGeo = new THREE.PlaneGeometry(ROAD_HALF * 1.6, 0.35);
  stopLineGeo.rotateX(-Math.PI / 2);
  const stopMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.9,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.06,
  });
  const stopLines = new THREE.InstancedMesh(stopLineGeo, stopMat, JUNCTION_COUNT * 4);
  group.add(stopLines);

  const dummy = new THREE.Object3D();
  const hidden = new THREE.Object3D();
  hidden.scale.set(0, 0, 0);
  hidden.updateMatrix();

  const obstacles: Obstacle[] = [];

  const setLensColor = (
    mesh: THREE.InstancedMesh,
    idx: number,
    bright: number,
    dim: number,
    on: boolean,
  ) => {
    BRIGHT.setHex(bright);
    DIM.setHex(dim);
    mesh.setColorAt(idx, on ? BRIGHT : DIM);
  };

  const update = (px: number, pz: number, timeSec: number) => {
    const gx0 = gridCoord(px) - 2;
    const gx1 = gridCoord(px) + 2;
    const gz0 = gridCoord(pz) - 2;
    const gz1 = gridCoord(pz) + 2;

    let ji = 0;
    let si = 0;
    obstacles.length = 0;

    for (let gx = gx0; gx <= gx1 && ji < JUNCTION_COUNT; gx++) {
      for (let gz = gz0; gz <= gz1 && ji < JUNCTION_COUNT; gz++) {
        const cx = gridLineX(gx);
        const cz = gridLineZ(gz);
        const gy = roadSurfaceY(cx, cz) - 0.38;
        const tl = trafficLightState(gx, gz, timeSec);

        const off = ROAD_HALF + 2.2;

        const corners: Array<[number, number, number, "ns" | "ew"]> = [
          [cx + off, cz + off, Math.PI / 4, "ns"],
          [cx - off, cz + off, (3 * Math.PI) / 4, "ew"],
          [cx - off, cz - off, (-3 * Math.PI) / 4, "ns"],
          [cx + off, cz - off, -Math.PI / 4, "ew"],
        ];

        for (const [lx, lz, rot, axis] of corners) {
          if (ji >= JUNCTION_COUNT) break;

          obstacles.push({ x: lx, z: lz, r: 0.55 });

          dummy.position.set(lx, gy, lz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          poles.setMatrixAt(ji, dummy.matrix);

          const faceX = lx + Math.sin(rot) * 0.18;
          const faceZ = lz + Math.cos(rot) * 0.18;

          dummy.position.set(faceX, gy + 4.25, faceZ);
          dummy.rotation.set(0, rot, 0);
          dummy.updateMatrix();
          housings.setMatrixAt(ji, dummy.matrix);

          dummy.position.set(faceX, gy + 4.78, faceZ);
          dummy.rotation.set(0, rot, 0);
          dummy.updateMatrix();
          visors.setMatrixAt(ji, dummy.matrix);

          const yellowPhase = tl.allRed;
          const isGreen = !yellowPhase && (axis === "ns" ? tl.nsGreen : tl.ewGreen);
          const isRed = !yellowPhase && !isGreen;

          const lensY = [4.62, 4.38, 4.14];
          const lensMeshes = [redLenses, yellowLenses, greenLenses];
          for (let li = 0; li < 3; li++) {
            dummy.position.set(faceX, gy + lensY[li], faceZ);
            dummy.rotation.set(0, rot, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            lensMeshes[li].setMatrixAt(ji, dummy.matrix);
          }

          setLensColor(redLenses, ji, 0xff2200, 0x4a0808, isRed);
          setLensColor(yellowLenses, ji, 0xffcc00, 0x4a3800, yellowPhase);
          setLensColor(greenLenses, ji, 0x33ff77, 0x083a18, isGreen);

          ji++;
        }

        const stopOffsets: Array<[number, number, number]> = [
          [cx, cz + ROAD_HALF * 0.55, 0],
          [cx, cz - ROAD_HALF * 0.55, Math.PI],
          [cx + ROAD_HALF * 0.55, cz, Math.PI / 2],
          [cx - ROAD_HALF * 0.55, cz, -Math.PI / 2],
        ];

        for (const [sx, sz, sr] of stopOffsets) {
          if (si >= JUNCTION_COUNT * 4) break;
          dummy.position.set(sx, roadSurfaceY(sx, sz) + 0.03, sz);
          dummy.rotation.set(0, sr, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          stopLines.setMatrixAt(si++, dummy.matrix);
        }
      }
    }

    for (let i = ji; i < JUNCTION_COUNT; i++) {
      poles.setMatrixAt(i, hidden.matrix);
      housings.setMatrixAt(i, hidden.matrix);
      visors.setMatrixAt(i, hidden.matrix);
      redLenses.setMatrixAt(i, hidden.matrix);
      yellowLenses.setMatrixAt(i, hidden.matrix);
      greenLenses.setMatrixAt(i, hidden.matrix);
    }
    for (let i = si; i < JUNCTION_COUNT * 4; i++) {
      stopLines.setMatrixAt(i, hidden.matrix);
    }

    poles.count = ji;
    housings.count = ji;
    visors.count = ji;
    redLenses.count = ji;
    yellowLenses.count = ji;
    greenLenses.count = ji;
    stopLines.count = si;

    poles.instanceMatrix.needsUpdate = true;
    housings.instanceMatrix.needsUpdate = true;
    visors.instanceMatrix.needsUpdate = true;
    redLenses.instanceMatrix.needsUpdate = true;
    yellowLenses.instanceMatrix.needsUpdate = true;
    greenLenses.instanceMatrix.needsUpdate = true;
    if (redLenses.instanceColor) redLenses.instanceColor.needsUpdate = true;
    if (yellowLenses.instanceColor) yellowLenses.instanceColor.needsUpdate = true;
    if (greenLenses.instanceColor) greenLenses.instanceColor.needsUpdate = true;
    stopLines.instanceMatrix.needsUpdate = true;
  };

  const getObstacles = () => obstacles;

  const dispose = () => {
    poleGeo.dispose();
    poleMat.dispose();
    housingGeo.dispose();
    housingMat.dispose();
    visorGeo.dispose();
    visorMat.dispose();
    lensGeo.dispose();
    redMat.dispose();
    yellowMat.dispose();
    greenMat.dispose();
    stopLineGeo.dispose();
    stopMat.dispose();
    poles.dispose();
    housings.dispose();
    visors.dispose();
    redLenses.dispose();
    yellowLenses.dispose();
    greenLenses.dispose();
    stopLines.dispose();
    scene.remove(group);
  };

  return { update, getObstacles, dispose };
};
