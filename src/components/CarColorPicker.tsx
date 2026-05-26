import React from "react";

export const CAR_COLORS = [
  { id: "crimson", hex: 0xb3261e, label: "Crimson" },
  { id: "midnight", hex: 0x0f1c34, label: "Midnight" },
  { id: "olive", hex: 0x4b5320, label: "Olive" },
  { id: "ivory", hex: 0xe8e4d8, label: "Ivory" },
  { id: "tangerine", hex: 0xe85d3a, label: "Tangerine" },
  { id: "electric", hex: 0x1d6fe0, label: "Electric" },
] as const;

export type CarColorId = (typeof CAR_COLORS)[number]["id"];

interface CarColorPickerProps {
  selected: CarColorId;
  onSelect: (id: CarColorId) => void;
}

export default function CarColorPicker({ selected, onSelect }: CarColorPickerProps) {
  return (
    <div style={{
      position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
      zIndex: 10, background: "rgba(6,6,10,.82)",
      border: "1px solid rgba(255,255,255,.08)", backdropFilter: "blur(20px)",
      borderRadius: 28, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center",
      boxShadow: "0 8px 32px rgba(0,0,0,.4)",
    }}>
      <span style={{
        fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em",
        color: "rgba(255,255,255,.4)", marginRight: 4,
      }}>Paint</span>
      {CAR_COLORS.map(c => {
        const hex = "#" + c.hex.toString(16).padStart(6, "0");
        const active = selected === c.id;
        return (
          <button key={c.id} onClick={() => onSelect(c.id)} title={c.label} style={{
            width: 24, height: 24, borderRadius: "50%", cursor: "pointer",
            background: hex, border: "2px solid " + (active ? "#fff" : "rgba(255,255,255,0.2)"),
            boxShadow: active ? `0 0 0 2px ${hex}, 0 0 14px ${hex}88` : "none",
            transition: "all .15s ease", padding: 0,
          }} />
        );
      })}
    </div>
  );
}
