import { useCallback, useEffect, useRef, useState } from 'react';
import { storageRead, storageWrite } from './boardStorage';
import { stamp, isSameEdit, mergeRemote, makeBatch } from './syncModel';

export function useBoardSync(options) {
  const latest = useRef(options); latest.current = options;
  const localTimer=useRef(null);
  const seen = useRef(new Map()), writes = useRef(Promise.resolve());
  const [ready, setReady] = useState(false), [conflicts, setConflicts] = useState([]);
  const [storageError, setStorageError] = useState(false);
  const enqueue = useCallback((name, values, remove) => {
    const task = writes.current.catch(() => {}).then(() => storageWrite(name, values, remove));
    writes.current = task;
    task.then(() => setStorageError(false), () => setStorageError(true));
    return task;
  }, []);
  const observe = useCallback(elements => {
    const { loaded, applying, pending, setStatus } = latest.current;
    const changed = [];
    for (const e of elements) {
      const key = stamp(e);
      if (seen.current.get(e.id) === key) continue;
      seen.current.set(e.id, key);
      if (loaded.current && !applying.current) { pending.current.set(e.id, e); changed.push(e); }
    }
    if (changed.length) {
      if(!localTimer.current)localTimer.current=setTimeout(()=>{localTimer.current=null;enqueue('pending',structuredClone([...latest.current.pending.current.values()])).catch(()=>{})},100);
      setStatus('جارٍ الحفظ…');
    }
  }, [enqueue]);
  const apply = useCallback(elements => {
    const { api, applying, lockedSnapshot } = latest.current;
    if (!api) return;
    for (const e of elements) seen.current.set(e.id, stamp(e));
    applying.current = true;
    lockedSnapshot.current = new Map();
    try { api.updateScene({ elements }); } finally { queueMicrotask(() => { applying.current = false; }); }
  }, []);
  const { api, authorized } = options;
  useEffect(() => {
    if (!api || !authorized) { setReady(false); return; }
    let active = true, pulling = false, pushing = false, initialized = false;
    let cursor = null, readTimer, writeTimer, failures = 0;
    const controller = new AbortController();
    const signal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]);
    const { pending, loaded, setStatus } = latest.current;
    seen.current.clear(); loaded.current = false;
    async function initialize() {
      try {
        const [edits, images, recovered] = await Promise.all([storageRead('pending'), storageRead('images'), storageRead('conflicts')]);
        if (!active) return;
        edits.forEach(e => pending.current.set(e.id, e));
        if (images.length) api.addFiles(images);
        setConflicts(recovered);
      } catch { setStorageError(true); }
      if (!active) return;
      initialized = true;
      pull();
      writeTimer = setTimeout(push, 900);
    }
    async function pull() {
      if (!active || pulling || !initialized) return;
      if (document.hidden && loaded.current) { readTimer = setTimeout(pull, 15000); return; }
      pulling = true;
      try {
        const response = await fetch('/api/board' + (cursor === null ? '' : '?since=' + cursor), { cache: 'no-store', signal: signal() });
        if (!response.ok) throw Error(response.status === 401 ? 'انتهت الجلسة؛ أعد تسجيل الدخول' : 'الاتصال منقطع؛ التعديلات بانتظار الإرسال');
        const data = await response.json();
        if (!active) return;
        const local = api.getSceneElementsIncludingDeleted();
        const merged = mergeRemote(local, data.elements, pending.current);
        const elements = merged || local;
        if (!loaded.current) {
          const restored = new Map(elements.map(e => [e.id, e]));
          pending.current.forEach(e => restored.set(e.id, e));
          apply([...restored.values()]);
        } else if (merged) apply(merged);
        // Do not wait for image downloads before displaying the board.
        latest.current.onImages(data.elements);
        cursor = Number.isSafeInteger(data.cursor) ? data.cursor : null;
        loaded.current = true; setReady(true); failures = 0;
        setStatus(pending.current.size ? 'جارٍ الحفظ…' : 'محفوظ');
      } catch (error) {
        if (active) { failures++; setStatus(error.message); }
      } finally {
        pulling = false;
        if (active) readTimer = setTimeout(pull, Math.min(15000, 1800 * 2 ** Math.min(failures, 3)));
      }
    }
    async function push() {
      if (!active || pushing) return;
      pushing = true;
      try {
        if (!loaded.current || !pending.current.size) return;
        const batch = structuredClone(makeBatch(pending.current));
        // Commit recovery before sending. Remote saving still works if IDB is unavailable.
        await enqueue('pending', structuredClone(batch)).catch(() => {});
        if (!active) return;
        const response = await fetch('/api/board', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ elements: batch }), signal: signal() });
        if (!response.ok) throw Error('تعذّر الحفظ؛ سنعيد المحاولة');
        const data = await response.json();
        if (!active) return;
        if (!Array.isArray(data.accepted) || !Array.isArray(data.conflicts)) throw Error('بانتظار تحديث خدمة الحفظ؛ تعديلاتك ما زالت معلّقة');
        const remove = [], canonical = [];
        for (const ack of data.accepted) {
          if (isSameEdit(pending.current.get(ack.id), ack)) { pending.current.delete(ack.id); remove.push(ack.id); }
        }
        if(remove.length)enqueue("pending",[],remove).catch(()=>{});
        for (const remote of data.conflicts) {
          const currentDraft = pending.current.get(remote.id);
          const draft = currentDraft ? structuredClone(currentDraft) : null;
          if (!draft) continue;
          // Keep a recoverable draft before adopting the server's canonical edit.
          // If persistence fails, leave it pending rather than discard the edit.
          const recovery = { id: draft.id, element: structuredClone(draft), savedAt: Date.now() };
          await enqueue('conflicts', [recovery]);
          if (!active) return;
          setConflicts(old => [...old.filter(item => item.id !== recovery.id), recovery]);
          if (isSameEdit(pending.current.get(draft.id), draft)) {
            pending.current.delete(draft.id); enqueue("pending",[],[draft.id]).catch(()=>{}); canonical.push(remote);
          }
        }
        // Queue deletes before yielding, so a later edit always writes after them.
        if (canonical.length) {
          const map = new Map(api.getSceneElementsIncludingDeleted().map(e => [e.id, e]));
          canonical.forEach(e => {if(!pending.current.has(e.id)&&(!map.has(e.id)||map.get(e.id).version<=e.version))map.set(e.id, e)}); apply([...map.values()]);
        }
        if (active) setStatus(pending.current.size ? 'جارٍ الحفظ…' : 'محفوظ');
      } catch (error) { if (active) setStatus(error.message || 'تعذّر الحفظ؛ سنعيد المحاولة'); }
      finally { pushing = false; if (active) writeTimer = setTimeout(push, 900); }
    }
    const resume = () => { if(document.hidden&&pending.current.size)enqueue('pending',structuredClone([...pending.current.values()])).catch(()=>{}); if (!document.hidden) { clearTimeout(readTimer); pull(); clearTimeout(writeTimer); push(); } };
    const beforeUnload = event => {
      if (pending.current.size || latest.current.hasImageUploads()) { event.preventDefault(); event.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    window.addEventListener('beforeunload', beforeUnload);
    initialize();
    return () => {
      clearTimeout(localTimer.current);localTimer.current=null;
      if(pending.current.size)enqueue("pending",structuredClone([...pending.current.values()])).catch(()=>{});
      active = false; controller.abort(); clearTimeout(readTimer); clearTimeout(writeTimer);
      document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [api, authorized, apply, enqueue]);
  const restoreConflicts = async () => {
    const { api, pending, setStatus } = latest.current;
    if (!api || !conflicts.length) return;
    const map = new Map(api.getSceneElementsIncludingDeleted().map(e => [e.id, e]));
    const restored = conflicts.map(item => ({ ...item.element, version: Math.max(item.element.version, map.get(item.id)?.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }));
    try {
      restored.forEach(e => { pending.current.set(e.id, e); map.set(e.id, e); });
      apply([...map.values()]);
      await enqueue("pending",structuredClone(restored));
      await enqueue('conflicts', [], conflicts.map(item => item.id));
      setConflicts([]); setStatus('جارٍ حفظ التعديلات المسترجعة…');
    } catch { setStatus('تعذّر استرجاع التعديلات؛ النسخة المحلية لم تُحذف'); }
  };
  return { ready, observe, conflicts, restoreConflicts, storageError };
}
