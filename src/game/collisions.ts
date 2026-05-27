/** Simple circle obstacles for car vs poles / traffic lights. */

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export const CAR_COLLISION_RADIUS = 1.15;

export const resolveObstacleCollisions = (
  x: number,
  z: number,
  obstacles: Obstacle[],
  carR = CAR_COLLISION_RADIUS,
): { x: number; z: number; hit: boolean } => {
  let px = x;
  let pz = z;
  let hit = false;

  for (const o of obstacles) {
    const dx = px - o.x;
    const dz = pz - o.z;
    const distSq = dx * dx + dz * dz;
    const minR = carR + o.r;
    if (distSq >= minR * minR || distSq < 1e-8) continue;
    const dist = Math.sqrt(distSq);
    const push = (minR - dist) / dist;
    px += dx * push;
    pz += dz * push;
    hit = true;
  }

  return { x: px, z: pz, hit };
};
