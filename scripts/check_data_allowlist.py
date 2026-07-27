"""
data/*.parquet allowlist sağlık kontrolü.

Amaç: kodun (api/, src/, config/) okuduğu data/*.parquet dosyalarından
hangilerinin .gitignore'daki `data/*` + istisna-listesi yüzünden git'e hiç
girmediğini (dolayısıyla deploy image'ında hiç bulunmayacağını) tespit etmek.
Bu, FG3_PCT bug'ının kök nedeniydi (data/2025-26__player_Base.parquet
allowlist'te yoktu, Railway'de hiç yoktu, merge sessizce atlanıyordu).

Kullanım:
    python scripts/check_data_allowlist.py

Not: sadece kod içinde SABİT (dinamik olmayan, f-string interpolasyonu
içermeyen) dosya adlarını statik olarak tespit edebilir. `f"{season}__..."`
gibi sezon-parametreli adlar "dinamik" olarak işaretlenir, elle kontrol
gerekir.
"""
import re
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent

SCAN_DIRS = ["api", "src", "config"]
PARQUET_RE = re.compile(r'''["']([A-Za-z0-9_.\-]+\.parquet)["']''')
DYNAMIC_HINT_RE = re.compile(r'''f["'][^"']*\{[^"']*\.parquet["']''')


def find_referenced_filenames() -> tuple[set[str], set[str]]:
    """Kod içinde geçen .parquet dosya adlarını döner: (sabit, dinamik-şüpheli)."""
    static_names: set[str] = set()
    dynamic_lines: set[str] = set()

    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for py in base.rglob("*.py"):
            text = py.read_text(encoding="utf-8", errors="ignore")
            for line in text.splitlines():
                if ".parquet" not in line:
                    continue
                if DYNAMIC_HINT_RE.search(line):
                    dynamic_lines.add(f"{py.relative_to(ROOT)}: {line.strip()}")
                    continue
                for m in PARQUET_RE.finditer(line):
                    static_names.add(m.group(1))

    return static_names, dynamic_lines


def git_ignored(rel_path: str) -> bool:
    """git check-ignore ile dosyanın gerçekten .gitignore tarafından hariç
    tutulup tutulmadığını (allowlist istisnaları dahil doğru şekilde) sorar."""
    res = subprocess.run(
        ["git", "check-ignore", "-q", rel_path],
        cwd=ROOT, capture_output=True,
    )
    return res.returncode == 0  # 0 = ignored


def main() -> int:
    static_names, dynamic_lines = find_referenced_filenames()

    problems = []
    for name in sorted(static_names):
        rel = f"data/{name}"
        local_exists = (ROOT / "data" / name).exists()
        ignored = git_ignored(rel)
        status = "IGNORED (deploy'a gitmez!)" if ignored else "tracked/allowlisted"
        marker = "!! " if ignored else "   "
        print(f"{marker}{rel:55s} local={'var' if local_exists else 'YOK':4s}  git={status}")
        if ignored:
            problems.append(rel)

    if dynamic_lines:
        print(f"\n{len(dynamic_lines)} dinamik (sezon-parametreli) referans bulundu, "
              f"elle kontrol gerekir:")
        for line in sorted(dynamic_lines):
            print(f"   {line}")

    print()
    if problems:
        print(f"SONUÇ: {len(problems)} dosya kodda referans ediliyor ama "
              f".gitignore tarafından hariç tutuluyor — deploy'da eksik olacak:")
        for p in problems:
            print(f"   - {p}")
        print("\nDüzeltme: ya .gitignore'a `!{}` istisnası ekle, ya da kodu "
              "bu dosyaya runtime bağımlılığı olmayacak şekilde değiştir "
              "(bkz. score_compat.py FG3_PCT düzeltmesi).".format("data/<dosya>"))
        return 1

    print("SONUÇ: statik olarak tespit edilen tüm .parquet referansları "
          "allowlisted/tracked. (Dinamik referansları elle kontrol etmeyi unutma.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
