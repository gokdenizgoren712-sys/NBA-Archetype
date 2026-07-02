/**
 * Oyuncu arketip radar grafiği.
 * scores: { "Engine": 0.96, "Anchor": 0.74, ... }  (0-1 arası)
 * Recharts RadarChart kullanır — bileşen sayısı kadar köşeli çokgen.
 */
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend,
} from "recharts";

// 14 core nouns only on radar
const COMP_ORDER = [
  "Engine", "Ecosystem", "Hub",
  "Connector", "Creator", "Anchor",
  "Spacer", "Finisher", "Force", "Initiator",
  "Stopper", "Rim Runner",
];

const ARCH_COLOR = {
  Engine:      "#f97316",
  Ecosystem:   "#22c55e",
  Hub:         "#14b8a6",
  Conductor:   "#06b6d4",
  Connector:   "#a855f7",
  Creator:     "#f43f5e",
  Fulcrum:     "#f59e0b",
  Anchor:      "#3b82f6",
  Spacer:      "#38bdf8",
  Finisher:    "#84cc16",
  Force:       "#ef4444",
  Initiator:   "#eab308",
  Stopper:     "#94a3b8",
  "Rim Runner":"#10b981",
};

function pickColor(primaryArch) {
  return ARCH_COLOR[primaryArch] || "#8b5cf6";
}

// Custom tooltip
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs">
      <div className="font-semibold text-white">{d.comp}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {Math.round(p.value * 100)}
        </div>
      ))}
    </div>
  );
}

export default function RadarProfile({
  scores = {},
  scores2 = null,        // ikinci oyuncu (karşılaştırma modu)
  name   = "",
  name2  = "",
  primaryArch = "",
  primaryArch2 = "",
  margin = 0,            // güven bandı (0-0.15)
}) {
  const showHalo = margin > 0.05 && !scores2;
  const haloKey = "_halo";

  const data = COMP_ORDER
    .filter(c => scores[c] !== undefined)
    .map(c => ({
      comp:  c,
      [name || "Oyuncu"]: scores[c] || 0,
      ...(scores2 ? { [name2 || "Oyuncu 2"]: scores2[c] || 0 } : {}),
      ...(showHalo ? { [haloKey]: Math.min(1, (scores[c] || 0) + margin) } : {}),
    }));

  const color1 = pickColor(primaryArch);
  const color2 = pickColor(primaryArch2) || "#f59e0b";
  const key1   = name  || "Oyuncu";
  const key2   = name2 || "Oyuncu 2";

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} cx="50%" cy="50%">
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="comp"
          tick={{ fill: "#94a3b8", fontSize: 10 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 1]}
          tick={{ fill: "#475569", fontSize: 9 }}
          tickCount={3}
        />
        {/* Confidence halo — outer faint polygon */}
        {showHalo && (
          <Radar
            name={haloKey}
            dataKey={haloKey}
            stroke="none"
            fill={color1}
            fillOpacity={0.07}
            legendType="none"
            dot={false}
          />
        )}
        <Radar
          name={key1}
          dataKey={key1}
          stroke={color1}
          fill={color1}
          fillOpacity={0.25}
          dot={{ r: 3, fill: color1 }}
        />
        {scores2 && (
          <Radar
            name={key2}
            dataKey={key2}
            stroke={color2}
            strokeDasharray="6 3"
            fill={color2}
            fillOpacity={0.15}
            dot={{ r: 3, fill: color2, strokeDasharray: "0" }}
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        {scores2 && <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />}
      </RadarChart>
    </ResponsiveContainer>
  );
}
