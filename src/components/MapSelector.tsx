import React from "react";
import type { MapId } from "../game/maps";
import { MAP_LIST } from "../game/maps";

interface MapSelectorProps {
  selected: MapId;
  onChange: (id: MapId) => void;
  disabled?: boolean;
}

export default function MapSelector({ selected, onChange, disabled }: MapSelectorProps) {
  return (
    <div style={{
      position: "absolute", left: 18, bottom: 18, zIndex: 12,
      background: "rgba(6,8,14,.88)", border: "1px solid rgba(255,255,255,.1)",
      backdropFilter: "blur(20px)", borderRadius: 18, padding: "12px 14px",
      boxShadow: "0 12px 40px rgba(0,0,0,.45)", maxWidth: 220,
      opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : "auto",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <div style={{
        fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em",
        color: "rgba(255,255,255,.35)", marginBottom: 10,
      }}>World Map</div>
      <div style={{ display: "grid", gap: 6 }}>
        {MAP_LIST.map((m) => {
          const on = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.id)}
              style={{
                textAlign: "left", cursor: disabled ? "default" : "pointer",
                border: `1px solid ${on ? m.accent : "rgba(255,255,255,.08)"}`,
                borderRadius: 12, padding: "10px 12px",
                background: on
                  ? `linear-gradient(135deg, ${m.accent}22, rgba(255,255,255,.04))`
                  : "rgba(255,255,255,.04)",
                color: "#fff", fontFamily: "inherit",
                boxShadow: on ? `0 0 20px ${m.accent}33` : "none",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", lineHeight: 1.35 }}>
                {m.tagline}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{
        marginTop: 10, fontSize: 9, color: "rgba(255,255,255,.28)", lineHeight: 1.4,
      }}>
        Switching reloads the world (Esc to pause)
      </div>
    </div>
  );
}
