import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./style.css";

function App() {
  const [api, setApi] = useState(null);
  const [status, setStatus] = useState("Connecting...");
  const loaded = useRef(false);
  const applying = useRef(false);
  const pending = useRef(new Map());
  const known = useRef(new Map());
  const apiRef = useRef(null);
  apiRef.current = api;

  useEffect(() => {
    if (!api) return;
    let active = true;
    async function sync() {
      try {
        const response = await fetch("/api/board", { cache: "no-store" });
        if (!response.ok) throw new Error("Database unavailable");
        const { elements } = await response.json();
        if (!active) return;
        const local = apiRef.current.getSceneElementsIncludingDeleted();
        const merged = new Map(local.map(e => [e.id, e]));
        let changed = false;
        for (const element of elements) {
          const current = merged.get(element.id);
          const incomingVersion = element.version ?? 0;
          const localVersion = current?.version ?? -1;
          if (!current || incomingVersion > localVersion || (incomingVersion === localVersion && (element.versionNonce ?? 0) !== (current.versionNonce ?? 0) && !pending.current.has(element.id))) {
            merged.set(element.id, element);
            changed = true;
          }
          known.current.set(element.id, Math.max(known.current.get(element.id) ?? -1, incomingVersion));
        }
        if (changed) {
          applying.current = true;
          apiRef.current.updateScene({ elements: [...merged.values()] });
          queueMicrotask(() => { applying.current = false; });
        }
        loaded.current = true;
        setStatus("Connected");
      } catch (error) {
        setStatus("Offline — changes may not be saved");
      }
    }
    sync();
    const timer = setInterval(sync, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    let active = true;
    async function flush() {
      if (!loaded.current || !pending.current.size) return;
      const batch = [...pending.current.values()];
      try {
        const response = await fetch("/api/board", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ elements: batch })
        });
        if (!response.ok) throw new Error("Save failed");
        if (!active) return;
        for (const element of batch) {
          if (pending.current.get(element.id)?.versionNonce === element.versionNonce) pending.current.delete(element.id);
        }
        setStatus("Saved");
      } catch { setStatus("Save failed — retrying"); }
    }
    const timer = setInterval(flush, 900);
    return () => { active = false; clearInterval(timer); };
  }, [api]);

  function onChange(elements) {
    if (!loaded.current || applying.current) return;
    for (const element of elements) {
      if ((element.version ?? 0) > (known.current.get(element.id) ?? -1)) {
        known.current.set(element.id, element.version ?? 0);
        pending.current.set(element.id, element);
      }
    }
  }

  return <main className="board">
    <div className="connection-status" role="status">{status}</div>
    <Excalidraw excalidrawAPI={setApi} onChange={onChange} name="Our Whiteboard" />
  </main>;
}
createRoot(document.getElementById("root")).render(<App />);
