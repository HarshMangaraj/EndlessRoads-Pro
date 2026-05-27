import * as THREE from "three";
import { terrainHeight } from "./terrain";
import { gridCoord, gridLineX, gridLineZ, ROAD_HALF, trafficLightState } from "./roadNetwork";

const JUNCTION_COUNT = 64;

export interface IntersectionSystem {
  update: (px: number, pz: number, timeSec: number) => void;
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

  const housingGeo = new THREE.BoxGeometry(0.35, 0.9, 0.25);
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.5, roughness: 0.5 });
  const housings = new THREE.InstancedMesh(housingGeo, housingMat, JUNCTION_COUNT);
  group.add(housings);

  const lensGeo = new THREE.BoxGeometry(0.22, 0.22, 0.08);

  const redMat = new THREE.MeshStandardMaterial({
    color: 0x220000,
    emissive: new THREE.Color(0xff2200),
    emissiveIntensity: 2.8,
    toneMapped: false,
  });

  const yellowMat = new THREE.MeshStandardMaterial({
    color: 0x221800,
    emissive: new THREE.Color(0xffaa00),
    emissiveIntensity: 2.6,
    toneMapped: false,
  });

  const greenMat = new THREE.MeshStandardMaterial({
    color: 0x002200,
    emissive: new THREE.Color(0x22ff66),
    emissiveIntensity: 2.8,
    toneMapped: false,
  });

  // One instance per visible corner pole.
  const redLenses = new THREE.InstancedMesh(lensGeo, redMat, JUNCTION_COUNT);
  const yellowLenses = new THREE.InstancedMesh(lensGeo, yellowMat, JUNCTION_COUNT);
  const greenLenses = new THREE.InstancedMesh(lensGeo, greenMat, JUNCTION_COUNT);
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

  const update = (px: number, pz: number, timeSec: number) => {
    const gx0 = gridCoord(px) - 2;
    const gx1 = gridCoord(px) + 2;
    const gz0 = gridCoord(pz) - 2;
    const gz1 = gridCoord(pz) + 2;

    let ji = 0; // corner index
    let si = 0; // stop line index

    for (let gx = gx0; gx <= gx1 && ji < JUNCTION_COUNT; gx++) {
      for (let gz = gz0; gz <= gz1 && ji < JUNCTION_COUNT; gz++) {
        const cx = gridLineX(gx);
        const cz = gridLineZ(gz);
        const gy = Math.max(0, terrainHeight(cx, cz));
        const tl = trafficLightState(gx, gz, timeSec);

        const off = ROAD_HALF + 2.2;

        // Assign which axis the light controls by quadrant:
        // NE/SW => ns, NW/SE => ew
        const corners: Array<[number, number, number, "ns" | "ew"]> = [
          [cx + off, cz + off, Math.PI / 4, "ns"],
          [cx - off, cz + off, (3 * Math.PI) / 4, "ew"],
          [cx - off, cz - off, (-3 * Math.PI) / 4, "ns"],
          [cx + off, cz - off, -Math.PI / 4, "ew"],
        ];

        for (const [lx, lz, rot, axis] of corners) {
          if (ji >= JUNCTION_COUNT) break;

          // Pole + housing
          dummy.position.set(lx, gy, lz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          poles.setMatrixAt(ji, dummy.matrix);

          dummy.position.set(lx, gy + 4.2, lz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          housings.setMatrixAt(ji, dummy.matrix);

          const isGreen = axis === "ns" ? tl.nsGreen : tl.ewGreen;
          const isRed = tl.allRed || !isGreen;
          const isYellow = tl.allRed;

          // Lens placement (slightly towards that quadrant)
          dummy.position.set(lx + Math.sin(rot) * 0.2, gy + 4.35, lz + Math.cos(rot) * 0.2);
          dummy.rotation.set(0, rot, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();

          greenLenses.setMatrixAt(ji, isGreen ? dummy.matrix : hidden.matrix);
          redLenses.setMatrixAt(ji, isRed ? dummy.matrix : hidden.matrix);
          yellowLenses.setMatrixAt(ji, isYellow ? dummy.matrix : hidden.matrix);

          ji++;
        }

        // Stop lines (4 around junction)
        const stopOffsets: Array<[number, number, number]> = [
          [cx, cz + ROAD_HALF * 0.55, 0],
          [cx, cz - ROAD_HALF * 0.55, Math.PI],
          [cx + ROAD_HALF * 0.55, cz, Math.PI / 2],
          [cx - ROAD_HALF * 0.55, cz, -Math.PI / 2],
        ];

        for (const [sx, sz, sr] of stopOffsets) {
          if (si >= JUNCTION_COUNT * 4) break;
          // Raise slightly above road lift
          dummy.position.set(sx, gy + 0.28, sz);
          dummy.rotation.set(0, sr, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          stopLines.setMatrixAt(si++, dummy.matrix);
        }
      }
    }

    // Hide remainder
    for (let i = ji; i < JUNCTION_COUNT; i++) {
      poles.setMatrixAt(i, hidden.matrix);
      housings.setMatrixAt(i, hidden.matrix);
      redLenses.setMatrixAt(i, hidden.matrix);
      yellowLenses.setMatrixAt(i, hidden.matrix);
      greenLenses.setMatrixAt(i, hidden.matrix);
    }
    for (let i = si; i < JUNCTION_COUNT * 4; i++) {
      stopLines.setMatrixAt(i, hidden.matrix);
    }

    poles.count = ji;
    housings.count = ji;
    redLenses.count = ji;
    yellowLenses.count = ji;
    greenLenses.count = ji;
    stopLines.count = si;

    poles.instanceMatrix.needsUpdate = true;
    housings.instanceMatrix.needsUpdate = true;
    redLenses.instanceMatrix.needsUpdate = true;
    yellowLenses.instanceMatrix.needsUpdate = true;
    greenLenses.instanceMatrix.needsUpdate = true;
    stopLines.instanceMatrix.needsUpdate = true;
  };

  const dispose = () => {
    poleGeo.dispose();
    poleMat.dispose();
    housingGeo.dispose();
    housingMat.dispose();
    lensGeo.dispose();
    redMat.dispose();
    yellowMat.dispose();
    greenMat.dispose();
    stopLineGeo.dispose();
    stopMat.dispose();
    poles.dispose();
    housings.dispose();
    redLenses.dispose();
    yellowLenses.dispose();
    greenLenses.dispose();
    stopLines.dispose();
    scene.remove(group);
  };

  return { update, dispose };
};
