import React, { useRef, useImperativeHandle, forwardRef } from "react";
import { BLOCK, gridCoord, gridLineX, gridLineZ } from "../game/roadNetwork";

export interface MinimapHandle {
  draw: (worldX: number, worldZ: number, heading: number) => void;
}

const panelStyle: React.CSSProperties = {
  background: "rgba(6,6,10,.82)",
  border: "1px solid rgba(255,255,255,.08)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 20,
  boxShadow: "0 8px 32px rgba(0,0,0,.4)",
  padding: 10,
};

const SIZE = 130;
const SCALE = 0.28;

const Minimap = forwardRef<MinimapHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    draw(worldX, worldZ, heading) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(0, 0, SIZE, SIZE);

      const half = SIZE / 2;
      const gx0 = gridCoord(worldX) - 3;
      const gx1 = gridCoord(worldX) + 3;
      const gz0 = gridCoord(worldZ) - 3;
      const gz1 = gridCoord(worldZ) + 3;
      const roadW = BLOCK * SCALE * 0.14;

      // Draw N-S road strips
      ctx.fillStyle = "rgba(80,82,90,.95)";
      for (let gx = gx0; gx <= gx1; gx++) {
        const rx = half + (gridLineX(gx) - worldX) * SCALE - roadW * 0.5;
        const ry = 0;
        ctx.fillRect(rx, ry, roadW, SIZE);
      }
      // Draw E-W road strips
      for (let gz = gz0; gz <= gz1; gz++) {
        const ry = half + (gridLineZ(gz) - worldZ) * SCALE - roadW * 0.5;
        ctx.fillRect(0, ry, SIZE, roadW);
      }

      // Direction arrow pointing heading
      ctx.save();
      ctx.translate(half, half);
      ctx.rotate(-heading);
      ctx.fillStyle = "#f87171";
      ctx.shadowColor = "#f87171";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // N label
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("N", half, 13);
    },
  }));

  return (
    <div style={{ position: "absolute", top: 18, right: 18, zIndex: 10, ...panelStyle }}>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ display: "block", borderRadius: 12 }} />
    </div>
  );
});

Minimap.displayName = "Minimap";
export default Minimap;
