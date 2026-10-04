'use strict';
/* Progress photos, stored only in this browser (IndexedDB database `shtrainer-photos`).
   Photos are shrunk to 1080 px on the long side as JPEG before saving. They are not in JSON backups (too big);
   delete them from the Progress tab or with "Reset everything". */
const Photos = (() => {
  const DB = 'shtrainer-photos', STORE = 'photos', MAX = 1080;
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in self)) { reject(new Error('unavailable')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { const s = req.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('date', 'date'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    });
  }
  // Downscale with a canvas. Falls back to the original file if decoding isn't possible.
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close?.();
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      return blob || file;
    } catch { return file; }
  }
  return {
    async add(date, pose, file) {
      const blob = await shrink(file);
      const rec = { id: `${date}-${pose}-${Date.now().toString(36)}`, date, pose, blob, type: blob.type || 'image/jpeg', at: new Date().toISOString() };
      await tx('readwrite', (s) => s.put(rec));
      return rec;
    },
    async all() { return (await tx('readonly', (s) => s.getAll())) || []; },
    async remove(id) { await tx('readwrite', (s) => s.delete(id)); },
    async clear() { await tx('readwrite', (s) => s.clear()); },
  };
})();
