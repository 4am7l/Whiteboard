import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./style.css";

function App() {
  const [authorized, setAuthorized] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("whiteboard-theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const [pattern, setPattern] = useState(() => {
    try { return localStorage.getItem("whiteboard-pattern") || "none"; } catch { return "none"; }
  });
  const [patternMenu, setPatternMenu] = useState(false);
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });
  const [stickerMenu,setStickerMenu]=useState(false);
  const [stickers,setStickers]=useState([]);
  const [placements,setPlacements]=useState([]);
  const [stickerError,setStickerError]=useState("");
  const draggingSticker=useRef(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [api, setApi] = useState(null);
  const [status, setStatus] = useState("Connecting...");
  const loaded = useRef(false);
  const applying = useRef(false);
  const pending = useRef(new Map());
  const known = useRef(new Map());
  const apiRef = useRef(null);
  apiRef.current = api;

  useEffect(() => {
    fetch("/api/board", { cache: "no-store" }).then(r => { if (r.ok) setAuthorized(true); }).catch(() => {});
  }, []);

  async function login(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      if (!response.ok) throw new Error(response.status === 503 ? "Configure Cloudflare secrets first" : "Incorrect code");
      setAuthorized(true);
    } catch (error) { setLoginError(error.message); }
  }

  useEffect(() => {
    if (!api || !authorized) return;
    let active = true;
    let busy = false;
    async function sync() {
      if (busy || pending.current.size) return;
      busy = true;
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
      } catch { setStatus("Offline — changes may not be saved"); }
      finally { busy = false; }
    }
    sync();
    const timer = setInterval(sync, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [api, authorized]);

  useEffect(() => {
    if (!api || !authorized) return;
    let active = true;
    let busy = false;
    async function flush() {
      if (busy || !loaded.current || !pending.current.size) return;
      busy = true;
      const batch = [...pending.current.values()];
      try {
        const response = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ elements: batch }) });
        if (!response.ok) throw new Error("Save failed");
        if (!active) return;
        for (const element of batch) {
          if (pending.current.get(element.id)?.versionNonce === element.versionNonce) pending.current.delete(element.id);
        }
        setStatus("Saved");
      } catch { setStatus("Save failed — retrying"); }
      finally { busy = false; }
    }
    const timer = setInterval(flush, 900);
    return () => { active = false; clearInterval(timer); };
  }, [api, authorized]);

  useEffect(() => {
    if (!authorized || !api) return;
    const root = document.querySelector(".board .excalidraw");
    if (!root) return;
    let drag = null;
    let suppressMenu = false;
    function down(event) {
      if (event.button !== 2 || !event.target.closest(".excalidraw__canvas")) return;
      drag = { x: event.clientX, y: event.clientY, scrollX: api.getAppState().scrollX, scrollY: api.getAppState().scrollY, moved: false };
    }
    function move(event) {
      if (!drag || !(event.buttons & 2)) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      event.preventDefault();
      const zoom = api.getAppState().zoom?.value || 1;
      api.updateScene({ appState: { scrollX: drag.scrollX + dx / zoom, scrollY: drag.scrollY + dy / zoom } });
    }
    function up(event) {
      if (event.button !== 2 || !drag) return;
      suppressMenu = drag.moved;
      drag = null;
    }
    function context(event) {
      if (suppressMenu || drag?.moved) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      suppressMenu = false;
    }
    root.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    root.addEventListener("contextmenu", context, true);
    return () => {
      root.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      root.removeEventListener("contextmenu", context, true);
    };
  }, [api, authorized]);

  async function loadStickers() {
    try {
      const r=await fetch("/api/stickers",{cache:"no-store"});
      if(!r.ok)throw Error("Sticker storage unavailable");
      setStickers((await r.json()).stickers);
    }catch(e){setStickerError(e.message)}
  }
  useEffect(()=>{if(!authorized)return;loadStickers();},[authorized]);
  useEffect(()=>{
    if(!authorized)return;
    let active=true;
    const poll=async()=>{
      try {const r=await fetch("/api/sticker-placements",{cache:"no-store"});if(!r.ok)return;
        const data=await r.json();if(active&&!draggingSticker.current)setPlacements(data.placements);
      }catch{}
    };
    poll();const timer=setInterval(poll,2500);
    return()=>{active=false;clearInterval(timer)};
  },[authorized]);
  async function uploadSticker(event) {
    const files=[...event.target.files];event.target.value="";
    for(const file of files){
      const form=new FormData();form.append("file",file);
      try{const r=await fetch("/api/stickers",{method:"POST",body:form});
        const data=await r.json();if(!r.ok)throw Error(data.error||"Upload failed");
      }catch(e){setStickerError(e.message)}
    }
    loadStickers();
  }
  async function placeSticker(sticker) {
    const state=api?.getAppState();
    const p={id:crypto.randomUUID(),sticker_id:sticker.id,x:(window.innerWidth/2)/(state?.zoom?.value||1)-(state?.scrollX||0)-75,y:(window.innerHeight/2)/(state?.zoom?.value||1)-(state?.scrollY||0)-75,width:150};
    setPlacements(old=>[...old,p]);
    const r=await fetch("/api/sticker-placements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});
    if(!r.ok)setStickerError("Run sticker-schema.sql in D1 to enable placements");
    setStickerMenu(false);
  }
  async function deletePlacement(id) {
    setPlacements(old=>old.filter(p=>p.id!==id));
    await fetch("/api/sticker-placements?id="+encodeURIComponent(id),{method:"DELETE"});
  }
  function startStickerDrag(event,p) {
    if(event.button!==0)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    draggingSticker.current={id:p.id,startX:event.clientX,startY:event.clientY,x:p.x,y:p.y};
  }
  function moveSticker(event) {
    const drag=draggingSticker.current;if(!drag)return;
    const zoom=viewport.zoom||1;
    setPlacements(old=>old.map(p=>p.id===drag.id?{...p,x:drag.x+(event.clientX-drag.startX)/zoom,y:drag.y+(event.clientY-drag.startY)/zoom}:p));
  }
  async function endStickerDrag(event) {
    const drag=draggingSticker.current;if(!drag)return;
    const zoom=viewport.zoom||1;
    const p=placements.find(p=>p.id===drag.id);
    const next=p?{...p,x:drag.x+(event.clientX-drag.startX)/zoom,y:drag.y+(event.clientY-drag.startY)/zoom}:null;
    draggingSticker.current=null;
    if(next)await fetch("/api/sticker-placements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(next)});
  }
  function toggleTheme() {
    setTheme(previous => {
      const next = previous === "dark" ? "light" : "dark";
      try { localStorage.setItem("whiteboard-theme", next); } catch {}
      return next;
    });
  }

  function choosePattern(next) {
    setPattern(next);
    setPatternMenu(false);
    try { localStorage.setItem("whiteboard-pattern", next); } catch {}
  }

  function onChange(elements, appState) {
    if (appState) {
      const next = { zoom: appState.zoom?.value || 1, x: appState.scrollX || 0, y: appState.scrollY || 0 };
      setViewport(old => old.zoom === next.zoom && old.x === next.x && old.y === next.y ? old : next);
    }
    if (!loaded.current || applying.current) return;
    for (const element of elements) {
      if ((element.version ?? 0) > (known.current.get(element.id) ?? -1)) {
        known.current.set(element.id, element.version ?? 0);
        pending.current.set(element.id, element);
      }
    }
  }

  if (!authorized) return <form className="login" onSubmit={login}><h1>Our Whiteboard ♡</h1><p>Enter our 6-digit code</p><input aria-label="6-digit code" type="password" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}/><button type="submit">Open board</button><p role="alert">{loginError}</p></form>;
  return <main className="board"><button type="button" className={`theme-toggle ${theme === "dark" ? "theme-toggle--dark" : "theme-toggle--light"}`} title="Change theme" onClick={toggleTheme} aria-label="Toggle dark mode">{theme === "dark" ? "☀️ Light" : "🌙 Dark"}</button><div className="pattern-controls">
      <button type="button" className={`pattern-button ${theme === "dark" ? "pattern-dark" : "pattern-light"}`} onClick={() => setPatternMenu(v => !v)} aria-expanded={patternMenu} aria-label="Board background">▦ Background</button>
      {patternMenu && <div className={`pattern-menu ${theme === "dark" ? "pattern-dark" : "pattern-light"}`}>
        {[["none", "Blank"], ["lines", "Horizontal lines"], ["squares", "Small squares"], ["dots", "Small dots"], ["graph", "Graph paper"]].map(([id, label]) =>
          <button type="button" key={id} className={pattern === id ? "selected" : ""} onClick={() => choosePattern(id)}>{pattern === id ? "✓ " : ""}{label}</button>)}
      </div>}
    </div>
    <div className="sticker-controls">
      <button type="button" className={`sticker-trigger ${theme==="dark"?"pattern-dark":"pattern-light"}`} onClick={()=>setStickerMenu(v=>!v)}>♡ Stickers</button>
      {stickerMenu&&<div className={`sticker-library ${theme==="dark"?"pattern-dark":"pattern-light"}`}>
        <strong>Our Stickers</strong>
        <label className="sticker-upload">＋ Upload PNG / JPG / WebP / GIF<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={uploadSticker} hidden/></label>
        <div className="sticker-grid">{stickers.map(sticker=><button type="button" key={sticker.id} title={sticker.name} onClick={()=>placeSticker(sticker)}><img src={sticker.url} alt={sticker.name}/></button>)}</div>
        {stickerError&&<small role="alert">{stickerError}</small>}
      </div>}
    </div>
    <Excalidraw excalidrawAPI={setApi} onChange={onChange} theme={theme} name="Our Whiteboard" />
    <div className="placed-stickers">{placements.map(p=>{
      const sticker=stickers.find(s=>s.id===p.sticker_id);if(!sticker)return null;
      return <div key={p.id} className="placed-sticker" style={{left:(p.x+viewport.x)*viewport.zoom,top:(p.y+viewport.y)*viewport.zoom,width:p.width*viewport.zoom}} onPointerDown={e=>startStickerDrag(e,p)} onPointerMove={moveSticker} onPointerUp={endStickerDrag} onPointerCancel={endStickerDrag}>
        <img draggable="false" src={sticker.url} alt={sticker.name}/><button type="button" aria-label="Remove sticker from board" title="Remove sticker" onPointerDown={e=>e.stopPropagation()} onClick={()=>deletePlacement(p.id)}>×</button>
      </div>;
    })}</div>
    {pattern !== "none" && <div className={`board-pattern pattern-${pattern} pattern-${theme}`} aria-hidden="true" style={{
      "--pattern-size": `${(pattern === "graph" ? 10 : 20) * viewport.zoom}px`,
      "--pattern-x": `${viewport.x * viewport.zoom}px`,
      "--pattern-y": `${viewport.y * viewport.zoom}px`
    }} />}</main>;
}
createRoot(document.getElementById("root")).render(<App />);
