# -*- coding: utf-8 -*-
"""RankIt yuzey denetimi: web ve telefon hangi .ri-* siniflarini kullaniyor,
bu siniflar hangi CSS dosyalarinda tanimli, ve ilgili yuzey o dosyayi
yukluyor mu? Amac: --ri-gold vakasinin ayni sinifi -- sessizce kirik ciken
her yeri bulmak."""
import re, json, io, os
from pathlib import Path

ROOT = Path("C:/Users/ggore/Documents/Nba-Archetypes/frontend/src/rankit")

# Hangi yuzey hangi CSS'i yukluyor (import satirlarindan dogrulandi)
WEB_CSS   = ["rankit.css", "web/rankit-web.css"]
PHONE_CSS = ["rankit.css", "rankit-motion.css", "rankit-filter.css",
             "rankit-next.css", "rankit-v030.css"]
ALL_CSS   = sorted(set(WEB_CSS + PHONE_CSS))

WEB_JSX   = ["web/RankItWeb.jsx", "web/cards.jsx"]
PHONE_JSX = ["RankItPrototype.jsx"]

def read(p):
    f = ROOT / p
    return io.open(f, encoding="utf-8").read() if f.exists() else ""

def classes_used(files):
    """JSX icinde gecen ri-* sinif adlari (className / template literal dahil)."""
    used = set()
    for f in files:
        for m in re.finditer(r'\b(ri-[a-z0-9-]+)', read(f)):
            used.add(m.group(1))
    return used

def classes_defined(css_files):
    """Bir CSS kumesinde SELEKTOR olarak tanimlanan ri-* siniflari."""
    d = {}
    for c in css_files:
        txt = read(c)
        # selektor kismini al (blok icindeki degerleri sayma)
        for block in re.finditer(r'([^{}]+)\{([^}]*)\}', txt):
            sel = block.group(1)
            for m in re.finditer(r'\.(ri-[a-z0-9-]+)', sel):
                d.setdefault(m.group(1), set()).add(c)
    return d

web_used   = classes_used(WEB_JSX)
phone_used = classes_used(PHONE_JSX)
defined    = classes_defined(ALL_CSS)

def analyse(used, loads, label):
    only_elsewhere, undefined_anywhere = [], []
    for cls in sorted(used):
        where = defined.get(cls)
        if not where:
            undefined_anywhere.append(cls)
        elif not (where & set(loads)):
            only_elsewhere.append((cls, sorted(where)))
    return {"surface": label, "usedCount": len(used),
            "styledByFilesNotLoaded": only_elsewhere,
            "noRuleAnywhere": undefined_anywhere}

# Yedeksiz var(--ri-*) kullanan kurallar (jeton eksikse sessizce kirilirlar)
def unfallbacked(css_files):
    out = []
    for c in css_files:
        for block in re.finditer(r'([^{}]+)\{([^}]*)\}', read(c)):
            sel, body = block.group(1).strip(), block.group(2)
            for m in re.finditer(r'var\(\s*(--ri-[a-z-]+)\s*([,)])', body):
                if m.group(2) == ")":
                    out.append((c, sel[:52], m.group(1)))
    return out

report = {
    "web":   analyse(web_used,   WEB_CSS,   "web (.riw)"),
    "phone": analyse(phone_used, PHONE_CSS, "telefon (.rankit-app)"),
    "unfallbackedTokenUses": len(unfallbacked(ALL_CSS)),
    "sharedClasses": len(web_used & phone_used),
}

# -- Ozellik paritesi -------------------------------------------------------
# DIKKAT: `rankitApi.x(` DEGIL `rankitApi.x` araniyor. Kod bazi uclari
# FONKSIYON DEGERI olarak geciriyor (openEntity'deki loader secimi gibi),
# parantezsiz. Cagri arayan ilk surum bu yuzden dort ucu yanlislikla "olu"
# raporladi ve web kapsamini oldugundan iyi gosterdi.
def parity():
    api = read("rankitApi.js")
    methods = sorted(set(re.findall(r"^\s{2}([a-zA-Z][a-zA-Z0-9_]*)\s*:", api, re.M)))

    def refs(files):
        txt = "".join(read(f) for f in files)
        return {m for m in methods if re.search(r"rankitApi\." + m + r"\b", txt)}

    phone = refs(["RankItPrototype.jsx"])
    web = refs(["web/RankItWeb.jsx", "web/cards.jsx"])
    return {
        "capabilities": len(methods),
        "both": sorted(phone & web),
        "onlyPhone": sorted(phone - web),
        "onlyWeb": sorted(web - phone),
        "calledByNeither": sorted(set(methods) - phone - web),
        "webCoveragePct": round(100 * len(phone & web) / max(1, len(phone))),
    }


report["parity"] = parity()
print(json.dumps(report, indent=2, ensure_ascii=False))
