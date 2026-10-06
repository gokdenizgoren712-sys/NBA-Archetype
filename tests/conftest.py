# -*- coding: utf-8 -*-
"""Test oturumu: sunucunun arka plan isleri KAPALI, veritabani GECICI.

1) Arka plan isleri
`api.main` import edilince katalog senkronu, canli skor ve canli olay dongusu
thread'leri basliyordu; 12-20 sn sonra GERCEK saglayicilara (FotMob,
EuroLeague) gidip o an hangi testin gecici veritabani aktifse ona
yaziyorlardi. Suite 20 sn'yi gecince bu rastgele bir fikstürü dusurdu
(UNIQUE constraint failed: rankit_competitions.id, 2026-09-22). Testler canli
servise dokunmamali. Bir gelistirici isterse ortam degiskeniyle acabilir.

2) Veritabani
Test dosyalarinin cogu kendi gecici DB_PATH'ini MODUL ICINDE, import sirasinda
ataniyor. Ama api.db DB_PATH'i ilk import edildiginde bir kez okuyor: toplu
kosuda bir test dosyasi uygulamayi kendininkinden ONCE import ederse DB_PATH
hic atanmamis olur ve api.db varsayilana, yani GELISTIRICININ GERCEK
data/app.db'sine duser. Bu gercekten oldu: tam suite kosulari yerel veritabanina
yuzlerce test kullanicisi yazdi ve bir testin `DELETE FROM saved_rosters`
satirlari oradaki kayitli kadrolari sildi.

Burada, hicbir test modulu import edilmeden ONCE, tum oturum icin gecici bir
dosya atiyoruz. Modullerin kendi atamalari (api.db zaten import edildiyse) etkisiz
kalir, hepsi ayni gecici veritabanini paylasir. Atama KOSULSUZ: ortamda kalmis
bir DB_PATH (ornegin gelistiricinin kabuğunda) testleri gercek veritabanina
yonlendirmesin. Bilerek gercek veritabaniyla kosmak isteyen PYTEST_REAL_DB=1
verir; bunu yapmak icin cok iyi bir sebebin olmali.
"""
import os
import tempfile
from pathlib import Path

os.environ.setdefault("RANKIT_BACKGROUND_JOBS", "0")

if not os.environ.get("PYTEST_REAL_DB"):
    os.environ["DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="pa_pytest_")) / "test.db")
