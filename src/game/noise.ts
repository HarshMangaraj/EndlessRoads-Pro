// ── 1-D helpers ──────────────────────────────────────────────────────────────
export const hash = (n: number): number => {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
};

export const noise1 = (x: number): number => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
};

export const fbm = (x: number, oct = 4): number => {
  let a = 0.5, fr = 1, s = 0, nm = 0;
  for (let i = 0; i < oct; i++) {
    s  += a * noise1(x * fr);
    nm += a;
    a  *= 0.5;
    fr *= 2;
  }
  return s / nm;
};

// ── 2-D helpers ───────────────────────────────────────────────────────────────
export const hash2 = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
};

export const noise2 = (x: number, y: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix,       fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a  = hash2(ix,     iy);
  const b  = hash2(ix + 1, iy);
  const c  = hash2(ix,     iy + 1);
  const d  = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

export const fbm2 = (x: number, y: number, oct = 4): number => {
  let a = 0.5, fr = 1, s = 0, nm = 0;
  for (let i = 0; i < oct; i++) {
    s  += a * noise2(x * fr, y * fr);
    nm += a;
    a  *= 0.5;
    fr *= 2.0;
  }
  return s / nm;
};
