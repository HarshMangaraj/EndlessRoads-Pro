import React from "react";

interface PauseMenuProps {
  paused: boolean;
  onResume: () => void;
  onReset: () => void;
}

export default function PauseMenu({ paused, onResume, onReset }: PauseMenuProps) {
  if (!paused) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(14px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        background: "rgba(12,12,18,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: "44px 56px", textAlign: "center",
        minWidth: 320, boxShadow: "0 20px 70px rgba(0,0,0,0.6)",
      }}>
        <div style={{
          fontSize: 11, letterSpacing: "0.32em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)", marginBottom: 8,
        }}>Game paused</div>
        <h1 style={{
          fontSize: 38, fontWeight: 800, color: "#fff",
          letterSpacing: "-0.02em", marginBottom: 28,
        }}>Endless Drive</h1>
        <div style={{ display: "grid", gap: 10 }}>
          <button onClick={onResume} style={menuBtnPrimary}>Resume</button>
          <button onClick={onReset} style={menuBtnGhost}>Reset Position</button>
        </div>
        <div style={{
          marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6,
        }}>
          Press <kbd style={kbd}>Esc</kbd> to resume
          <br />
          Change map from the panel bottom-left
        </div>
      </div>
    </div>
  );
}

const menuBtnPrimary: React.CSSProperties = {
  background: "#fff", color: "#000", border: "none", borderRadius: 12,
  padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit", letterSpacing: "0.02em",
};
const menuBtnGhost: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
  padding: "11px 24px", fontSize: 13, fontWeight: 500, cursor: "pointer",
  fontFamily: "inherit",
};
const kbd: React.CSSProperties = {
  background: "rgba(255,255,255,0.12)", padding: "2px 7px",
  borderRadius: 5, fontSize: 10, border: "1px solid rgba(255,255,255,0.08)",
};
