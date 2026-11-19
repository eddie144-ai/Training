'use strict';
/* Progress photos, stored only in this browser (IndexedDB database `gymfuel-photos`).
   Photos are shrunk to 1080 px on the long side as JPEG before saving. The picture itself is not in JSON backups;
   the date, pose and id are. Delete them from Body → Measurements or with "Delete all data". */
const Photos = (() => {
  const DB = 'gymfuel-photos', STORE = 'photos', MAX = 1080;
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in self)) { reject(new Error('unavailable')); return; }
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) { const s = db.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('date', 'date'); }
        if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  async function tx(mode, fn, store = STORE) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const out = fn(t.objectStore(store));
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
    async get(id) { return (await tx('readonly', (s) => s.get(id))) || null; },
    async remove(id) { await tx('readwrite', (s) => s.delete(id)); },
    async clear() { await tx('readwrite', (s) => s.clear()); },
    // Exercise and machine thumbnails. The file stays on the phone; backups keep only the id.
    async addThumb(id, file) {
      const blob = await shrink(file);
      const rec = { id: String(id).slice(0, 80), blob, type: blob.type || 'image/jpeg', at: new Date().toISOString() };
      await tx('readwrite', (s) => s.put(rec), 'thumbs');
      return rec;
    },
    async getThumb(id) { return (await tx('readonly', (s) => s.get(id), 'thumbs')) || null; },
    async removeThumb(id) { await tx('readwrite', (s) => s.delete(id), 'thumbs'); },
    async clearThumbs() { await tx('readwrite', (s) => s.clear(), 'thumbs'); },
    // Copies progress photos from Iron & Eggs (same site, its own database). Returns how many were added.
    async importFrom(name) {
      const src = await new Promise((resolve) => {
        const req = indexedDB.open(name);
        req.onupgradeneeded = () => { req.transaction.abort(); resolve(null); }; // it doesn't exist: don't create it
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (!src) return 0;
      if (!src.objectStoreNames.contains(STORE)) { src.close(); return 0; }
      const recs = await new Promise((resolve) => { const r = src.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); });
      src.close();
      const have = new Set((await this.all()).map((x) => x.id));
      const add = recs.filter((x) => x.pose !== 'background' && x.blob && !have.has(x.id));
      if (add.length) await tx('readwrite', (s) => { for (const x of add) s.put(x); });
      return add.length;
    },
  };
})();
