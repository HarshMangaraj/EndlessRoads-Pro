import React from "react";

interface HUDProps {
  speed: number;
  rpm: number;
  gear: string;
  weather: string;
  timeDisplay: string;
  isNight: boolean;
  timeOfDay: number;
  autoTime: boolean;
  showBiome: boolean;
  currentBiome: string;
  onWeatherChange: (w: string) => void;
  onTimeChange: (v: number) => void;
  onAutoTimeChange: (v: boolean) => void;
  audioMuted?: boolean;
  onToggleMute?: () => void;
}

const WEATHER_OPTIONS = [
  { id: "sunny",   label: "Sunny"   },
  { id: "cloudy",  label: "Cloudy"  },
  { id: "rain",    label: "Rain"    },
  { id: "thunder", label: "Thunder" },
];

const panelStyle: React.CSSProperties = {
  background: "rgba(6,6,10,.82)",
  border: "1px solid rgba(255,255,255,.08)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderRadius: 20,
  padding: "14px 16px",
  boxShadow: "0 8px 32px rgba(0,0,0,.4)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "rgba(255,255,255,.3)",
  marginBottom: 10,
};

export default function HUD({
  speed, rpm, gear, weather, timeDisplay, isNight, timeOfDay, autoTime,
  showBiome, currentBiome, onWeatherChange, onTimeChange, onAutoTimeChange,
  audioMuted = false, onToggleMute,
}: HUDProps) {
  return (
    <>
      {/* Biome toast */}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        color: "rgba(255,255,255,.92)", fontSize: 14, fontWeight: 700,
        letterSpacing: "0.2em", textTransform: "uppercase",
        textShadow: "0 2px 20px rgba(0,0,0,.95)",
        opacity: showBiome ? 1 : 0, transition: "opacity .7s ease",
        pointerEvents: "none",
        background: "rgba(0,0,0,.38)", padding: "8px 22px", borderRadius: 32,
        border: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(12px)",
      }}>
        {currentBiome} Zone
      </div>

      {/* Top-left: Weather + Time */}
      <div style={{ position: "absolute", top: 18, left: 18, zIndex: 10, ...panelStyle, minWidth: 195 }}>
        <div style={labelStyle}>Environment</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 13 }}>
          {WEATHER_OPTIONS.map(w => (
            <button key={w.id} onClick={() => onWeatherChange(w.id)} style={{
              background: weather === w.id ? "rgba(255,255,255,.90)" : "rgba(255,255,255,.06)",
              border: "1px solid " + (weather === w.id ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.09)"),
              color: weather === w.id ? "#000" : "rgba(255,255,255,.65)",
              fontSize: 11, borderRadius: 10, padding: "5px 10px", cursor: "pointer",
              transition: "all .16s ease", fontFamily: "inherit",
              fontWeight: weather === w.id ? 700 : 400, letterSpacing: "0.04em",
            }}>{w.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,.3)" }}>Time</span>
          <span style={{ fontSize: 13, color: isNight ? "#a0c0ff" : "#ffe080", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            {timeDisplay} {isNight ? "Night" : "Day"}
          </span>
        </div>
        <input type="range" min="0" max="1" step="0.001" value={timeOfDay}
          onChange={e => { const v = parseFloat(e.target.value); onTimeChange(v); onAutoTimeChange(false); }}
          style={{ width: "100%", accentColor: "#fff", height: 20 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(255,255,255,.45)", marginTop: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={autoTime}
            onChange={e => onAutoTimeChange(e.target.checked)}
            style={{ accentColor: "#fff" }} />
          Auto day/night cycle
        </label>
        {onToggleMute && (
          <button onClick={onToggleMute} style={{
            marginTop: 10, width: "100%",
            background: audioMuted ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.12)",
            border: "1px solid rgba(255,255,255,.12)",
            color: audioMuted ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.85)",
            fontSize: 11, borderRadius: 10, padding: "6px 10px", cursor: "pointer",
            fontFamily: "inherit", letterSpacing: "0.06em",
          }}>
            {audioMuted ? "Sound off" : "Sound on"}
          </button>
        )}
      </div>

      {/* Bottom-right: Speedometer */}
      <div style={{
        position: "absolute", bottom: 24, right: 24, zIndex: 10,
        ...panelStyle, borderRadius: 22, padding: "16px 26px", textAlign: "right", minWidth: 150,
      }}>
        <div style={{
          fontSize: 60, fontWeight: 800, lineHeight: 1, color: "#fff",
          fontVariantNumeric: "tabular-nums", letterSpacing: -2,
          textShadow: speed > 100 ? "0 0 30px rgba(255,200,100,.4)" : "none",
          transition: "text-shadow .3s",
        }}>{speed}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 2 }}>km/h</div>

        {/* RPM bar */}
        <div style={{ width: "100%", height: 5, background: "rgba(255,255,255,.1)", borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 3, transition: "width .08s, background .2s",
            width: rpm + "%",
            background: rpm > 90 ? "#f87171" : rpm > 75 ? "#facc15" : "#4ade80",
            boxShadow: rpm > 75 ? `0 0 8px ${rpm > 90 ? "#f87171" : "#facc15"}88` : "none",
          }} />
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", marginTop: 5 }}>
          <span style={{ color: "rgba(255,255,255,.7)", fontWeight: 600 }}>Gear {gear}</span>
          {" "}&nbsp;{Math.round(rpm * 70 + 800)} RPM
        </div>
      </div>

      {/* Bottom-left: Controls */}
      <div style={{
        position: "absolute", bottom: 24, left: 24, zIndex: 10,
        ...panelStyle, borderRadius: 18, color: "rgba(255,255,255,.55)", fontSize: 11, lineHeight: "1.85",
      }}>
        <div style={labelStyle}>Controls</div>
        {[["W / ↑", "Gas"], ["S / ↓", "Brake"], ["A D / ← →", "Steer"], ["Space", "Handbrake"]].map(([k, v]) => (
          <div key={k}>
            <span style={{
              background: "rgba(255,255,255,.11)", borderRadius: 6,
              padding: "1px 7px", fontSize: 10, marginRight: 6,
              border: "1px solid rgba(255,255,255,.08)",
            }}>{k}</span>
            <span style={{ color: "rgba(255,255,255,.4)" }}>{v}</span>
          </div>
        ))}
      </div>
    </>
  );
}
