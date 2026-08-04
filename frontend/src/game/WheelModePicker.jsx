// ── Idle ekranda çark alt-modu seçimi: Round-Based / Pick-Based ─────────────
// Same Screen ve With a Friend arasında paylaşılır — içerik sabit, value/
// onChange dışarıdan geliyor.
import { WheelIcon, LoopIcon } from "./GameIcons";
import "./game.css";

const MODES = [
  { key: "round", Icon: WheelIcon, hex: "#60a5fa", title: "Round-Based",
    desc: "The wheel spins once per round. Both players draft from that same team, in snake order." },
  { key: "pick",  Icon: LoopIcon,  hex: "#FFB11B", title: "Pick-Based",
    desc: "The wheel spins again before every single pick — each player gets their own fresh team." },
];

export default function WheelModePicker({ value, onChange, disabled = false }) {
  return (
    <>
      <div className="g-label px-0.5">Wheel Mode</div>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map(({ key, Icon, hex, title, desc }) => (
          <div key={key}
            onClick={() => !disabled && onChange(key)}
            className={`g-tile${value === key ? " selected" : ""}${disabled ? " disabled" : ""}`}
            style={{ "--accent": hex, "--accent-a": hex + "1f", "--accent-line": hex + "4d" }}>
            <span className="aura-blob" style={{ "--slot-color": hex, right: -22, top: -22, width: 118, height: 84, opacity: value === key ? 0.3 : 0.13 }} />
            <div className="g-tile-title"><span style={{ color: hex }}><Icon size={15} /></span> {title}</div>
            <div className="g-tile-desc">{desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}
