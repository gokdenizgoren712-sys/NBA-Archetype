# -*- coding: utf-8 -*-
"""Fantezi pozisyon uygunluğu için elle düzeltmeler.

src/fantasy/positions.py kural tabanlı bir tahmin yapıyor (NBA'in G/F/C
kodu + geçen sezonun asist/ribaund profili). Yahoo'nun gerçek uygunluk
listesi bundan sapabilir; Yahoo API bağlanana kadar (docs/FANTASY_PLAN.md
Faz 5) bilinen sapmalar buraya yazılır.

Biçim: PLAYER_ID -> Yahoo pozisyon kodları listesi. Her girdiye kısa bir
gerekçe yorumu ekle (hangi kaynakta görüldü, ne zaman).
"""

POSITION_OVERRIDES: dict[int, list[str]] = {
}
