import { hash, fbm, noise1 } from "./noise";
import { BiomeKey, BiomeWeights } from "./constants";
import { getActiveMap } from "./maps";

export const terrainHeight = (wx: number, wz: number): number =>
  getActiveMap().terrainHeight(wx, wz);

export const biomeWeightsAt = (wx: number, wz: number): BiomeWeights =>
  getActiveMap().biomeWeights(wx, wz);

/** Legacy distance-based sampling (uses x only). */
export const biomeWeights = (dist: number): BiomeWeights =>
  getActiveMap().biomeWeights(dist, 0);

export const dominantBiome = (bw: BiomeWeights): BiomeKey => {
  const forced = getActiveMap().forceBiome;
  if (forced) return forced;
  const keys = Object.keys(bw) as BiomeKey[];
  return keys.reduce((best, k) => (bw[k] > bw[best] ? k : best), keys[0]);
};

export interface PathSample { s: number; x: number; z: number; h: number; }

export const createPathState = () => {
  const pathSamples: PathSample[] = [{ s: 0, x: 0, z: 0, h: 0 }];

  const ensurePath = (sMax: number) => {
    let last = pathSamples[pathSamples.length - 1];
    while (last.s < sMax + 200) {
      const curv = (fbm(last.s * 0.0009) - 0.5) * 0.016;
      const nh   = last.h + curv;
      last = { s: last.s + 1, x: last.x + Math.sin(nh), z: last.z + Math.cos(nh), h: nh };
      pathSamples.push(last);
    }
  };

  const samplePath = (s: number): PathSample => {
    ensurePath(s);
    if (s <= 0) return pathSamples[0];
    const i = Math.min(Math.floor(s), pathSamples.length - 2);
    const a = pathSamples[i], b = pathSamples[i + 1], t = s - Math.floor(s);
    return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t };
  };

  const isNearRoad = (wx: number, wz: number, carS: number, clearance = 14): boolean => {
    const startS = Math.max(0, carS - 60);
    const endS   = carS + 350;
    for (let s = startS; s <= endS; s += 5) {
      const p = samplePath(s);
      if (Math.hypot(wx - p.x, wz - p.z) < clearance) return true;
    }
    return false;
  };

  const normalFromH = (h: number) => ({ x: Math.cos(h), z: -Math.sin(h) });

  return { ensurePath, samplePath, isNearRoad, normalFromH, pathSamples };
};

export const getGroundColorAt = (
  wx: number,
  wz: number,
  hy: number,
  bw: BiomeWeights,
) => getActiveMap().groundColor(wx, wz, hy, bw);

export { hash };
