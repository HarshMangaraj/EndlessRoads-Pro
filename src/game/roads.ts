import * as THREE from "three";
import { terrainHeight } from "./terrain";
import { BLOCK, ROAD_HALF, SIDEWALK_OFF, gridCoord, gridLineX, gridLineZ } from "./roadNetwork";
import { getActiveMap } from "./maps";

const SEG = 12;
// Raise road geometry clearly above terrain to prevent z-fighting
const ROAD_Y_LIFT     = 0.22;
const SHOULDER_Y_LIFT = 0.12;

export interface RoadRenderer {
  update: (px: number, pz: number, nightFactor: number) => void;
  dispose: () => void;
}

export const createRoadRenderer = (scene: THREE.Scene): RoadRenderer => {
  const map = getActiveMap();
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x242428,
    roughness: 0.88,
    metalness: 0.06,
    emissive: new THREE.Color(0x0a0a0c),
    emissiveIntensity: 0.22,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0x1e2228,
    roughness: 0.92,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.12,
    roughness: 0.75,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const crossMat = new THREE.MeshStandardMaterial({
    color: 0x242428,
    roughness: 0.85,
    metalness: 0.08,
    emissive: new THREE.Color(0x0a0a0c),
    emissiveIntensity: 0.22,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const zebraMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.12,
    roughness: 0.82,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -5,
  });

  const roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
  const shoulderMesh = new THREE.Mesh(new THREE.BufferGeometry(), shoulderMat);
  const markMesh = new THREE.Mesh(new THREE.BufferGeometry(), markMat);
  const crossMesh = new THREE.Mesh(new THREE.BufferGeometry(), crossMat);
  const zebraMesh = new THREE.Mesh(new THREE.BufferGeometry(), zebraMat);
  scene.add(shoulderMesh, roadMesh, markMesh, crossMesh, zebraMesh);

  const buildStrip = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    roadVerts: number[],
    shoulderVerts: number[],
    markVerts: number[],
  ) => {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(2, Math.ceil(len / SEG));
    const dx = (bx - ax) / steps;
    const dz = (bz - az) / steps;
    const px = -(bz - az) / len;
    const pz = (bx - ax) / len;

    for (let i = 0; i < steps; i++) {
      const x0 = ax + dx * i;
      const z0 = az + dz * i;
      const x1 = ax + dx * (i + 1);
      const z1 = az + dz * (i + 1);
      const ty0 = Math.max(0, terrainHeight(x0, z0));
      const ty1 = Math.max(0, terrainHeight(x1, z1));
      const y0r = ty0 + ROAD_Y_LIFT;
      const y1r = ty1 + ROAD_Y_LIFT;
      const y0s = ty0 + SHOULDER_Y_LIFT;
      const y1s = ty1 + SHOULDER_Y_LIFT;
      const sw = ROAD_HALF + 3.2;

      const pushQuad = (
        arr: number[],
        lx0: number,
        lz0: number,
        lx1: number,
        lz1: number,
        rx0: number,
        rz0: number,
        rx1: number,
        rz1: number,
        yA: number,
        yB: number,
      ) => {
        arr.push(lx0, yA, lz0, rx0, yA, rz0, lx1, yB, lz1);
        arr.push(lx1, yB, lz1, rx1, yB, rz1, rx0, yA, rz0);
      };

      pushQuad(
        roadVerts,
        x0 + px * ROAD_HALF, z0 + pz * ROAD_HALF,
        x1 + px * ROAD_HALF, z1 + pz * ROAD_HALF,
        x0 - px * ROAD_HALF, z0 - pz * ROAD_HALF,
        x1 - px * ROAD_HALF, z1 - pz * ROAD_HALF,
        y0r, y1r,
      );
      pushQuad(
        shoulderVerts,
        x0 + px * sw, z0 + pz * sw,
        x1 + px * sw, z1 + pz * sw,
        x0 + px * ROAD_HALF, z0 + pz * ROAD_HALF,
        x1 + px * ROAD_HALF, z1 + pz * ROAD_HALF,
        y0s, y1s,
      );
      pushQuad(
        shoulderVerts,
        x0 - px * ROAD_HALF, z0 - pz * ROAD_HALF,
        x1 - px * ROAD_HALF, z1 - pz * ROAD_HALF,
        x0 - px * sw, z0 - pz * sw,
        x1 - px * sw, z1 - pz * sw,
        y0s, y1s,
      );

      if (i % 3 === 0) {
        const mx = (x0 + x1) * 0.5;
        const mz = (z0 + z1) * 0.5;
        const my = (y0r + y1r) * 0.5 + 0.04;
        const mw = 0.18;
        pushQuad(
          markVerts,
          mx + px * mw, mz + pz * mw,
          mx + px * mw, mz + pz * mw,
          mx - px * mw, mz - pz * mw,
          mx - px * mw, mz - pz * mw,
          my, my,
        );
      }
    }
  };

  const setGeo = (mesh: THREE.Mesh, verts: number[]) => {
    if (verts.length < 9) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = geo;
  };

  const update = (px: number, pz: number, nightFactor: number) => {
    const roadVerts: number[] = [];
    const shoulderVerts: number[] = [];
    const markVerts: number[] = [];
    const crossVerts: number[] = [];
    const zebraVerts: number[] = [];

    const nf = Math.max(0, Math.min(1, nightFactor));
    // Keep asphalt readable at night (scene ambient is intentionally very dim)
    roadMat.emissiveIntensity = 0.22 + nf * 0.26;
    crossMat.emissiveIntensity = 0.18 + nf * 0.24;
    markMat.emissiveIntensity = 0.10 + nf * 0.30;
    zebraMat.emissiveIntensity = 0.14 + nf * 0.34;
    const roadHex = nf > 0.2 ? 0x2a2a2a : 0x242428;
    roadMat.color.setHex(roadHex);
    crossMat.color.setHex(roadHex);

    const gx0 = gridCoord(px) - 4;
    const gx1 = gridCoord(px) + 4;
    const gz0 = gridCoord(pz) - 4;
    const gz1 = gridCoord(pz) + 4;
    // IMPORTANT: snap strip start/end to the grid, otherwise roads “merge” into wedges
    const pad = BLOCK * 0.6;
    const zA = gridLineZ(gz0) - pad;
    const zB = gridLineZ(gz1) + pad;
    const xA = gridLineX(gx0) - pad;
    const xB = gridLineX(gx1) + pad;

    for (let gx = gx0; gx <= gx1; gx++) {
      const x = gridLineX(gx);
      buildStrip(x, zA, x, zB, roadVerts, shoulderVerts, markVerts);
    }
    for (let gz = gz0; gz <= gz1; gz++) {
      const z = gridLineZ(gz);
      buildStrip(xA, z, xB, z, roadVerts, shoulderVerts, markVerts);
    }

    // Intersection boxes + zebra crossings at every junction
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const cx = gridLineX(gx);
        const cz = gridLineZ(gz);
        const y = Math.max(0, terrainHeight(cx, cz)) + ROAD_Y_LIFT;
        const h = ROAD_HALF;

        // Fill intersection box
        crossVerts.push(
          cx - h, y, cz - h, cx + h, y, cz - h, cx + h, y, cz + h,
          cx + h, y, cz + h, cx - h, y, cz + h, cx - h, y, cz - h,
        );

        // Zebra crossings: 4 sides of each junction, set back slightly from corner
        const STRIPE_W = 0.6, STRIPE_GAP = 0.9;
        const ZEBRA_START = h + 0.3;
        const ZEBRA_END   = SIDEWALK_OFF - 0.3;
        const ZEBRA_ROAD_W = h;

        // North side (NS road north of junction)
        for (let s = ZEBRA_START; s < ZEBRA_END; s += STRIPE_W + STRIPE_GAP) {
          const z1 = cz + s;
          const z2 = cz + s + STRIPE_W;
          const yy = Math.max(0, terrainHeight(cx, (z1 + z2) * 0.5)) + ROAD_Y_LIFT + 0.06;
          zebraVerts.push(
            cx - ZEBRA_ROAD_W, yy, z1, cx + ZEBRA_ROAD_W, yy, z1, cx + ZEBRA_ROAD_W, yy, z2,
            cx + ZEBRA_ROAD_W, yy, z2, cx - ZEBRA_ROAD_W, yy, z2, cx - ZEBRA_ROAD_W, yy, z1,
          );
        }
        // South side
        for (let s = ZEBRA_START; s < ZEBRA_END; s += STRIPE_W + STRIPE_GAP) {
          const z1 = cz - s;
          const z2 = cz - s - STRIPE_W;
          const yy = Math.max(0, terrainHeight(cx, (z1 + z2) * 0.5)) + ROAD_Y_LIFT + 0.06;
          zebraVerts.push(
            cx - ZEBRA_ROAD_W, yy, z1, cx + ZEBRA_ROAD_W, yy, z1, cx + ZEBRA_ROAD_W, yy, z2,
            cx + ZEBRA_ROAD_W, yy, z2, cx - ZEBRA_ROAD_W, yy, z2, cx - ZEBRA_ROAD_W, yy, z1,
          );
        }
        // East side (EW road)
        for (let s = ZEBRA_START; s < ZEBRA_END; s += STRIPE_W + STRIPE_GAP) {
          const x1 = cx + s;
          const x2 = cx + s + STRIPE_W;
          const yy = Math.max(0, terrainHeight((x1 + x2) * 0.5, cz)) + ROAD_Y_LIFT + 0.06;
          zebraVerts.push(
            x1, yy, cz - ZEBRA_ROAD_W, x1, yy, cz + ZEBRA_ROAD_W, x2, yy, cz + ZEBRA_ROAD_W,
            x2, yy, cz + ZEBRA_ROAD_W, x2, yy, cz - ZEBRA_ROAD_W, x1, yy, cz - ZEBRA_ROAD_W,
          );
        }
        // West side
        for (let s = ZEBRA_START; s < ZEBRA_END; s += STRIPE_W + STRIPE_GAP) {
          const x1 = cx - s;
          const x2 = cx - s - STRIPE_W;
          const yy = Math.max(0, terrainHeight((x1 + x2) * 0.5, cz)) + ROAD_Y_LIFT + 0.06;
          zebraVerts.push(
            x1, yy, cz - ZEBRA_ROAD_W, x1, yy, cz + ZEBRA_ROAD_W, x2, yy, cz + ZEBRA_ROAD_W,
            x2, yy, cz + ZEBRA_ROAD_W, x2, yy, cz - ZEBRA_ROAD_W, x1, yy, cz - ZEBRA_ROAD_W,
          );
        }
      }
    }

    setGeo(roadMesh, roadVerts);
    setGeo(shoulderMesh, shoulderVerts);
    setGeo(markMesh, markVerts);
    setGeo(crossMesh, crossVerts);
    setGeo(zebraMesh, zebraVerts);
  };

  const dispose = () => {
    roadMesh.geometry.dispose();
    shoulderMesh.geometry.dispose();
    markMesh.geometry.dispose();
    crossMesh.geometry.dispose();
    zebraMesh.geometry.dispose();
    roadMat.dispose();
    shoulderMat.dispose();
    markMat.dispose();
    crossMat.dispose();
    zebraMat.dispose();
    scene.remove(roadMesh, shoulderMesh, markMesh, crossMesh, zebraMesh);
  };

  return { update, dispose };
};
