import React, { useRef, useImperativeHandle, forwardRef } from "react";

export interface MinimapHandle {
  draw: (worldX: number, worldZ: number, carS: number, samplePath: (s: number) => { x: number; z: number }) => void;
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

const Minimap = forwardRef<MinimapHandle>((_, ref) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<{ x: number; z: number }[]>([]);

  useImperativeHandle(ref, () => ({
    draw(worldX, worldZ, carS, samplePath) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      historyRef.current.push({ x: worldX, z: worldZ });
      if (historyRef.current.length > 600) historyRef.current.shift();

      const W2 = 130, H2 = 130, sc = 0.17;
      ctx.clearRect(0, 0, W2, H2);

      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(0, 0, W2, H2);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,.45)";
      ctx.lineWidth   = 2;
      for (let ds = 0; ds < 350; ds += 5) {
        const p  = samplePath(carS + ds);
        const sx = W2 / 2 + (p.x - worldX) * sc;
        const sy = H2 / 2 + (p.z - worldZ) * sc;
        ds === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(120,180,255,.38)";
      ctx.lineWidth   = 1.5;
      historyRef.current.forEach((p, i) => {
        const sx = W2 / 2 + (p.x - worldX) * sc;
        const sy = H2 / 2 + (p.z - worldZ) * sc;
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "#f87171";
      ctx.shadowColor = "#f87171";
      ctx.shadowBlur  = 6;
      ctx.arc(W2 / 2, H2 / 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font      = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("N", W2 / 2, 13);
    },
  }));

  return (
    <div style={{ position: "absolute", top: 18, right: 18, zIndex: 10, ...panelStyle }}>
      <canvas ref={canvasRef} width={130} height={130} style={{ display: "block", borderRadius: 12 }} />
    </div>
  );
});

Minimap.displayName = "Minimap";
export default Minimap;
