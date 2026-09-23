/* API ve depolama enjekte edilir: ag/kota/oturum testleri gercek veriye dokunmaz. */
export function createRatingQueue({ storage, account, api, changed = () => {}, now = () => new Date().toISOString(), id = () => crypto.randomUUID() }) {
  const key = () => `rankit:outbox:${account()}`;
  function read(k = key()) {
    const raw = storage.getItem(k);
    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error("Saved ratings could not be read. Do not clear app data.");
    return items;
  }
  function write(items, k = key()) {
    // Basarisiz kalici yazma ASLA queued basarisina donusmez.
    storage.setItem(k, JSON.stringify(items));
    changed();
  }
  function enqueue(payload) {
    const k = key();
    const items = read(k);
    const previous = items.find(x => x.matchId === payload.matchId);
    const editingAcknowledged = payload.diary.entry_id && (payload.diary.entry_id === previous?.receipt?.entry_id || payload.diary.entry_id === previous?.diary?.entry_id);
    if (!editingAcknowledged && previous?.diary?.is_rewatch && (["syncing", "uncertain"].includes(previous.state) || previous.completed?.includes("diary"))) {
      throw new Error("Check your diary before retrying this rewatch; its save could already be complete.");
    }
    const item = { ...payload, revision: id(), state: "pending", completed: [],
      diary: { ...payload.diary, rated_at: now() }, queuedAt: now() };
    write([...items.filter(x => x.matchId !== item.matchId), item], k);
    return item;
  }
  let flushing;
  function flush({ retryFailed = false } = {}) {
    if (flushing) return flushing;
    const k = key();
    // Ilk network olayi gelmeden kilidi kur.
    flushing = Promise.resolve().then(async () => {
      let sent = 0, rejected = 0;
      const receipts = [];
      for (const snapshot of read(k)) {
        if (key() !== k) break;
        if (snapshot.state === "uncertain") continue;
        if (!retryFailed && ["auth-required", "retryable-error", "rejected"].includes(snapshot.state)) continue;
        const item = { ...snapshot, completed: snapshot.completed || [] };
        const current = () => key() === k && read(k).some(x => x.matchId === item.matchId && x.revision === item.revision);
        const persist = () => write(read(k).map(x => x.matchId === item.matchId && x.revision === item.revision ? item : x), k);
        if (item.diary.is_rewatch && !item.diary.entry_id && item.state === "syncing" && !item.completed.includes("diary")) {
          item.state = "uncertain"; persist(); continue;
        }
        const steps = [
          ["diary", () => api.log(item.diary)],
          ["potm", () => item.potmId ? api.potm(item.matchId, item.potmId) : Promise.resolve()],
          ["respect", () => api.respect(item.matchId, item.respectIds || [])],
        ];
        let stepName;
        try {
          for (const [name, send] of steps) {
            if (!current()) break;
            if (item.completed.includes(name)) continue;
            stepName = name;
            item.state = "syncing"; persist();
            const response = await send();
            if (!current()) break;
            if (name === "diary") item.receipt = response || null;
            item.completed = [...item.completed, name]; persist();
          }
          if (current() && item.completed.length === steps.length) {
            write(read(k).filter(x => !(x.matchId === item.matchId && x.revision === item.revision)), k);
            sent++;
            receipts.push({ revision:item.revision, receipt:item.receipt || null });
          }
        } catch (error) {
          if (!current()) break;
          const uncertainRewatch = item.diary.is_rewatch && !item.diary.entry_id && stepName === "diary" && (!error?.status || error.status >= 500);
          item.state = uncertainRewatch ? "uncertain" : error?.status === 401 || error?.status === 403 ? "auth-required"
            : error?.offline ? "pending"
            : error?.status >= 400 && error.status < 500 && error.status !== 429 ? "rejected" : "retryable-error";
          item.error = error?.message || "Could not upload";
          persist();
          if (!error?.offline) rejected++;
          break;
        }
      }
      return { sent, rejected, receipts, left: read(k).length };
    }).finally(() => { flushing = null; });
    return flushing;
  }
  return { read, enqueue, flush };
}
