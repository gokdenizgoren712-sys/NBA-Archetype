# -*- coding: utf-8 -*-
"""Test oturumu: sunucunun arka plan isleri KAPALI.

`api.main` import edilince katalog senkronu, canli skor ve canli olay dongusu
thread'leri basliyordu; 12-20 sn sonra GERCEK saglayicilara (FotMob,
EuroLeague) gidip o an hangi testin gecici veritabani aktifse ona
yaziyorlardi. Suite 20 sn'yi gecince bu rastgele bir fikstürü dusurdu
(UNIQUE constraint failed: rankit_competitions.id, 2026-09-22). Testler canli
servise dokunmamali. Bir gelistirici isterse ortam degiskeniyle acabilir.
"""
import os

os.environ.setdefault("RANKIT_BACKGROUND_JOBS", "0")
