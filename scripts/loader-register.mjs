// backtest.mjs'i `node --import ./scripts/loader-register.mjs scripts/backtest.mjs`
// ile çalıştırınca resolve hook'u kaydeder (uzantısız import çözümü).
import { register } from "node:module";
register("./resolve-extless.mjs", import.meta.url);
