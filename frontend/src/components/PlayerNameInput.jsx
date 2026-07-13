/**
 * Oyuncu adı autocomplete input.
 * Tüm oyuncu adlarını prop olarak alır, yazarken filtreler, dropdown gösterir.
 */
import { useState, useRef, useEffect } from "react";

export default function PlayerNameInput({ value, onChange, placeholder, allNames, slotLabel }) {
  const [query, setQuery]     = useState(value || "");
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef(null);

  // Dışarı tıklanınca kapat
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Parent'tan gelen value değişirse query'yi güncelle
  useEffect(() => { setQuery(value || ""); }, [value]);

  const q = query.trim().toLowerCase();

  // Fuzzy-ish filtreleme: her kelime ayrı ayrı aranır
  const suggestions = q.length < 2 ? [] : allNames.filter(name => {
    const n = name.toLowerCase();
    // tüm kelimelerin name içinde geçip geçmediğini kontrol et
    return q.split(" ").filter(Boolean).every(word => n.includes(word));
  }).slice(0, 8);

  const select = (name) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    setOpen(true);
  };

  const showDrop = open && suggestions.length > 0;
  const isValid  = allNames.includes(query);

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1.5">
        {slotLabel && (
          <span className="text-[10px] text-gray-600 w-4 shrink-0 font-mono">{slotLabel}</span>
        )}
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => { setFocused(true); if (query.length >= 2) setOpen(true); }}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            className={`w-full bg-surfaceCard border rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none transition-colors ${
              isValid
                ? "border-emerald-600/60 focus:border-emerald-500"
                : query.length > 0
                ? "border-gray-600 focus:border-blue-500"
                : "border-gray-700 focus:border-blue-500"
            }`}
          />
          {/* Validation indicator */}
          {query.length > 0 && (
            <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-xs ${
              isValid ? "text-emerald-500" : "text-gray-600"
            }`}>
              {isValid ? "✓" : "?"}
            </span>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {showDrop && (
        <div className="absolute z-50 left-6 right-0 mt-1 bg-surfaceCard border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((name) => {
            // Eşleşen kısmı bold yap
            const idx = name.toLowerCase().indexOf(q.split(" ")[0]);
            return (
              <button
                key={name}
                onMouseDown={(e) => { e.preventDefault(); select(name); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surfaceCard hover:text-white transition-colors flex items-center gap-2"
              >
                <span className="text-[10px] text-gray-500 font-mono w-4">→</span>
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
