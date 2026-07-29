import { useRef, useState } from "react";
import { Search } from "lucide-react";

/* Borderless, icon-first search — collapsed to just a glowing icon at rest,
   expands (Finder-style: icon slides to the left edge, field grows to the
   right, whole thing lifts forward) on focus or when it has a value. */
export default function AuraSearch({ value, onChange, placeholder = "Search...", className = "" }) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const expanded = focused || !!value;

  return (
    <div
      className={`aura-search ${expanded ? "expanded" : ""} ${className}`}
      onClick={() => inputRef.current?.focus()}
    >
      <span className="aura-search-glow" />
      <Search size={15} className="aura-search-icon" />
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="aura-search-input"
      />
    </div>
  );
}
