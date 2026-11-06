// Lokale Speicherung auf dem Gerät (IndexedDB). Nichts davon verlässt das iPhone –
// außer den Chat-Nachrichten, die an den KI-Anbieter geschickt werden.
const DB_NAME = "chat18";
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Speichern abgebrochen"));
  });
}

export const kv = {
  get: (key) => tx("kv", "readonly", (s) => s.get(key)),
  set: (key, value) => tx("kv", "readwrite", (s) => s.put(value, key)),
};

export const chatsDb = {
  all: () => tx("chats", "readonly", (s) => s.getAll()),
  get: (id) => tx("chats", "readonly", (s) => s.get(id)),
  put: (chat) => tx("chats", "readwrite", (s) => s.put(chat)),
  remove: (id) => tx("chats", "readwrite", (s) => s.delete(id)),
  clear: () => tx("chats", "readwrite", (s) => s.clear()),
};

export async function clearAll() {
  await tx("kv", "readwrite", (s) => s.clear());
  await chatsDb.clear();
}

// Bittet iOS, die Daten nicht automatisch zu löschen (bei Home-Bildschirm-Apps meist gewährt).
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {}
}
