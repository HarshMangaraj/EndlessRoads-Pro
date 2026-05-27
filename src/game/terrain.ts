import { fbm, noise1 } from "./noise";
import { BiomeKey, BiomeWeights } from "./constants";
import { getActiveMap } from "./maps";
import { isOnRoad as checkOnRoad } from "./roadNetwork";
export { hash } from "./noise";

export const terrainHeight = (wx: number, wz: number): number =>
  getActiveMap().terrainHeight(wx, wz);

export const biomeWeightsAt = (wx: number, wz: number): BiomeWeights =>
  getActiveMap().biomeWeights(wx, wz);

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

  ensurePath(800);

  const samplePathFromSpline = (s: number): PathSample => {
    if (s <= 0) return pathSamples[0];
    const i = Math.min(Math.floor(s), pathSamples.length - 2);
    const a = pathSamples[i], b = pathSamples[i + 1], t = s - Math.floor(s);
    return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t };
  };

  // Free-world: sample returns a point ahead along current heading from player position
  // Used only for minimap + camera lookahead; world position driven by physics now
  let anchor = { x: 0, z: 0, h: 0 };
  const setAnchor = (x: number, z: number, h: number) => { anchor = { x, z, h }; };

  const samplePath = (lookAhead: number): PathSample => {
    const dist = Math.abs(lookAhead);
    return {
      s: dist,
      x: anchor.x + Math.sin(anchor.h) * dist,
      z: anchor.z + Math.cos(anchor.h) * dist,
      h: anchor.h,
    };
  };

  const isNearRoad = (wx: number, wz: number, _carS?: number, clearance = 14): boolean => {
    return checkOnRoad(wx, wz, clearance);
  };

  const normalFromH = (h: number) => ({ x: Math.cos(h), z: -Math.sin(h) });

  return { ensurePath, samplePath, samplePathFromSpline, isNearRoad, normalFromH, pathSamples, setAnchor };
};

export const getGroundColorAt = (
  wx: number,
  wz: number,
  hy: number,
  bw: BiomeWeights,
) => getActiveMap().groundColor(wx, wz, hy, bw);
