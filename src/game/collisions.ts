/** Circle obstacles for car vs world (poles, traffic, buildings). */

export interface Obstacle {
  x: number;
  z: number;
  r: number;
  /** Optional: softer push (parked cars). */
  soft?: boolean;
}

export const CAR_COLLISION_RADIUS = 1.12;
export const TRAFFIC_COLLISION_RADIUS = 1.85;
export const BUILDING_COLLISION_RADIUS = 4.5;

export const resolveObstacleCollisions = (
  x: number,
  z: number,
  obstacles: Obstacle[],
  carR = CAR_COLLISION_RADIUS,
): { x: number; z: number; hit: boolean; hitTraffic: boolean; hitBuilding: boolean } => {
  let px = x;
  let pz = z;
  let hit = false;
  let hitTraffic = false;
  let hitBuilding = false;

  for (const o of obstacles) {
    const dx = px - o.x;
    const dz = pz - o.z;
    const distSq = dx * dx + dz * dz;
    const oR = o.r >= BUILDING_COLLISION_RADIUS - 0.5 ? BUILDING_COLLISION_RADIUS : o.r;
    const minR = carR + oR;
    if (distSq >= minR * minR || distSq < 1e-8) continue;
    const dist = Math.sqrt(distSq);
    const push = ((minR - dist) / dist) * (o.soft ? 0.65 : 1);
    px += dx * push;
    pz += dz * push;
    hit = true;
    if (oR >= BUILDING_COLLISION_RADIUS - 0.5) hitBuilding = true;
    else if (o.r >= TRAFFIC_COLLISION_RADIUS - 0.3) hitTraffic = true;
  }

  return { x: px, z: pz, hit, hitTraffic, hitBuilding };
};
