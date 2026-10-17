// Separate stores keep large image data out of frequent scene writes.
let database;
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('whiteboard-recovery', 1);
    request.onupgradeneeded = () => {
      for (const name of ['pending', 'images', 'conflicts']) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local recovery storage is blocked'));
  }).catch(error => { database = null; throw error; });
  return database;
}
export async function storageRead(name) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function storageWrite(name, records = [], remove = []) {
  if (!records.length && !remove.length) return;
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite'), store = tx.objectStore(name);
    for (const record of records) store.put(record);
    for (const id of remove) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local save failed'));
  });
}
