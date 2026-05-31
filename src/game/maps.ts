import { fbm2, noise1 } from "./noise";
import type { BiomeKey, BiomeWeights } from "./constants";
import { BIOME_KEYS } from "./constants";

export type MapId = "metro" | "plain" | "forest" | "hills" | "beach";

export interface MapProfile {
  id: MapId;
  label: string;
  tagline: string;
  accent: string;
  displayBiome: string;
  terrainHeight: (wx: number, wz: number) => number;
  biomeWeights: (wx: number, wz: number) => BiomeWeights;
  groundColor: (wx: number, wz: number, hy: number, bw: BiomeWeights) => { r: number; g: number; b: number };
  forceBiome?: BiomeKey;
  seaLevel: number;
  seaVisible: boolean;
  seaColor: number;
  fogColor: number;
  fogDensity: number;
  skyZenith: number;
  skyHorizon: number;
  sunWarmth: number;
  exposure: number;
  bloomStrength: number;
  vegSpawnThreshold: number;
  vegDensityMul: number;
  palmBias: number;
  showPeaks: boolean;
  cityZoneSpacing: number;
  citySkipChance: number;
  snowLine: number;
  roadColor: number;
  shoulderColor: number;
}

const bw = (weights: Partial<BiomeWeights>): BiomeWeights => {
  const out = {} as BiomeWeights;
  let sum = 0;
  for (const k of BIOME_KEYS) {
    out[k] = weights[k] ?? 0.02;
    sum += out[k];
  }
  for (const k of BIOME_KEYS) out[k] /= sum;
  return out;
};

/** Near-flat terrain for dense urban driving (GTA-style downtown). */
const metroTerrain = (wx: number, wz: number): number => {
  const n = (fbm2(wx * 0.0018 + 2.1, wz * 0.0018 + 4.4, 3) * 2 - 1) * 1.2;
  const fine = (fbm2(wx * 0.012, wz * 0.012, 2) * 2 - 1) * 0.35;
  return Math.max(0, n + fine + 1.1);
};

const plainTerrain = (wx: number, wz: number): number => {
  const n = (fbm2(wx * 0.003 + 1.2, wz * 0.003 + 2.8, 4) * 2 - 1) * 4;
  const fine = (fbm2(wx * 0.018, wz * 0.018, 2) * 2 - 1) * 1.2;
  return Math.max(0, n + fine + 1.5);
};

const forestTerrain = (wx: number, wz: number): number => {
  const n = (fbm2(wx * 0.004 + 3.1, wz * 0.004 + 1.4, 5) * 2 - 1) * 8;
  const fine = (fbm2(wx * 0.02, wz * 0.02, 3) * 2 - 1) * 2;
  return Math.max(0, n + fine + 2);
};

const hillsTerrain = (wx: number, wz: number): number => {
  const ridge = Math.abs(fbm2(wx * 0.0011 + 2.4, wz * 0.0011 + 5.1, 6) * 2 - 1);
  const large = (fbm2(wx * 0.0016 + 4.2, wz * 0.0016 + 1.8, 7) * 2 - 1) * 58;
  const med = (fbm2(wx * 0.0058 + 2.1, wz * 0.0058 + 7.3, 5) * 2 - 1) * 18;
  const fine = (fbm2(wx * 0.022 + 9.1, wz * 0.022 + 3.5, 3) * 2 - 1) * 4;
  let h = large + med + fine + ridge * 26;
  if (large > 11) h += Math.pow(large - 11, 1.35) * 0.4;
  return Math.max(0, h);
};

const beachTerrain = (wx: number, wz: number): number => {
  const roll = (fbm2(wx * 0.0035, wz * 0.0035, 4) * 2 - 1) * 5;
  const dunes = (fbm2(wx * 0.012 + 8, wz * 0.012, 3) * 2 - 1) * 2.5;
  let h = Math.max(0, roll + dunes + 2);
  const oceanSide = Math.max(0, wz * 0.0045);
  h *= 1 - Math.min(1, oceanSide) * 0.85;
  h -= Math.min(1, oceanSide) * 3.5;
  return Math.max(-1.2, h);
};

export const MAPS: Record<MapId, MapProfile> = {
  metro: {
    id: "metro",
    label: "Los Santos Metro",
    tagline: "Dense downtown · traffic & nightlife",
    accent: "#f59e0b",
    displayBiome: "Downtown",
    terrainHeight: metroTerrain,
    biomeWeights: () => bw({ coastal: 0.55, desert: 0.15, forest: 0.1, mountain: 0.2 }),
    groundColor: (_wx, _wz, _hy) => ({ r: 0.2, g: 0.22, b: 0.24 }),
    forceBiome: undefined,
    seaLevel: -2,
    seaVisible: false,
    seaColor: 0x0a3048,
    fogColor: 0x8a9aaa,
    fogDensity: 0.0045,
    skyZenith: 0x3a5a8a,
    skyHorizon: 0xc8d0e0,
    sunWarmth: 1.15,
    exposure: 1.6,
    bloomStrength: 0.45,
    vegSpawnThreshold: 0.55,
    vegDensityMul: 0.35,
    palmBias: 0.15,
    showPeaks: false,
    cityZoneSpacing: 160,
    citySkipChance: 0.02,
    snowLine: 999,
    roadColor: 0x1a1a1e,
    shoulderColor: 0x2a2a2e,
  },
  plain: {
    id: "plain",
    label: "Great Plains",
    tagline: "Wide highways & golden fields",
    accent: "#e8c468",
    displayBiome: "Plains",
    terrainHeight: plainTerrain,
    biomeWeights: () => bw({ coastal: 0.35, desert: 0.35, forest: 0.2, mountain: 0.1 }),
    groundColor: (_wx, _wz, _hy) => ({ r: 0.72, g: 0.68, b: 0.42 }),
    forceBiome: undefined,
    seaLevel: -2,
    seaVisible: false,
    seaColor: 0x1a4a6a,
    fogColor: 0xc8d4a8,
    fogDensity: 0.0024,
    skyZenith: 0x4a8fd4,
    skyHorizon: 0xe8dcc0,
    sunWarmth: 1.25,
    exposure: 1.55,
    bloomStrength: 0.38,
    vegSpawnThreshold: 0.22,
    vegDensityMul: 0.75,
    palmBias: 0,
    showPeaks: false,
    cityZoneSpacing: 280,
    citySkipChance: 0.08,
    snowLine: 999,
    roadColor: 0x1a1a1c,
    shoulderColor: 0x3d3828,
  },
  forest: {
    id: "forest",
    label: "Redwood Forest",
    tagline: "Dense trees & misty valleys",
    accent: "#5cb85c",
    displayBiome: "Forest",
    terrainHeight: forestTerrain,
    biomeWeights: () => bw({ forest: 0.62, jungle: 0.28, mountain: 0.1 }),
    groundColor: (_wx, _wz, _hy) => ({ r: 0.14, g: 0.38, b: 0.16 }),
    forceBiome: "forest",
    seaLevel: -2,
    seaVisible: false,
    seaColor: 0x0a3048,
    fogColor: 0x6a8a72,
    fogDensity: 0.0028,
    skyZenith: 0x3a6a8a,
    skyHorizon: 0xa8c8a8,
    sunWarmth: 1.1,
    exposure: 1.45,
    bloomStrength: 0.35,
    vegSpawnThreshold: 0.12,
    vegDensityMul: 1.35,
    palmBias: 0,
    showPeaks: false,
    cityZoneSpacing: 380,
    citySkipChance: 0.18,
    snowLine: 999,
    roadColor: 0x141618,
    shoulderColor: 0x1e2a1a,
  },
  hills: {
    id: "hills",
    label: "Alpine Hills",
    tagline: "Mountain passes & snowy peaks",
    accent: "#8ab4d4",
    displayBiome: "Mountains",
    terrainHeight: hillsTerrain,
    biomeWeights: (wx, wz) => {
      const h = hillsTerrain(wx, wz);
      if (h > 42) return bw({ tundra: 0.5, mountain: 0.45, forest: 0.05 });
      return bw({ mountain: 0.45, forest: 0.45, tundra: 0.1 });
    },
    groundColor: (wx, wz, hy, _bw) => {
      if (hy > 38) return { r: 0.88, g: 0.9, b: 0.94 };
      const t = noise1(wx * 0.01 + wz * 0.01);
      return { r: 0.28 + t * 0.08, g: 0.32 + t * 0.06, b: 0.22 };
    },
    forceBiome: undefined,
    seaLevel: -2,
    seaVisible: false,
    seaColor: 0x1a4a6a,
    fogColor: 0x9aaabb,
    fogDensity: 0.0032,
    skyZenith: 0x0a2a5a,
    skyHorizon: 0xb8ccd8,
    sunWarmth: 1.15,
    exposure: 1.5,
    bloomStrength: 0.4,
    vegSpawnThreshold: 0.2,
    vegDensityMul: 1.1,
    palmBias: 0,
    showPeaks: true,
    cityZoneSpacing: 420,
    citySkipChance: 0.15,
    snowLine: 34,
    roadColor: 0x181a1e,
    shoulderColor: 0x2a3038,
  },
  beach: {
    id: "beach",
    label: "Pacific Coast",
    tagline: "Ocean breeze & palm-lined roads",
    accent: "#4ec4e8",
    displayBiome: "Coast",
    terrainHeight: beachTerrain,
    biomeWeights: (wx, wz) => {
      if (wz > 40) return bw({ coastal: 0.9, desert: 0.08, jungle: 0.02 });
      return bw({ coastal: 0.7, desert: 0.2, jungle: 0.1 });
    },
    groundColor: (wx, wz, hy) => {
      if (hy < 0.5 && wz > 20) return { r: 0.92, g: 0.86, b: 0.68 };
      if (wz > 60) return { r: 0.15, g: 0.45, b: 0.62 };
      return { r: 0.82, g: 0.76, b: 0.52 };
    },
    forceBiome: "coastal",
    seaLevel: 0.15,
    seaVisible: true,
    seaColor: 0x0c5c7a,
    fogColor: 0x88c8e8,
    fogDensity: 0.0036,
    skyZenith: 0x1a6ab8,
    skyHorizon: 0xf0e8d0,
    sunWarmth: 1.4,
    exposure: 1.7,
    bloomStrength: 0.42,
    palmBias: 0.72,
    vegSpawnThreshold: 0.18,
    vegDensityMul: 0.95,
    showPeaks: false,
    cityZoneSpacing: 300,
    citySkipChance: 0.1,
    snowLine: 999,
    roadColor: 0x222224,
    shoulderColor: 0xc4b090,
  },
};

let activeMap: MapProfile = MAPS.metro;

export const setActiveMap = (id: MapId): void => {
  activeMap = MAPS[id];
};

export const getActiveMap = (): MapProfile => activeMap;

export const MAP_LIST: MapProfile[] = [MAPS.metro, MAPS.plain, MAPS.forest, MAPS.hills, MAPS.beach];
