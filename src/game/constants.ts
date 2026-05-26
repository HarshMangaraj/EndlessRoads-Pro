export const BIOMES = {
  forest:   { name: "Forest",   fogDensity: 0.004, skyTop: 0x1a4a1a, skyBot: 0x7aab7a, fogColor: 0x6a8f6a },
  mountain: { name: "Mountain", fogDensity: 0.003, skyTop: 0x0a2a5a, skyBot: 0x8aabcc, fogColor: 0x9aaabb },
  coastal:  { name: "Coastal",  fogDensity: 0.005, skyTop: 0x1155aa, skyBot: 0xaad4f5, fogColor: 0x90c4e8 },
  desert:   { name: "Desert",   fogDensity: 0.003, skyTop: 0x8b4a0a, skyBot: 0xf5d08a, fogColor: 0xe8c87a },
  tundra:   { name: "Tundra",   fogDensity: 0.006, skyTop: 0x0a1a2a, skyBot: 0xc0d8e8, fogColor: 0xc8d8e8 },
  jungle:   { name: "Jungle",   fogDensity: 0.007, skyTop: 0x0f2d0f, skyBot: 0x4a8a4a, fogColor: 0x3a6a3a },
} as const;

export type BiomeKey = keyof typeof BIOMES;
export type BiomeWeights = Record<BiomeKey, number>;

export const BIOME_KEYS = Object.keys(BIOMES) as BiomeKey[];

export const ROAD_WIDTH    = 5;
export const ROAD_SEGS     = 300;
export const ROAD_STEP     = 2;
export const ROAD_TOTAL    = (ROAD_SEGS + 1) * 2;
export const ROAD_CLEAR    = 14;

export const RAIL_SEGS     = 150;
export const RAIL_STEP     = 4;
export const RAIL_TOTAL    = (RAIL_SEGS + 1) * 2;

export const TILE_SIZE     = 200;
export const TILE_GRID     = 6;
export const TILE_RES      = 48;

/** Vegetation uses OBJ instancing — counts live in vegetation.ts per quality tier. */

export const CLOUD_COUNT   = 80;   // puff clouds (each rendered as 3 spheres)
export const CIRRUS_COUNT  = 28;   // high-altitude wispy layer
export const RAIN_COUNT    = 5000;
export const SNOW_COUNT    = 2000;
export const STAR_COUNT    = 7000;

export const VEG_RADIUS    = 280;
export const VEG_CELL      = 12;

export const MAX_SPEED     = 38;
export const MAX_SPEED_REV = 12;
export const TWO_PI        = Math.PI * 2;
