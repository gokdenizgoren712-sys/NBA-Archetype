import { gameClass } from "./sportTheme";
import "./sport-theme.css";
import "./setup.css";

// Oyun alanı sarmalayıcısı: spor teması + mockup tuvali (24px ızgara).
// Kabuk (kenar çubuğu, üst çubuk) sitenin; burası yalnız içerik alanı.
export default function GameStage({ sport, className = "", children, ...rest }) {
  return (
    <div className={gameClass(sport, `sb-stage sb-canvas ${className}`.trim())} {...rest}>
      {children}
    </div>
  );
}
