import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
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
  const [libraryHost,setLibraryHost]=useState(null);
  const [searchQuery,setSearchQuery]=useState("");
  const [searchKind,setSearchKind]=useState("stickers");
  const [searchSource,setSearchSource]=useState("giphy");
  const [favoriteIds,setFavoriteIds]=useState([]);
  const [stickerTab,setStickerTab]=useState("saved");
  const [searchItems,setSearchItems]=useState([]);
  const [searchBusy,setSearchBusy]=useState(false);
  const [stickers,setStickers]=useState([]);
  const [placements,setPlacements]=useState([]);
  const [stickerError,setStickerError]=useState("");
  const draggingSticker=useRef(null);
  const imageLoads=useRef(new Map());
  const [sceneImages,setSceneImages]=useState([]);
  const [selectedSticker,setSelectedSticker]=useState(null);
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
        await Promise.all(elements.filter(e=>e.type==="image"&&!e.isDeleted&&String(e.fileId||"").startsWith("sticker:")).map(e=>loadImageFile(e.fileId).catch(()=>{})));
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

  useEffect(()=>{
    if(!authorized)return;
    const locate=()=>{
      const host=document.querySelector('.library-menu, .layer-ui__library, [data-testid="library-menu"], .sidebar[data-name="library"]');
      setLibraryHost(old=>old===host?old:host);
    };
    const observer=new MutationObserver(locate);
    observer.observe(document.body,{childList:true,subtree:true});
    locate();
    return()=>observer.disconnect();
  },[authorized]);
  async function searchGiphy(event) {
    event.preventDefault();
    if(!searchQuery.trim())return;
    setSearchBusy(true);setStickerError("");
    try {
      const r=await fetch("/api/sticker-search?q="+encodeURIComponent(searchQuery)+"&kind="+searchKind+"&source="+searchSource);
      const data=await r.json();
      if(!r.ok)throw Error(data.error||"Search failed");
      setSearchItems(data.items);
    }catch(e){setStickerError(e.message)}
    finally{setSearchBusy(false)}
  }
  async function toggleFavorite(id) {
    const saved=favoriteIds.includes(id);
    try {
      const r=await fetch("/api/sticker-favorites"+(saved?"?id="+encodeURIComponent(id):""),{method:saved?"DELETE":"POST",headers:{"Content-Type":"application/json"},...(saved?{}:{body:JSON.stringify({id})})});
      if(!r.ok)throw Error("Could not update favorites");
      setFavoriteIds(old=>saved?old.filter(x=>x!==id):[...old,id]);
    }catch(e){setStickerError(e.message)}
  }
  async function importSticker(item,asFavorite=false) {
    setStickerError("");
    try {
      const r=await fetch("/api/sticker-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.url,name:item.title})});
      const data=await r.json();
      if(!r.ok)throw Error(data.error||"Import failed");
      await loadStickers();
      if(asFavorite) {
        const fav=await fetch("/api/sticker-favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:data.id})});
        if(fav.ok)setFavoriteIds(old=>[...old,data.id]);
      }else await placeSticker({id:data.id});
    }catch(e){setStickerError(e.message)}
  }
  async function loadStickers() {
    try {
      const r=await fetch("/api/stickers",{cache:"no-store"});
      if(!r.ok)throw Error("Sticker storage unavailable");
      setStickers((await r.json()).stickers);
    }catch(e){setStickerError(e.message)}
  }
  useEffect(()=>{if(!authorized)return;loadStickers();fetch("/api/sticker-favorites").then(r=>r.ok?r.json():null).then(d=>{if(d)setFavoriteIds(d.ids)}).catch(()=>{});},[authorized]);
  useEffect(()=>{
    if(!authorized||!api||!loaded.current||!stickers.length)return;
    let cancelled=false;
    async function migrate(){
      try{
        const r=await fetch("/api/sticker-placements",{cache:"no-store"});
        if(!r.ok)return;
        const {placements:old=[]}=await r.json();
        for(const p of old){
          if(cancelled)return;
          const sticker=stickers.find(s=>s.id===p.sticker_id);
          if(!sticker)continue;
          const created=await placeSticker(sticker,p);
          if(!created)continue;
          const saved=await fetch("/api/board",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({elements:[created]})});
          if(saved.ok){pending.current.delete(created.id);await fetch("/api/sticker-placements?id="+encodeURIComponent(p.id),{method:"DELETE"})}
        }
      }catch(e){setStickerError("Legacy sticker migration: "+e.message)}
    }
    migrate();return()=>{cancelled=true};
  },[authorized,api,stickers,loaded.current]);
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
  async function loadImageFile(fileId) {
    if(!apiRef.current||!fileId?.startsWith("sticker:"))return;
    if(apiRef.current.getFiles()[fileId])return;
    if(imageLoads.current.has(fileId))return imageLoads.current.get(fileId);
    const task=(async()=>{
      const id=fileId.slice(8);
      const r=await fetch("/api/sticker-file?id="+encodeURIComponent(id));
      if(!r.ok)throw Error("Image unavailable");
      const blob=await r.blob();
      const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
      apiRef.current?.addFiles([{id:fileId,dataURL,mimeType:blob.type||"image/png",created:Date.now(),lastRetrieved:Date.now()}]);
    })();
    imageLoads.current.set(fileId,task);
    try{await task}finally{imageLoads.current.delete(fileId)}
  }
  async function placeSticker(sticker,legacy=null) {
    if(!api||!loaded.current){setStickerError("Wait for the board to connect");return}
    const fileId="sticker:"+sticker.id;
    try{await loadImageFile(fileId)}catch(e){setStickerError(e.message);return}
    const state=api.getAppState(),zoom=state.zoom?.value||1;
    const x=legacy?.x??(window.innerWidth/2)/zoom-(state.scrollX||0)-75;
    const y=legacy?.y??(window.innerHeight/2)/zoom-(state.scrollY||0)-75;
    const width=legacy?.width||150;
    const files=api.getFiles(),data=files[fileId];
    const dimensions=await new Promise(resolve=>{
      const image=new Image();image.onload=()=>resolve({w:image.naturalWidth||150,h:image.naturalHeight||150});image.onerror=()=>resolve({w:150,h:150});image.src=data.dataURL;
    });
    const height=width*dimensions.h/dimensions.w;
    const id=legacy?.id||crypto.randomUUID();
    const element={id,type:"image",x,y,width,height,angle:0,strokeColor:"transparent",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:1,strokeStyle:"solid",roughness:0,opacity:100,groupIds:[],frameId:null,roundness:null,seed:Math.floor(Math.random()*2147483647),version:1,versionNonce:Math.floor(Math.random()*2147483647),isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false,fileId,status:"saved",scale:[1,1]};
    const current=api.getSceneElementsIncludingDeleted();
    if(current.some(e=>e.id===id))return current.find(e=>e.id===id);
    api.updateScene({elements:[...current,element],appState:{selectedElementIds:{[id]:true}}});
    pending.current.set(id,element);
    known.current.set(id,1);
    setStickerMenu(false);
    return element;
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
    const images=elements.filter(e=>e.type==="image"&&!e.isDeleted&&String(e.fileId||"").startsWith("sticker:"));
    setSceneImages(old=>old.length===images.length&&old.every((e,i)=>e===images[i])?old:images);
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
    {libraryHost&&createPortal(<section className={`sticker-library-inline ${theme==="dark"?"pattern-dark":"pattern-light"}`}>
      <button type="button" className="sticker-section-toggle" onClick={()=>setStickerMenu(v=>!v)}>♡ Stickers {stickerMenu?"▴":"▾"}</button>
      {stickerMenu&&<div className="sticker-library-content">
        <div className="sticker-tabs">{[["saved","Saved"],["favorites","♡ Favorites"],["search","Search"]].map(([id,label])=><button type="button" key={id} className={stickerTab===id?"active":""} onClick={()=>setStickerTab(id)}>{label}</button>)}</div>
        {stickerTab==="saved"&&<>
          <label className="sticker-upload">＋ Upload PNG / JPG / WebP / GIF<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={uploadSticker} hidden/></label>
          <div className="sticker-grid">{stickers.map(sticker=><div className="sticker-tile" key={sticker.id}><button type="button" title={sticker.name} onClick={()=>placeSticker(sticker)}><img src={sticker.url} alt={sticker.name}/></button><button type="button" className="favorite-action" aria-label="Toggle favorite" onClick={()=>toggleFavorite(sticker.id)}>{favoriteIds.includes(sticker.id)?"♥":"♡"}</button></div>)}</div>
        </>}
        {stickerTab==="favorites"&&<div className="sticker-grid">{stickers.filter(s=>favoriteIds.includes(s.id)).map(sticker=><div className="sticker-tile" key={sticker.id}><button type="button" onClick={()=>placeSticker(sticker)}><img src={sticker.url} alt={sticker.name}/></button><button type="button" className="favorite-action" onClick={()=>toggleFavorite(sticker.id)} aria-label="Remove favorite">♥</button></div>)}</div>}
        {stickerTab==="search"&&<>
          <form className="sticker-search" onSubmit={searchGiphy}>
            <input aria-label="Search GIFs and stickers" placeholder="Search stickers or GIFs…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/>
            <select aria-label="Sticker source" value={searchSource} onChange={e=>{setSearchSource(e.target.value);setSearchItems([])}}><option value="giphy">GIPHY</option><option value="commons">Wikimedia Commons</option></select>
            {searchSource==="giphy"&&<select aria-label="Search type" value={searchKind} onChange={e=>setSearchKind(e.target.value)}><option value="stickers">Stickers</option><option value="gif">GIFs</option></select>}
            <button type="submit" disabled={searchBusy}>{searchBusy?"…":"Search"}</button>
          </form>
          <div className="sticker-grid">{searchItems.map(item=><div className="sticker-tile" key={item.id}><button type="button" title={"Save and add "+item.title} onClick={()=>importSticker(item)}><img src={item.preview} alt={item.title}/></button><button type="button" className="favorite-action" title="Save to favorites" onClick={()=>importSticker(item,true)}>♡</button></div>)}</div>
          <small>GIFs by GIPHY · Images from Wikimedia Commons (check individual licenses)</small>
        </>}
        {stickerError&&<small role="alert">{stickerError}</small>}
      </div>}
    </section>,libraryHost)}
    <Excalidraw excalidrawAPI={setApi} onChange={onChange} theme={theme} name="Our Whiteboard" />
    <div className="animated-stickers" aria-hidden="true">{sceneImages.filter(e=>e.fileId.endsWith(".gif")).map(e=>{
      const id=e.fileId.slice(8);
      const scale=e.scale||[1,1];
      return <img key={e.id} src={"/api/sticker-file?id="+encodeURIComponent(id)} alt="" draggable="false" style={{
        position:"absolute",left:(e.x+viewport.x)*viewport.zoom,top:(e.y+viewport.y)*viewport.zoom,
        width:e.width*viewport.zoom,height:e.height*viewport.zoom,
        transform:`rotate(${e.angle||0}rad) scale(${scale[0]},${scale[1]})`,opacity:(e.opacity??100)/100
      }}/>;
    })}</div>
    {pattern !== "none" && <div className={`board-pattern pattern-${pattern} pattern-${theme}`} aria-hidden="true" style={{
      "--pattern-size": `${(pattern === "graph" ? 10 : 20) * viewport.zoom}px`,
      "--pattern-x": `${viewport.x * viewport.zoom}px`,
      "--pattern-y": `${viewport.y * viewport.zoom}px`
    }} />}</main>;
}
createRoot(document.getElementById("root")).render(<App />);
