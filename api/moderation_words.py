# -*- coding: utf-8 -*-
"""Gönderim anı içerik filtresi (docs/RANKIT_STORE_BLOCKERS_PLAN.md B4).

Mağaza şartı "zararlı içerik filtresi": inceleme, yanıt, liste ve sohbet
metni kaydedilmeden önce buradan geçer; eşleşme varsa gönderim reddedilir.

Liste BİLİNÇLİ OLARAK DAR: hakaret/nefret sözleri, cinsel küfür ve en ağır
küfürler. "Berbat maç", "shit", "damn" gibi hafif ifadeler geçer — maç
konuşması bunlarsız olmaz. Filtre ilk kapı; gerisi şikâyet + moderasyon.

Eşleştirme KELİME bazlı (alt dize değil): "Scunthorpe", "classic", "assist",
"Dick Advocaat" takılmaz. Türkçe harfler katlanmaz — katlansaydı "sıkıcı"
(boring) "sik" köküne düşerdi; aksansız yazımlar listede ayrıca var.
Genişletmek: WORDS'e tam kelime, STEMS'e ek alan kök (ör. "orospuluk")
ekle ve tests/test_rankit_moderation.py'ye hem yakalanan hem geçen bir örnek
yaz (yanlış pozitif maliyeti gerçek kullanıcı kaybıdır).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional

# Tam kelime eşleşmesi (ekli halleri ayrıca yazılı).
WORDS = frozenset({
    # TR — küfür / cinsel
    # "amina"/"amini" yok: Amina, Amini gerçek adlar. "sik" yok: aksansız "sık"
    # (sik sik gol atiyor = sık sık).
    "amk", "amq", "aq", "amcık", "amcik", "amına", "amını",
    "siktir", "siktirgit", "siktiğim", "siktigim", "sikerim", "sikeyim",
    "sikiyim", "sikicem", "sikim", "sikimi", "sikime", "sikimin", "sikik",
    "yarak", "yarrak", "yarağı", "yarragi", "dalyarak", "dalyarrak",
    "göt", "götveren", "götlek", "götoş",
    "ananı", "anani", "ananızı", "ananizi", "bacını", "bacini",
    "piç", "piçler", "piçlik", "puşt", "pust", "gavat",
    "kaltak", "sürtük", "surtuk",
    # TR — nefret / aşağılama
    "ibne", "ibneler", "ibnelik",
    # EN — küfür / cinsel
    "fck", "fcking", "fckn", "fuk", "fuking", "fkn",
    "cunt", "cunts", "twat", "twats", "whore", "whores", "slut", "sluts",
    # "cock" yok (horoz / Tottenham'ın arması); "wank" kök değil: Wankdorf
    # (Bern'deki stadyum).
    "bitch", "bitches", "dickhead", "dickheads", "cocksucker",
    "pussy", "motherfucker", "wank", "wanker", "wankers", "wanking",
    # EN — nefret / aşağılama
    "nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "fag", "fags",
    "kike", "kikes", "spic", "spics", "tranny", "trannies", "paki", "pakis",
    "retard", "retards", "retarded", "coon", "coons",
})

# Kök eşleşmesi: kelime bununla BAŞLIYORSA. Yalnız meşru bir kelimenin
# başlamadığı kökler (ör. "sik" değil: "sikici" = aksansız "sıkıcı").
STEMS = (
    "orospu", "amınakoy", "aminakoy", "amınakoyim", "yarrak", "pezevenk",
    "kahpe", "yavşak", "yavsak", "ibne", "siktir", "sikeyim", "sikerim",
    "fuck", "motherfuck", "nigger", "faggot", "cocksuck",
)

# Leet yazımı: "f4ggot", "0rospu". Rakamlar skorlarda da geçer ("3-1") ama
# tek harfli parçalar listeyle eşleşmez.
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
                       "@": "a", "$": "s"})

# Bağlantı: şema, www ya da yaygın uzantılı çıplak alan adı. Puanlar ("4.5")
# harf uzantısı olmadığı için takılmaz.
_LINK = re.compile(
    r"(https?://|www\.|\b[a-z0-9][a-z0-9-]*\.(com|net|org|io|gg|me|ly|co|tv|app|xyz|link|site|"
    r"shop|info|biz|tr|ru|cn|online|live|bet|win|club|top|click|page|to)\b)",
    re.IGNORECASE,
)

MESSAGE_WORDS = "This contains language that isn't allowed"
MESSAGE_LINKS = "Links aren't allowed here"


def _collapse(token: str) -> str:
    """Üç ve daha uzun harf tekrarını teke indirir: "fuuuck" -> "fuck".

    İkili tekrar dokunulmaz ("Sikkim" "sikim" olmasın). YALNIZ gelen kelimeye
    uygulanır, listeye değil: listeyi katlamak "nigger"i "niger"e çevirip
    Nijerya'yı engellerdi."""
    return re.sub(r"(.)\1{2,}", r"\1", token)


def _tokens(text: str) -> list[str]:
    # Türkçe büyük İ Python'da "i̇" (i + birleşik nokta) olur: önce çevir.
    t = text.replace("İ", "i").lower()
    # Tam genişlik / süslü harfler (ｆｕｃｋ, 𝐟𝐮𝐜𝐤) sade harfe; Türkçe harfler
    # (ç ş ğ ı ö ü) NFKC'de korunur.
    t = unicodedata.normalize("NFKC", t).translate(_LEET)
    return re.findall(r"[^\W\d_]+", t)


def blocked_word(text: Optional[str]) -> Optional[str]:
    """Metindeki ilk yasaklı kelime (yoksa None). Testler ve loglar için."""
    for token in _tokens(text or ""):
        c = _collapse(token)
        if token in WORDS or c in WORDS or token.startswith(STEMS) or c.startswith(STEMS):
            return token
    return None


def has_link(text: Optional[str]) -> bool:
    return bool(_LINK.search(text or ""))


def problem(text: Optional[str], *, allow_links: bool = True) -> Optional[str]:
    """Gönderimi reddetme sebebi (kullanıcıya gösterilecek İngilizce cümle) ya da None."""
    if blocked_word(text):
        return MESSAGE_WORDS
    if not allow_links and has_link(text):
        return MESSAGE_LINKS
    return None
