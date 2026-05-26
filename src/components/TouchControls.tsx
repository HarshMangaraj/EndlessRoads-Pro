import React from "react";

interface TouchControlsProps {
  onGas:   (v: boolean) => void;
  onBrake: (v: boolean) => void;
  onLeft:  (v: boolean) => void;
  onRight: (v: boolean) => void;
}

const btn = (
  label: string,
  fn: (v: boolean) => void,
  style?: React.CSSProperties,
): React.ReactNode => (
  <button
    key={label}
    onTouchStart={e => { e.preventDefault(); fn(true); }}
    onTouchEnd={e => { e.preventDefault(); fn(false); }}
    onMouseDown={() => fn(true)}
    onMouseUp={() => fn(false)}
    onMouseLeave={() => fn(false)}
    style={{
      width: 66, height: 66, borderRadius: 15, fontSize: 24, fontWeight: 700,
      background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.22)",
      color: "#fff", cursor: "pointer", userSelect: "none", touchAction: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(8px)",
      boxShadow: "0 4px 16px rgba(0,0,0,.3)",
      ...style,
    }}
  >
    {label}
  </button>
);

export default function TouchControls({ onGas, onBrake, onLeft, onRight }: TouchControlsProps) {
  return (
    <div style={{
      position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
      zIndex: 20, display: "flex", gap: 12, alignItems: "flex-end", pointerEvents: "auto",
    }}>
      <div style={{ display: "flex", gap: 6 }}>
        {btn("←", onLeft)}
        {btn("→", onRight)}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {btn("▲", onGas,   { background: "rgba(34,197,94,.22)", border: "1px solid rgba(34,197,94,.4)" })}
        {btn("▼", onBrake, { background: "rgba(239,68,68,.22)",  border: "1px solid rgba(239,68,68,.4)" })}
      </div>
    </div>
  );
}
