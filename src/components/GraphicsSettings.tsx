import React from "react";

export type Quality = "low" | "medium" | "high" | "ultra";

interface GraphicsSettingsProps {
  quality: Quality;
  onChange: (q: Quality) => void;
  cameraMode: "chase" | "hood" | "cinematic";
  onCameraChange: (m: "chase" | "hood" | "cinematic") => void;
}

const QUALITIES: Quality[] = ["low", "medium", "high", "ultra"];
const CAMS: ("chase" | "hood" | "cinematic")[] = ["chase", "hood", "cinematic"];

export default function GraphicsSettings({ quality, onChange, cameraMode, onCameraChange }: GraphicsSettingsProps) {
  return (
    <div style={{
      position: "absolute", top: 18, right: 18, zIndex: 10,
      background: "rgba(6,6,10,.82)", border: "1px solid rgba(255,255,255,.08)",
      backdropFilter: "blur(20px)", borderRadius: 18, padding: "12px 14px",
      boxShadow: "0 8px 32px rgba(0,0,0,.4)", minWidth: 178,
    }}>
      <div style={{
        fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em",
        color: "rgba(255,255,255,.3)", marginBottom: 8,
      }}>Graphics</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 12 }}>
        {QUALITIES.map(q => (
          <button key={q} onClick={() => onChange(q)} style={btn(quality === q)}>
            {q[0].toUpperCase() + q.slice(1)}
          </button>
        ))}
      </div>
      <div style={{
        fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em",
        color: "rgba(255,255,255,.3)", marginBottom: 8,
      }}>Camera</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        {CAMS.map(c => (
          <button key={c} onClick={() => onCameraChange(c)} style={btn(cameraMode === c)}>
            {c[0].toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

const btn = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.06)",
  color: active ? "#000" : "rgba(255,255,255,.65)",
  border: "1px solid " + (active ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.09)"),
  fontSize: 10.5, borderRadius: 8, padding: "4px 6px", cursor: "pointer",
  fontFamily: "inherit", fontWeight: active ? 700 : 400, letterSpacing: "0.04em",
  textTransform: "capitalize",
});
