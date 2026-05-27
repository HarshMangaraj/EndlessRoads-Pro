import { hash } from "./noise";
import { terrainHeight } from "./terrain";

/** City block size — roads run on grid lines. */
export const BLOCK = 80;
export const ROAD_SURFACE_LIFT = 0.38;
/** Wheel mesh center Y in car local space; radius 0.43. */
export const CAR_WHEEL_LOCAL_Y = 0.38;
export const CAR_WHEEL_RADIUS = 0.43;

/** World Y of the top of the asphalt road mesh. */
export const roadSurfaceY = (wx: number, wz: number): number =>
  Math.max(0, terrainHeight(wx, wz)) + ROAD_SURFACE_LIFT;

/** Car group origin so tire contact meets the road (local bottom = localY - radius). */
export const carAnchorY = (wx: number, wz: number): number =>
  roadSurfaceY(wx, wz) + (CAR_WHEEL_RADIUS - CAR_WHEEL_LOCAL_Y + 0.02);
export const ROAD_HALF = 7.2;
export const LANE_OFF = 3.0;
export const SIDEWALK_OFF = 9.0;

export type RoadAxis = "ns" | "ew";

export const gridCoord = (wx: number): number => Math.round(wx / BLOCK);

export const gridLineX = (gx: number): number => gx * BLOCK;

export const gridLineZ = (gz: number): number => gz * BLOCK;

export interface NearestRoad {
  onRoad: boolean;
  axis: RoadAxis | null;
  gx: number;
  gz: number;
  dist: number;
  heading: number;
}

export const nearestRoad = (wx: number, wz: number): NearestRoad => {
  const gx = gridCoord(wx);
  const gz = gridCoord(wz);
  const cx = gridLineX(gx);
  const cz = gridLineZ(gz);
  const dx = Math.abs(wx - cx);
  const dz = Math.abs(wz - cz);
  const onNS = dx < ROAD_HALF;
  const onEW = dz < ROAD_HALF;

  if (onNS && (!onEW || dx <= dz)) {
    return { onRoad: true, axis: "ns", gx, gz, dist: dx, heading: wz > cz ? 0 : Math.PI };
  }
  if (onEW) {
    return { onRoad: true, axis: "ew", gx, gz, dist: dz, heading: wx > cx ? Math.PI / 2 : -Math.PI / 2 };
  }
  return { onRoad: false, axis: null, gx, gz, dist: Math.min(dx, dz), heading: 0 };
};

export const isOnRoad = (wx: number, wz: number, margin = ROAD_HALF + 2): boolean => {
  const gx = gridCoord(wx);
  const gz = gridCoord(wz);
  return Math.abs(wx - gridLineX(gx)) < margin || Math.abs(wz - gridLineZ(gz)) < margin;
};

export const isOnSidewalk = (wx: number, wz: number): boolean => {
  const gx = gridCoord(wx);
  const gz = gridCoord(wz);
  const dx = Math.abs(wx - gridLineX(gx));
  const dz = Math.abs(wz - gridLineZ(gz));
  const onNS = dx > ROAD_HALF && dx < SIDEWALK_OFF + 1.5;
  const onEW = dz > ROAD_HALF && dz < SIDEWALK_OFF + 1.5;
  return onNS || onEW;
};

export interface TrafficLightState {
  nsGreen: boolean;
  ewGreen: boolean;
  allRed: boolean;
}

/** ~24s cycle: NS green, brief all-red, EW green, brief all-red. */
export const trafficLightState = (gx: number, gz: number, timeSec: number): TrafficLightState => {
  const offset = hash(gx * 17.3 + gz * 23.7) * 6;
  const t = (timeSec + offset) % 24;
  if (t < 10) return { nsGreen: true, ewGreen: false, allRed: false };
  if (t < 12) return { nsGreen: false, ewGreen: false, allRed: true };
  if (t < 22) return { nsGreen: false, ewGreen: true, allRed: false };
  return { nsGreen: false, ewGreen: false, allRed: true };
};

export const axisMayProceed = (
  axis: RoadAxis,
  gx: number,
  gz: number,
  timeSec: number,
): boolean => {
  const s = trafficLightState(gx, gz, timeSec);
  if (s.allRed) return false;
  return axis === "ns" ? s.nsGreen : s.ewGreen;
};

/** Distance along axis line to next junction center. */
export const distToJunctionAhead = (
  axis: RoadAxis,
  wx: number,
  wz: number,
  dir: 1 | -1,
): { dist: number; jx: number; jz: number } => {
  if (axis === "ns") {
    const gx = gridCoord(wx);
    const gz = gridCoord(wz);
    const cz = gridLineZ(gz);
    const ahead = dir > 0 ? gz + 1 : gz - 1;
    const target = gridLineZ(ahead);
    return { dist: Math.abs(target - wz), jx: gx, jz: ahead };
  }
  const gx = gridCoord(wx);
  const gz = gridCoord(wz);
  const ahead = dir > 0 ? gx + 1 : gx - 1;
  const target = gridLineX(ahead);
  return { dist: Math.abs(target - wx), jx: ahead, jz: gz };
};

/**
 * Traffic density zoning.
 * Returns 0‥1 where 1 = dense downtown, 0 = quiet suburb.
 * Based on a simple hash so the same location is always the same zone.
 */
export const densityAt = (gx: number, gz: number): number => {
  // Core downtown: within 3 blocks of origin
  const dist = Math.max(Math.abs(gx), Math.abs(gz));
  if (dist <= 2) return 0.95;
  if (dist <= 4) return 0.7;
  if (dist <= 6) return 0.45;
  return 0.2 + hash(gx * 11.7 + gz * 19.3) * 0.15;
};

export const positionOnLane = (
  axis: RoadAxis,
  line: number,
  t: number,
  lane: -1 | 1,
): { x: number; z: number; heading: number } => {
  if (axis === "ns") {
    const x = gridLineX(line) + lane * LANE_OFF;
    return { x, z: t, heading: t > 0 ? 0 : Math.PI };
  }
  const z = gridLineZ(line) + lane * LANE_OFF;
  return { x: t, z, heading: t > 0 ? Math.PI / 2 : -Math.PI / 2 };
};
