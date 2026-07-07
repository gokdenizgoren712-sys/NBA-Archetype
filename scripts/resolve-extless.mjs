// Node ESM resolve hook: uzantısız relative import'ları (./seasonSim → ./seasonSim.js)
// çözer. Frontend Vite ile çalıştığından oyun modülleri uzantısız import kullanıyor;
// Node bunları doğrudan yükleyemez. Bu hook kaynağa dokunmadan çözer.
export async function resolve(specifier, context, nextResolve) {
  if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?jsx?$|\.json$/.test(specifier)) {
    try {
      return await nextResolve(specifier + ".js", context);
    } catch { /* düş, orijinali dene */ }
  }
  return nextResolve(specifier, context);
}
