import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const B = import.meta.env.BASE_URL;

export const MODEL_URLS = {
  lamppost: `${B}Lamppost/Lamppost N131219.obj`,
} as const;

export type QualityTier = "low" | "medium" | "high" | "ultra";

export interface PreparedModel {
  geometry: THREE.BufferGeometry;
  height: number;
}

export interface GameAssets {
  pine: PreparedModel;
  maple: PreparedModel;
  broadleaf: PreparedModel;
  lamppost: PreparedModel;
}

/** Cylinder vs icosahedron etc. must share indexed/non-indexed layout before merge. */
function toMergeable(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.computeVertexNormals();
  return g;
}

function finalizeGeometry(
  geo: THREE.BufferGeometry,
  targetHeight: number,
): PreparedModel {
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  geo.translate(-center.x, -box.min.y, -center.z);
  const scale = targetHeight / Math.max(size.y, 0.001);
  geo.scale(scale, scale, scale);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.computeVertexNormals();
  return { geometry: geo, height: geo.boundingBox?.max.y ?? targetHeight };
}

function mergeParts(parts: THREE.BufferGeometry[], targetHeight: number): PreparedModel {
  const normalized = parts.map((p) => {
    const g = toMergeable(p);
    p.dispose();
    return g;
  });
  const merged = mergeGeometries(normalized, false);
  normalized.forEach((p) => p.dispose());
  if (!merged) {
    // Fallback: single trunk so the game never hard-crashes
    const fallback = new THREE.CylinderGeometry(0.25, 0.35, targetHeight, 8);
    return finalizeGeometry(fallback, targetHeight);
  }
  return finalizeGeometry(merged, targetHeight);
}

/** Instant lightweight trees — no multi‑MB OBJ parse. */
export function createStarterAssets(): GameAssets {
  const addPart = (parts: THREE.BufferGeometry[], geo: THREE.BufferGeometry) => {
    parts.push(geo);
  };

  const pineParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.22, 2.4, 7);
  trunk.translate(0, 1.2, 0);
  addPart(pineParts, trunk);
  for (let i = 0; i < 4; i++) {
    const layer = new THREE.ConeGeometry(2.1 - i * 0.38, 2.2, 9);
    layer.translate(0, 2.6 + i * 1.55, 0);
    addPart(pineParts, layer);
  }

  const mapleParts: THREE.BufferGeometry[] = [];
  const mapleTrunk = new THREE.CylinderGeometry(0.2, 0.26, 2.8, 8);
  mapleTrunk.translate(0, 1.4, 0);
  addPart(mapleParts, mapleTrunk);
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.IcosahedronGeometry(1.35 - i * 0.15, 1);
    blob.scale(1.15, 0.75, 1.15);
    blob.translate(0, 3.4 + i * 1.35, 0);
    addPart(mapleParts, blob);
  }

  const broadParts: THREE.BufferGeometry[] = [];
  const broadTrunk = new THREE.CylinderGeometry(0.22, 0.3, 3.2, 8);
  broadTrunk.translate(0, 1.6, 0);
  addPart(broadParts, broadTrunk);
  const crown = new THREE.IcosahedronGeometry(2.4, 1);
  crown.scale(1.1, 0.85, 1.1);
  crown.translate(0, 4.8, 0);
  addPart(broadParts, crown);
  const crown2 = new THREE.IcosahedronGeometry(1.7, 1);
  crown2.translate(0.9, 5.4, 0.4);
  addPart(broadParts, crown2);
  const crown3 = new THREE.IcosahedronGeometry(1.5, 1);
  crown3.translate(-0.8, 5.1, -0.5);
  addPart(broadParts, crown3);

  const lampPole = new THREE.CylinderGeometry(0.09, 0.11, 4.8, 8);
  lampPole.translate(0, 2.4, 0);
  const lampArm = new THREE.BoxGeometry(0.08, 0.08, 0.7);
  lampArm.translate(0, 4.85, 0.25);
  const lampHead = new THREE.CylinderGeometry(0.22, 0.28, 0.35, 10);
  lampHead.rotateX(Math.PI / 2);
  lampHead.translate(0, 4.75, 0.55);

  return {
    pine: mergeParts(pineParts, 11),
    maple: mergeParts(mapleParts, 9),
    broadleaf: mergeParts(broadParts, 10),
    lamppost: mergeParts([lampPole, lampArm, lampHead], 5.8),
  };
}

function mergeObjMeshes(root: THREE.Object3D): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    parts.push(g);
  });
  if (!parts.length) return null;
  return mergeGeometries(parts, false);
}

/** Keep only every Nth triangle — fast, avoids SimplifyModifier hangs. */
function fastDecimate(geo: THREE.BufferGeometry, maxTris: number): THREE.BufferGeometry {
  const pos = geo.getAttribute("position");
  if (!pos) return geo;

  let index = geo.index;
  if (!index) {
    const g = geo.toNonIndexed();
    geo.dispose();
    return fastDecimate(g, maxTris);
  }

  const triCount = index.count / 3;
  if (triCount <= maxTris) {
    geo.computeVertexNormals();
    return geo;
  }

  const step = Math.ceil(triCount / maxTris);
  const arr = index.array as ArrayLike<number>;
  const kept: number[] = [];
  for (let t = 0; t < triCount; t += step) {
    const i = t * 3;
    kept.push(arr[i], arr[i + 1], arr[i + 2]);
  }
  const out = geo.clone();
  out.setIndex(kept);
  out.computeVertexNormals();
  geo.dispose();
  return out;
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

async function loadObjModelFast(
  objUrl: string,
  targetHeight: number,
  maxTris: number,
): Promise<PreparedModel | null> {
  try {
    const root = await new OBJLoader().loadAsync(objUrl);
    let geo = mergeObjMeshes(root);
    if (!geo) return null;
    geo = fastDecimate(geo, maxTris);
    return finalizeGeometry(geo, targetHeight);
  } catch {
    return null;
  }
}

/** Optional HD lamppost only (~0.3 MB). Trees stay procedural (OBJ files are 6–23 MB). */
export async function loadHdLamppost(
  onProgress?: (msg: string) => void,
): Promise<PreparedModel | null> {
  onProgress?.("Upgrading street lights…");
  return withTimeout(
    loadObjModelFast(MODEL_URLS.lamppost, 5.8, 4000),
    6000,
  );
}

export function createFoliageMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x4a9a4a,
    roughness: 0.82,
    metalness: 0.02,
  });
}

/** @deprecated Use createStarterAssets + loadHdLamppost */
export async function loadGameAssets(
  _quality: QualityTier,
  onProgress?: (msg: string) => void,
): Promise<GameAssets> {
  onProgress?.("Starting world…");
  return createStarterAssets();
}
