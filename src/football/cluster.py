"""
Futbol arketipleri — kümeleme + otomatik etiketleme.

AMAÇ
────
Ground truth listesi HENÜZ YOK. Elle 240 oyuncu etiketlemek yerine, önce
veriye "kaç tane doğal rol var ve bunlar hipotez ettiğimiz arketiplere
benziyor mu" diye soruyoruz. Çıktı, kullanıcının düzelteceği bir ÖNERİ
listesi — düzeltmeler geldiğinde aynı boru hattı doğrulanmış olacak
(bkz. evaluate_against_truth).

BORU HATTI
──────────
1. Faz + lig içinde persantil        — basketbol motorunun aynı uzayı
                                       (engine.compute_percentiles deseni)
2. PCA                               — metrikler ağır korelasyonlu (bütün pas
                                       metrikleri birlikte hareket eder);
                                       decorrelate edilmezse mesafe, en çok
                                       tekrar eden boyuta esir olur
3. Gaussian Mixture (full covariance)— k-means yerine, çünkü:
                                       • roller örtüşür, sert atama yanlış
                                       • YUMUŞAK olasılık, arketip skorlarının
                                         sürekli [0..1] modeline birebir oturur
4. Küme ↔ arketip eşleştirmesi        — Hungarian (global optimum birebir);
                                       küme merkezini imza ağırlıklarıyla
                                       skorlayıp en iyi eşleşmeyi bulur

NEDEN ÖNEMLİ: adım 4 kümelemeyi HİPOTEZE bağlar. Böylece iki şeyi birden
söyleyebiliyoruz — "bu küme senin Regista tanımına benziyor" VE "bu küme
hiçbir arketibe benzemiyor, sözlükte eksik bir rol var".
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from sklearn.decomposition import PCA
from sklearn.mixture import GaussianMixture

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "config"))

from football_signatures import signatures_for, metrics_for  # noqa: E402

RANDOM_STATE = 42


# ── 1. Persantil uzayı ──────────────────────────────────────────────────────
def to_percentiles(df: pd.DataFrame, cols: list) -> pd.DataFrame:
    """Her metriği havuz İÇİNDE [0..1] persantile çevirir (engine.py ile aynı
    yaklaşım: rank(pct=True)). Ham birimler yerine persantil kullanmak hem
    ölçek sorununu hem aykırı değer sorununu birlikte çözer."""
    out = pd.DataFrame(index=df.index)
    for c in cols:
        if c in df.columns:
            out[c] = df[c].rank(pct=True).clip(upper=0.999)
    return out.fillna(0.5)


# ── 2. İmza skoru (küme merkezi → arketip benzerliği) ───────────────────────
def signature_score(vec: pd.Series, sig: dict) -> float:
    """Bir persantil vektörünün bir arketip imzasına uyum skoru [0..1].
    engine.score_component ile aynı mantık: ağırlıklı ortalama, 'higher=False'
    metrikler ters çevrilir, eksik metrikler ağırlıktan düşülür."""
    total_w, score = 0.0, 0.0
    for m, spec in sig["metrics"].items():
        if m not in vec.index:
            continue
        v = vec[m]
        if not spec["higher"]:
            v = 1.0 - v
        score += spec["w"] * v
        total_w += spec["w"]
    return score / total_w if total_w else 0.0


# ── 3. Ana boru hattı ───────────────────────────────────────────────────────
def cluster_phase(df: pd.DataFrame, phase: str, n_components: int = None,
                  pca_var: float = 0.80, covariance: str = "tied",
                  random_state: int = RANDOM_STATE):
    """Tek (lig, faz) havuzunu kümeler ve kümeleri arketiplerle eşleştirir.

    Dönüş: (sonuç DataFrame'i, teşhis sözlüğü)
      sonuç: her oyuncu satırına cluster, önerilen arketip, güven, ikinci seçenek
      teşhis: küme↔arketip eşleşme kalitesi, eksik/zayıf arketip sinyalleri
    """
    sigs = signatures_for(phase)
    cols = [c for c in metrics_for(phase) if c in df.columns]
    if len(cols) < 4:
        raise ValueError(f"{phase}: yeterli metrik yok ({len(cols)})")

    k = n_components or len(sigs)
    if len(df) < k * 4:
        raise ValueError(f"{phase}: {len(df)} oyuncu, {k} küme için çok az")

    pct = to_percentiles(df, cols)

    # PCA — korelasyonlu metrikleri ayrıştır, gürültüyü at
    pca = PCA(n_components=pca_var, svd_solver="full", random_state=random_state)
    Z = pca.fit_transform(pct.values)

    # covariance='tied': tüm kümeler tek bir kovaryans matrisi paylaşır.
    # 'full' gerçek PL verisinde AŞIRI parametreli çıktı — her oyuncuya 1.00
    # güven veriyordu, yani "bu oyuncu iki rol arasında" sinyali tamamen
    # ölüydü (BIC de 'tied'ı tercih etti: 1949 → 1014). 'tied' hem kümeleri
    # ayırıyor hem olasılıkları kalibre bırakıyor.
    gmm = GaussianMixture(
        n_components=k, covariance_type=covariance, random_state=random_state,
        n_init=10, reg_covar=1e-4,
    )
    labels = gmm.fit_predict(Z)
    proba = gmm.predict_proba(Z)

    # Küme merkezleri PERSANTİL uzayında (PCA'da değil) — imzalarla
    # kıyaslanabilmesi için geri dönmek şart
    centroids = pd.DataFrame(
        [pct.values[labels == c].mean(axis=0) for c in range(k)], columns=cols
    )

    # Küme × arketip uyum matrisi
    arch_names = list(sigs)
    fit = np.zeros((k, len(arch_names)))
    for ci in range(k):
        for ai, name in enumerate(arch_names):
            fit[ci, ai] = signature_score(centroids.iloc[ci], sigs[name])

    # POZİSYON MASKESİ — mimarinin merkezinde olan kısıt, eşleştirmede de
    # uygulanmalı. Defans fazı stoperi ve beki aynı havuzda tutuyor (metrik
    # dağılımı sağlıklı kalsın diye) ama "Overlapping Fullback" ile "Stopper"
    # aynı kümeye aday olmamalı. Sert filtre yerine YUMUŞAK ceza: pozisyonu
    # hiç uymayan eşleşme neredeyse imkânsızlaşır ama veri güçlü konuşursa
    # (ör. bir stoper gerçekten bek gibi oynuyorsa) tamamen kapanmaz.
    pos_compat = np.ones((k, len(arch_names)))
    if "POSITION" in df.columns:
        for ci in range(k):
            member_pos = df.loc[labels == ci, "POSITION"]
            if member_pos.empty:
                continue
            for ai, name in enumerate(arch_names):
                allowed = sigs[name].get("positions", ())
                if allowed:
                    pos_compat[ci, ai] = float(member_pos.isin(allowed).mean())
        fit = fit * (0.25 + 0.75 * pos_compat)

    # Hungarian: global optimum birebir eşleşme (açgözlü eşleştirme iki kümeyi
    # aynı arketibe verip üçüncüsünü boşta bırakabiliyordu)
    rows, cols_idx = linear_sum_assignment(-fit)
    cluster_to_arch = {int(r): arch_names[int(c)] for r, c in zip(rows, cols_idx)}

    res = df.copy()
    res["cluster"] = labels
    res["suggested_archetype"] = [cluster_to_arch.get(int(l), "?") for l in labels]
    res["cluster_confidence"] = proba.max(axis=1)

    # İkinci en olası küme → "bu oyuncu iki rol arasında" sinyali
    second = np.argsort(-proba, axis=1)[:, 1] if k > 1 else np.zeros(len(res), int)
    res["alt_archetype"] = [cluster_to_arch.get(int(s), "?") for s in second]
    res["alt_confidence"] = np.sort(proba, axis=1)[:, -2] if k > 1 else 0.0

    # ── Teşhis: sözlüğün kendisi hakkında ne öğrendik? ──
    matched = {int(r): float(fit[int(r), int(c)]) for r, c in zip(rows, cols_idx)}
    diag = {
        "phase": phase,
        "n_players": len(df),
        "n_clusters": k,
        "n_metrics": len(cols),
        "pca_components": int(pca.n_components_),
        "pca_explained": float(pca.explained_variance_ratio_.sum()),
        "cluster_sizes": {int(c): int((labels == c).sum()) for c in range(k)},
        "match_quality": {cluster_to_arch[c]: round(q, 3) for c, q in matched.items()},
        # Zayıf eşleşme = bu küme hiçbir hipotez arketibe benzemiyor →
        # sözlükte EKSİK bir rol olabilir (kullanıcı geri bildirimi için altın sinyal)
        "weak_matches": sorted(
            [(cluster_to_arch[c], round(q, 3)) for c, q in matched.items() if q < 0.55],
            key=lambda x: x[1],
        ),
        # Bir arketibe iki küme de yakınsa o arketip BÖLÜNMELİ olabilir
        "contested_archetypes": _contested(fit, arch_names, cluster_to_arch),
        "unused_archetypes": [a for a in arch_names if a not in cluster_to_arch.values()],
    }
    return res, diag


def _contested(fit, arch_names, cluster_to_arch, margin: float = 0.03):
    """Bir arketip birden fazla kümenin de en iyi tercihiyse, o rol muhtemelen
    tek bir arketip olarak fazla geniş — bölünmesi gerekebilir."""
    out = []
    for ai, name in enumerate(arch_names):
        best = np.argsort(-fit[:, ai])[:2]
        if len(best) < 2:
            continue
        if fit[best[0], ai] - fit[best[1], ai] < margin and fit[best[0], ai] > 0.55:
            out.append(name)
    return out


# ── 4. Temsilci oyuncu seçimi ───────────────────────────────────────────────
def pick_representatives(res: pd.DataFrame, n: int = 12, ambiguous: int = 2) -> pd.DataFrame:
    """Ground truth taslağı için n oyuncu seç.

    'En yüksek dakikalı n oyuncu' YANLIŞ olurdu — istediğimiz, her arketibi
    en iyi TEMSİL eden oyuncular. Ayrıca bilerek birkaç BELİRSİZ vaka
    ekliyoruz (iki role de yakın): kullanıcının futbol bilgisinin en çok
    değer kattığı yer tam orası, ve sözlüğün sınırlarını orası test eder.
    """
    clear = res.sort_values("cluster_confidence", ascending=False)
    picks, per_cluster = [], {}
    n_clear = max(1, n - ambiguous)

    # Kümeler arasında orantılı dağıt — büyük küme daha çok temsilci alsın
    sizes = res["cluster"].value_counts()
    quota = {c: max(1, round(n_clear * sz / len(res))) for c, sz in sizes.items()}

    for _, row in clear.iterrows():
        c = row["cluster"]
        if per_cluster.get(c, 0) >= quota.get(c, 1):
            continue
        picks.append(row)
        per_cluster[c] = per_cluster.get(c, 0) + 1
        if len(picks) >= n_clear:
            break

    # Belirsizler: en yüksek ve ikinci olasılık birbirine en yakın olanlar
    chosen = {r["PLAYER_ID"] for r in picks}
    amb = res[~res["PLAYER_ID"].isin(chosen)].copy()
    if len(amb):
        amb["gap"] = amb["cluster_confidence"] - amb["alt_confidence"]
        picks += [r for _, r in amb.nsmallest(ambiguous, "gap").iterrows()]

    out = pd.DataFrame(picks)
    out["pick_reason"] = ["prototype"] * min(n_clear, len(out)) + \
                         ["ambiguous"] * max(0, len(out) - n_clear)
    return out.head(n)


# ── 5. Doğrulama (kullanıcı düzeltmeleri geldiğinde) ────────────────────────
def evaluate_against_truth(res: pd.DataFrame, truth: dict) -> dict:
    """truth: {PLAYER_ID: 'doğru arketip'} — kullanıcının düzelttiği liste.

    Kümelemenin kendisini (ARI) ve arketip atamasının doğruluğunu ayrı ayrı
    ölçer. Bu ayrım önemli: kümeleme doğru grupları bulmuş ama İSİMLERİ yanlış
    eşleştirmiş olabilir — ilki veri sorunu, ikincisi imza ağırlığı sorunu,
    çözümleri farklı.
    """
    from sklearn.metrics import adjusted_rand_score

    sub = res[res["PLAYER_ID"].isin(truth)].copy()
    if sub.empty:
        return {"error": "eşleşen oyuncu yok"}
    sub["truth"] = sub["PLAYER_ID"].map(truth)

    acc = float((sub["suggested_archetype"] == sub["truth"]).mean())
    top2 = float(((sub["suggested_archetype"] == sub["truth"]) |
                  (sub["alt_archetype"] == sub["truth"])).mean())
    ari = float(adjusted_rand_score(sub["truth"], sub["cluster"]))

    per_arch = (sub.assign(ok=sub["suggested_archetype"] == sub["truth"])
                   .groupby("truth")["ok"].agg(["mean", "count"])
                   .rename(columns={"mean": "accuracy", "count": "n"}))
    return {
        "n_labelled": len(sub),
        "label_accuracy": round(acc, 3),
        "top2_accuracy": round(top2, 3),
        "cluster_ari": round(ari, 3),   # isimden bağımsız gruplama kalitesi
        "per_archetype": per_arch.round(3).to_dict("index"),
        "confusions": (sub[sub["suggested_archetype"] != sub["truth"]]
                       .groupby(["truth", "suggested_archetype"]).size()
                       .sort_values(ascending=False).head(10).to_dict()),
    }
