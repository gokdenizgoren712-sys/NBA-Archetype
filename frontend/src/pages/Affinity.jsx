import { useState, useEffect } from "react";
import { api } from "../api";

function cell(value) {
  if (value === "" || value === null || value === undefined) return { bg: "bg-slate-900", text: "text-slate-700", label: "—" };
  const v = Number(value);
  if (isNaN(v)) return { bg: "bg-slate-900", text: "text-slate-700", label: "—" };
  const pct = Math.round(v * 100);
  const bg = v >= 0.7  ? "bg-violet-600/70"
           : v >= 0.6  ? "bg-blue-600/50"
           : v >= 0.5  ? "bg-emerald-700/40"
           : v >= 0.4  ? "bg-slate-700/60"
           :              "bg-red-900/30";
  const text = v >= 0.5 ? "text-white" : "text-slate-400";
  return { bg, text, label: pct };
}

export default function Affinity() {
  const [matrix, setMatrix]   = useState({});
  const [archs, setArchs]     = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.affinity()
      .then(d => { setMatrix(d.matrix || {}); setArchs(d.archetypes || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-12 text-center text-slate-500">Yükleniyor...</div>;
  if (!archs.length) return <div className="p-12 text-center text-slate-500">Affinity verisi bulunamadı.</div>;

  return (
    <div className="p-6">
      <h2 className="text-white font-semibold mb-1">Arketip Uyum Matrisi</h2>
      <p className="text-sm text-slate-400 mb-6">
        Gerçek 5'li lineup verilerinden hesaplanan arketip çifti başarı skorları.
        Yüksek = bu iki arketipin birlikte oynadığı lineup'lar daha başarılı.
      </p>

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-28 p-2"></th>
              {archs.map(a => (
                <th key={a} className="p-2 text-slate-400 font-normal whitespace-nowrap text-center w-24">{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {archs.map(row => (
              <tr key={row}>
                <td className="p-2 text-slate-400 font-medium whitespace-nowrap text-right pr-3">{row}</td>
                {archs.map(col => {
                  const raw = matrix[col]?.[row] ?? matrix[row]?.[col] ?? "";
                  const { bg, text, label } = cell(raw);
                  return (
                    <td key={col} className={`p-2 text-center rounded ${bg}`}>
                      <span className={`${text} font-medium`}>{label}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-violet-600/70"/> Çok güçlü (70+)</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-blue-600/50"/> Güçlü (60-70)</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-emerald-700/40"/> Orta (50-60)</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-slate-700/60"/> Zayıf (40-50)</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-red-900/30"/> Kötü (&lt;40)</div>
      </div>
    </div>
  );
}
