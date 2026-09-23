# Test fixture'ları

## `web/` — web yüzeylerinin altın örnekleri (üretilen)

`pytest tests/test_web_contracts.py` koşunca `web/dolu/*.json` ve `web/bos/*.json`
yeniden yazılır: her web ekranının okuduğu uçların gerçek yanıtları, dolu bir
hesapta ve boş bir hesapta (`8d` durumları).

Ne için: frontend izole görünüm testleri sunucu ayağa kaldırmadan gerçek yanıt
şekliyle çalışabilsin — uydurma veri yazmadan. Örnek:

```js
const home = JSON.parse(fs.readFileSync("tests/fixtures/web/dolu/home.json", "utf8"));
```

Dosyalar `.gitignore`'da: zaman damgaları (`starts_at`, `created_at`) her
koşuda kaydığı için depoya girmezler. İhtiyaç duyulduğunda yukarıdaki komutla
üretilir. Sözleşmenin kendisi testte kilitlidir; bu JSON'lar yalnız örnektir.
