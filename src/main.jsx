import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Excalidraw, getSceneVersion, getCommonBounds, getFreeDrawSvgPath, CaptureUpdateAction } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./style.css";
import "./layout.css";
import { STICKER_PACKS, getStickerPackItems } from "./stickerPacks";
import { parseMusicLink } from "./MediaCards";
import { MediaLayers } from "./MediaLayers";
import { isVisible } from "./viewport";
import { useBoardSync } from "./useBoardSync";
import { StickerThumbnail } from "./StickerThumbnail";
import { thumbnail } from "./thumbnails";
import { storageRead, storageWrite } from "./boardStorage";
import { installDrawingPinch, isMobileBoardDevice } from "./touchNavigation";
import { segmentHitsImage } from "./imageDrawing";

function SelectionControls({count,locked,customPalette,children}){
  const [host,setHost]=useState(null);
  const native=count===1&&!locked&&!customPalette;
  useEffect(()=>{
    if(!native){setHost(null);return}
    const root=document.querySelector(".board .excalidraw");
    if(!root)return;
    const locate=()=>{
      const panel=root.querySelector(".App-menu__left .panelColumn, .App-mobile-menu .panelColumn");
      setHost(panel?.getClientRects().length?panel:null);
    };
    locate();
    const observer=new MutationObserver(locate);
    observer.observe(root,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[native]);
  const embedded=native&&host?.isConnected;
  const controls=<div className={`appearance-lock-bar ${count>1?"appearance-lock-bar--multiple":""} ${embedded?"appearance-lock-bar--embedded":""}`} aria-label="Selected element controls">{children}</div>;
  return embedded?createPortal(controls,host):controls;
}

function ImageDrawingControl({image,onToggle}){
  const [host,setHost]=useState(null);
  useEffect(()=>{
    if(!image||image.locked)return;
    const root=document.querySelector(".board .excalidraw");
    if(!root)return;
    const locate=()=>setHost(root.querySelector(".App-menu__left .panelColumn, .App-mobile-menu .panelColumn"));
    locate();
    const observer=new MutationObserver(locate);
    observer.observe(root,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[image?.id,image?.locked]);
  if(!image||image.locked||!host?.isConnected)return null;
  return createPortal(<fieldset className="image-drawing-control"><legend>الرسم فوق الصورة</legend><button type="button" aria-pressed={Boolean(image.customData?.allowDrawing)} onClick={onToggle}>{image.customData?.allowDrawing?"✓ مسموح — إيقاف الرسم":"✎ السماح بالرسم"}</button></fieldset>,host);
}

function ImageInkOverlay({images,strokes,viewport}){
  // HTML images (dark-mode originals and GIFs) sit above the canvas. Repeat
  // native freehand paths only in their enabled image regions.
  const cache=useRef(new Map());
  const paths=useMemo(()=>{
    if(!images.length||!strokes.length)return [];
    const bounds=images.map(image=>getCommonBounds([image]));
    const nextCache=new Map(),result=[];
    for(const e of strokes){
      const previous=cache.current.get(e.id),key=e.version+":"+e.versionNonce;
      let entry=previous?.key===key?previous:null;
      if(!entry){
        const rect=getCommonBounds([e]);
        entry={key,rect,path:null};
      }
      nextCache.set(e.id,entry);
      const [x1,y1,x2,y2]=entry.rect;
      if(!bounds.some(([a,b,c,d])=>x1<=c&&x2>=a&&y1<=d&&y2>=b))continue;
      if(!entry.path)entry.path=<path key={e.id} d={getFreeDrawSvgPath(e)} fill={e.strokeColor} opacity={(e.opacity??100)/100} transform={`translate(${e.x} ${e.y}) rotate(${(e.angle||0)*180/Math.PI} ${(x1+x2)/2-e.x} ${(y1+y2)/2-e.y})`}/>;
      result.push(entry.path);
    }
    cache.current=nextCache;return result;
  },[strokes,images]);
  if(!images.length||!strokes.length)return null;
  return <svg className="image-ink-overlay" aria-hidden="true"><defs><clipPath id="image-ink-regions" clipPathUnits="userSpaceOnUse">{images.map(e=><rect key={e.id} x={e.x} y={e.y} width={e.width} height={e.height} rx={e.roundness?.type?Math.min(32,e.width/4,e.height/4):0} transform={`rotate(${(e.angle||0)*180/Math.PI} ${e.x+e.width/2} ${e.y+e.height/2})`}/>)}</clipPath></defs><g className="image-ink-world"><g clipPath="url(#image-ink-regions)">{paths}</g></g></svg>;
}

// Include complete groups, frame contents and attached text when selecting a lock.
function expandLockSelection(elements,initial){
  const ids=new Set(initial);let changed=true;
  while(changed){
    changed=false;
    const groups=new Set(elements.filter(e=>ids.has(e.id)).flatMap(e=>e.groupIds||[]));
    for(const e of elements){
      if(e.isDeleted||ids.has(e.id))continue;
      if((e.groupIds||[]).some(id=>groups.has(id))||ids.has(e.frameId)||ids.has(e.containerId)){
        ids.add(e.id);changed=true;
      }
    }
  }
  return ids;
}

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
  const [toolsOpen,setToolsOpen]=useState(false);
  const [viewport, setViewport] = useState({ zoom: 1, x: 0, y: 0 });
  const [stickerMenu,setStickerMenu]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const [searchKind,setSearchKind]=useState("stickers");
  const [searchSource,setSearchSource]=useState("giphy");
  const [favoriteIds,setFavoriteIds]=useState([]);
  const [stickerTab,setStickerTab]=useState("saved");
  const [savedPage,setSavedPage]=useState(1);
  const [stickerCursor,setStickerCursor]=useState(null);
  const [stickerLoading,setStickerLoading]=useState(false);
  const [selectedPack,setSelectedPack]=useState(null);
  const [packItems,setPackItems]=useState([]);
  const [packQuery,setPackQuery]=useState("");
  const [packPage,setPackPage]=useState(1);
  const [packLoading,setPackLoading]=useState(false);
  const [searchItems,setSearchItems]=useState([]);
  const [searchBusy,setSearchBusy]=useState(false);
  const [stickers,setStickers]=useState([]);
  const [placements,setPlacements]=useState([]);
  const [stickerError,setStickerError]=useState("");
  const draggingSticker=useRef(null);
  const imageLoads=useRef(new Map());
  const imageUploads=useRef(new Set());
  const imageQueue=useRef(new Map());
  const imageInFlight=useRef(new Set());
  const imageReadQueue=useRef(new Map());
  const imageReadActive=useRef(0);
  const imageReadRetries=useRef(new Map());
  const imageReadMissing=useRef(new Set());
  const sceneCache=useRef(null);
  const elementViews=useRef(new Map());
  const blockedImages=useRef([]);
  const viewFrame=useRef(0);
  const boardRoot=useRef(null);
  const viewNext=useRef(null);
  const [imageStatus,setImageStatus]=useState("");
  const [sceneImages,setSceneImages]=useState([]);
  const [imageSources,setImageSources]=useState({});
  const [voiceCards,setVoiceCards]=useState([]);
  const [musicCards,setMusicCards]=useState([]);
  const [musicOpen,setMusicOpen]=useState(false);
  const [musicInput,setMusicInput]=useState("");
  const [musicResults,setMusicResults]=useState([]);
  const [musicBusy,setMusicBusy]=useState(false);
  const [musicError,setMusicError]=useState("");
  const [selectedVoiceId,setSelectedVoiceId]=useState(null);
  const [selectedMusicId,setSelectedMusicId]=useState(null);
  const [mediaResponsive,setMediaResponsive]=useState(false);
  const [musicHex,setMusicHex]=useState("");
  const [selectedBoardIds,setSelectedBoardIds]=useState([]);
  const [inkStrokes,setInkStrokes]=useState([]);
  const [penActive,setPenActive]=useState(false);
  // iPadOS may identify itself as desktop Safari; detect touch capability instead.
  const [startWithHand]=useState(()=>isMobileBoardDevice(navigator));
  const [handActive,setHandActive]=useState(()=>isMobileBoardDevice(navigator));
  const [selectionLocked,setSelectionLocked]=useState(false);
  const lockedSnapshot=useRef(new Map());
  const lastSelection=useRef({});
  const [voiceHex,setVoiceHex]=useState("");
  const [recording,setRecording]=useState(false);
  const [voiceBusy,setVoiceBusy]=useState(false);
  const recorderRef=useRef(null);
  const voiceStreamRef=useRef(null);
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
    fetch("/api/session", { cache: "no-store" }).then(r => { if (r.ok) setAuthorized(true); }).catch(() => {});
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

  async function logout() {
    if (pending.current.size || imageQueue.current.size) {
      setStatus("Please wait for your changes to save before logging out");
      return;
    }
    try {
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      setAuthorized(false);
      setToolsOpen(false);
      closePanels();
      setPin("");
      setApi(null);
      loaded.current = false;
      known.current.clear();
      pending.current.clear();
      setLoginError("");
    } catch {
      setStatus("Logout failed — please try again");
    }
  }

  const sync = useBoardSync({api, authorized, pending, loaded, applying, lockedSnapshot, setStatus,
    onImages: queueSceneImages, hasImageUploads: () => imageQueue.current.size > 0});

  useEffect(()=>{
    if(!api||!authorized)return;
    const board=document.querySelector(".board");let timer;
    const busy=event=>{if(event.type==="pointermove"&&!event.buttons)return;board.classList.add("board-interacting");clearTimeout(timer);timer=setTimeout(()=>board.classList.remove("board-interacting"),180)};
    board.addEventListener("wheel",busy,{passive:true});board.addEventListener("pointermove",busy,{passive:true});
    return()=>{clearTimeout(timer);board.classList.remove("board-interacting");board.removeEventListener("wheel",busy);board.removeEventListener("pointermove",busy)};
  },[api,authorized]);

  useEffect(() => {
    if (!authorized || !api) return;
    const board = document.querySelector(".board");
    if (!board) return;
    let zoomFrame = 0, targetZoom = null, anchor = null, lastFrame = 0;
    const animateZoom = now => {
      zoomFrame = 0;
      const state = api.getAppState(), current = state.zoom.value;
      const elapsed = lastFrame ? Math.min(50, now - lastFrame) : 16;
      lastFrame = now;
      const remaining = Math.log(targetZoom / current);
      const done = Math.abs(remaining) < .0005;
      const next = done ? targetZoom : current * Math.exp(remaining * (1 - Math.exp(-elapsed / 45)));
      api.updateScene({appState:{
        zoom:{value:next},
        scrollX:state.scrollX + anchor.x / next - anchor.x / current,
        scrollY:state.scrollY + anchor.y / next - anchor.y / current,
        // Reuse Excalidraw's element raster caches while zooming, as its native
        // wheel handler does, then render the final resolution once settled.
        shouldCacheIgnoreZoom:!done,
      }});
      if(done){targetZoom=null;lastFrame=0}
      else zoomFrame=requestAnimationFrame(animateZoom);
    };
    const wheel = event => {
      const media = event.target instanceof Element && event.target.closest(".voice-overlay,.music-overlay");
      if (!(event.ctrlKey || event.metaKey)) {
        // Media controls sit outside Excalidraw, so forward normal board panning.
        if (!media) return;
        const canvas = board.querySelector("canvas.interactive");
        if (!canvas) return;
        event.preventDefault();
        event.stopPropagation();
        canvas.dispatchEvent(new WheelEvent("wheel", {
          bubbles:true, cancelable:true, deltaX:event.deltaX, deltaY:event.deltaY,
          deltaMode:event.deltaMode, clientX:event.clientX, clientY:event.clientY,
          shiftKey:event.shiftKey,
        }));
        return;
      }
      // Capture with passive:false before the browser handles Ctrl+wheel/pinch.
      event.preventDefault();
      event.stopPropagation();
      const state = api.getAppState();
      const rect = board.getBoundingClientRect();
      const zoom = state.zoom.value;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const delta = Math.max(-100, Math.min(100, event.deltaY * units));
      targetZoom = Math.max(.1, Math.min(30, (targetZoom ?? zoom) * Math.exp(-delta * .002)));
      anchor = {x:event.clientX - rect.left,y:event.clientY - rect.top};
      if(!zoomFrame)zoomFrame=requestAnimationFrame(animateZoom);
    };
    // Cross-origin players cannot bubble wheel events. While Ctrl/Cmd is held,
    // let the board receive the pointer instead; playback itself is unchanged.
    const modifier = event => board.classList.toggle("board-zoom-modifier", event.ctrlKey || event.metaKey);
    const clear = () => board.classList.remove("board-zoom-modifier");
    board.addEventListener("wheel", wheel, {capture:true, passive:false});
    window.addEventListener("keydown", modifier, true);
    window.addEventListener("keyup", modifier, true);
    window.addEventListener("blur", clear);
    return () => {
      cancelAnimationFrame(zoomFrame);
      api.updateScene({appState:{shouldCacheIgnoreZoom:false}});
      board.removeEventListener("wheel", wheel, true);
      window.removeEventListener("keydown", modifier, true);
      window.removeEventListener("keyup", modifier, true);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [api, authorized]);

  useEffect(()=>{
    if(!api||!authorized||!boardRoot.current)return;
    return installDrawingPinch(boardRoot.current,api);
  },[api,authorized]);

  useEffect(() => {
    if (!authorized || !api) return;
    const root = document.querySelector(".board .excalidraw");
    if (!root) return;
    let drag = null;
    let suppressMenu = false, panFrame=0, panNext=null;
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
      panNext={scrollX:drag.scrollX+dx/zoom,scrollY:drag.scrollY+dy/zoom};
      if(!panFrame)panFrame=requestAnimationFrame(()=>{panFrame=0;api.updateScene({appState:panNext})});
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
      cancelAnimationFrame(panFrame);
      root.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      root.removeEventListener("contextmenu", context, true);
    };
  }, [api, authorized]);

  useEffect(()=>{
    if(!api||!authorized)return;
    const board=document.querySelector(".board");
    if(!board)return;
    let gesture=null;
    let selectionOutline=null;

    const point=event=>{
      const state=api.getAppState();
      const rect=board.getBoundingClientRect();
      const zoom=state.zoom?.value||1;
      return {
        x:(event.clientX-rect.left)/zoom-state.scrollX,
        y:(event.clientY-rect.top)/zoom-state.scrollY
      };
    };
    const inBounds=(element,p)=>{
      const [x1,y1,x2,y2]=getCommonBounds([element]);
      return p.x>=x1&&p.x<=x2&&p.y>=y1&&p.y<=y2;
    };
    const clearOutline=()=>{
      selectionOutline?.remove();
      selectionOutline=null;
    };
    const drawOutline=(start,end)=>{
      if(!selectionOutline){
        selectionOutline=document.createElement("div");
        selectionOutline.className="board-selection-marquee";
        selectionOutline.setAttribute("aria-hidden","true");
        board.appendChild(selectionOutline);
      }
      const rect=board.getBoundingClientRect();
      const zoom=api.getAppState().zoom?.value||1;
      selectionOutline.style.left=(Math.min(start.x,end.x)+api.getAppState().scrollX)*zoom+"px";
      selectionOutline.style.top=(Math.min(start.y,end.y)+api.getAppState().scrollY)*zoom+"px";
      selectionOutline.style.width=Math.abs(end.x-start.x)*zoom+"px";
      selectionOutline.style.height=Math.abs(end.y-start.y)*zoom+"px";
    };
    const down=event=>{
      const target=event.target;
      if(event.button!==0||event.isPrimary===false||api.getAppState().activeTool.type!=="selection"||
        !(target instanceof Element)||!target.closest(".excalidraw__canvas")||
        target.closest(".layer-ui__wrapper,.popover,.Modal"))return;
      const start=point(event);
      const elements=api.getSceneElements();
      const hit=[...elements].reverse().find(element=>inBounds(element,start));
      // Normal dragging of unlocked items is left to Excalidraw. A drag from
      // blank space or a locked item can instead create an inclusive marquee.
      if(hit&&!hit.locked)return;
      const state=api.getAppState();
      gesture={
        id:event.pointerId,
        start,
        startX:event.clientX,
        startY:event.clientY,
        base:event.shiftKey?{...state.selectedElementIds}:{},
        fromLocked:Boolean(hit?.locked)
      };
      if(hit?.locked){
        event.preventDefault();
        event.stopPropagation();
        const ids=expandLockSelection(elements,[hit.id]);
        api.updateScene({appState:{
          selectedElementIds:{...gesture.base,...Object.fromEntries([...ids].map(id=>[id,true]))},
          selectedLinearElement:null,editingTextElement:null
        }});
      }
    };
    const move=event=>{
      const current=gesture;
      if(!current||current.id!==event.pointerId)return;
      if(!current.fromLocked)return; // Excalidraw draws the native blank-space marquee.
      event.preventDefault();
      event.stopPropagation();
      if(Math.hypot(event.clientX-current.startX,event.clientY-current.startY)>=5){
        drawOutline(current.start,point(event));
      }
    };
    const up=event=>{
      const current=gesture;
      if(!current||current.id!==event.pointerId)return;
      gesture=null;
      clearOutline();
      if(current.fromLocked){
        event.preventDefault();
        event.stopPropagation();
      }
      const end=point(event);
      if(Math.hypot(event.clientX-current.startX,event.clientY-current.startY)<5)return;
      const left=Math.min(current.start.x,end.x);
      const right=Math.max(current.start.x,end.x);
      const top=Math.min(current.start.y,end.y);
      const bottom=Math.max(current.start.y,end.y);
      // Select every element whose bounds touch the rectangle, including
      // partially intersecting unlocked and locked elements.
      const elements=api.getSceneElements();
      const touching=elements.filter(element=>{
        if(element.isDeleted)return false;
        const [x1,y1,x2,y2]=getCommonBounds([element]);
        return x1<=right&&x2>=left&&y1<=bottom&&y2>=top;
      }).map(element=>element.id);
      const ids=expandLockSelection(elements,touching);
      // Apply after the native pointer-up handler so its own selection does not
      // replace the inclusive rectangle result.
      queueMicrotask(()=>{
        if(!board.isConnected)return;
        api.updateScene({appState:{
          selectedElementIds:{...current.base,...Object.fromEntries([...ids].map(id=>[id,true]))},
          selectedLinearElement:null,editingTextElement:null
        }});
      });
    };
    const cancel=()=>{gesture=null;clearOutline()};
    board.addEventListener("pointerdown",down,true);
    window.addEventListener("pointermove",move,true);
    window.addEventListener("pointerup",up,true);
    window.addEventListener("pointercancel",cancel,true);
    return()=>{
      clearOutline();
      board.removeEventListener("pointerdown",down,true);
      window.removeEventListener("pointermove",move,true);
      window.removeEventListener("pointerup",up,true);
      window.removeEventListener("pointercancel",cancel,true);
    };
  },[api,authorized]);

  useEffect(()=>{
    if(!selectionLocked)return;
    const preventEdit=e=>{
      if(e.target.closest('input,textarea,[contenteditable="true"]'))return;
      const command=e.ctrlKey||e.metaKey;
      if(["Delete","Backspace","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Enter"].includes(e.key)||(command&&["d","x","v"].includes(e.key.toLowerCase()))){e.preventDefault();e.stopImmediatePropagation()}
    };
    window.addEventListener("keydown",preventEdit,true);
    return()=>window.removeEventListener("keydown",preventEdit,true);
  },[selectionLocked]);

  // Only one auxiliary panel is open; Escape and outside taps dismiss it.
  function closePanels(){setStickerMenu(false);setMusicOpen(false);setPatternMenu(false)}
  function togglePanel(panel){
    setStickerMenu(panel === "stickers" && !stickerMenu);
    setMusicOpen(panel === "music" && !musicOpen);
    setPatternMenu(panel === "background" && !patternMenu);
  }
  useEffect(()=>{
    if(!stickerMenu&&!musicOpen&&!patternMenu)return;
    const dismiss=e=>{if(!e.target.closest(".workspace-toolbar"))closePanels()};
    const escape=e=>{if(e.key==="Escape")closePanels()};
    document.addEventListener("pointerdown",dismiss);
    document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape)};
  },[stickerMenu,musicOpen,patternMenu]);
  // Hide the compact tools drawer on outside taps or Escape, without touching the board.
  useEffect(()=>{
    if(!toolsOpen)return;
    const outside=e=>{
      if(e.target instanceof Element&&!e.target.closest(".workspace-toolbox")){
        setToolsOpen(false);
        closePanels();
      }
    };
    const escape=e=>{
      if(e.key==="Escape"){setToolsOpen(false);closePanels()}
    };
    document.addEventListener("pointerdown",outside);
    document.addEventListener("keydown",escape);
    return()=>{
      document.removeEventListener("pointerdown",outside);
      document.removeEventListener("keydown",escape);
    };
  },[toolsOpen]);

  async function searchGiphy(event) {
    event.preventDefault();
    if(!searchQuery.trim())return;
    setSearchBusy(true);setStickerError("");
    try {
      const r=await fetch("/api/sticker-search?q="+encodeURIComponent(searchQuery)+"&kind="+searchKind+"&source="+searchSource);
      const data=await readApiJson(r,"/api/sticker-search");
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
  async function readApiJson(response,endpoint){
    const type=response.headers.get("content-type")||"";
    const body=await response.text();
    if(!type.includes("application/json")){
      throw Error(endpoint+" returned "+response.status+" "+(type||"unknown content type")+". Cloudflare may be serving HTML instead of the API. Check Pages Functions deployment.");
    }
    let data;
    try{data=JSON.parse(body)}catch{throw Error(endpoint+" returned invalid JSON (HTTP "+response.status+")")}
    if(!response.ok)throw Error(endpoint+" HTTP "+response.status+": "+(data.error||"Request failed"));
    return data;
  }
  async function importSticker(item,asFavorite=false) {
    setStickerError("");
    try {
      if(!apiRef.current)throw Error("Board is not ready yet");
      const r=await fetch("/api/sticker-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:item.url,name:item.title})});
      const data=await readApiJson(r,"/api/sticker-import");
      await loadStickers();
      if(asFavorite) {
        const fav=await fetch("/api/sticker-favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:data.id})});
        if(fav.ok)setFavoriteIds(old=>[...old,data.id]);
      }else {
        const added=await placeSticker({id:data.id});
        if(!added)throw Error("Sticker could not be added to the board");
      }
    }catch(e){setStickerError(e.message)}
  }
  async function loadStickers(more=false) {
    if(stickerLoading)return;setStickerLoading(true);
    try {
      const r=await fetch("/api/stickers"+(more&&stickerCursor?"?cursor="+encodeURIComponent(stickerCursor):""),{cache:"no-store"});
      if(!r.ok)throw Error("Sticker storage unavailable");
      const data=await r.json();setStickerCursor(data.cursor||null);setStickers(old=>more?[...new Map([...old,...data.stickers].map(item=>[item.id,item])).values()]:data.stickers);
    }catch(e){setStickerError(e.message)}finally{setStickerLoading(false)}
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
      const form=new FormData();form.append("file",file);const preview=await thumbnail(file);if(preview)form.append("preview",preview,"preview.webp");
      try{const r=await fetch("/api/stickers",{method:"POST",body:form});
        const data=await r.json();if(!r.ok)throw Error(data.error||"Upload failed");
      }catch(e){setStickerError(e.message)}
    }
    loadStickers();
  }
  async function restoreBoardImage(fileId){
    if(!fileId||String(fileId).startsWith("sticker:"))return;
    if(imageLoads.current.has(fileId))return imageLoads.current.get(fileId);
    const task=(async()=>{
      const response=await fetch("/api/board-image?id="+encodeURIComponent(fileId),{signal:AbortSignal.timeout(30000)});
      if(response.status===404){
        let local=apiRef.current?.getFiles()?.[fileId];
        if(!local?.dataURL)local=(await storageRead("images")).find(image=>image.id===fileId);
        if(local?.dataURL){
          const record={...local,id:fileId};
          apiRef.current?.addFiles([record]);
          imageUploads.current.delete(fileId);
          imageQueue.current.set(fileId,record);
          storageWrite("images",[record]).catch(()=>setImageStatus("تعذّر حفظ الصورة محليًا؛ سنحاول رفعها تلقائيًا"));
          pumpImageUploads();
          return;
        }
        const error=Error("Saved image is missing");error.status=404;throw error;
      }
      if(!response.ok)throw Error("Saved image unavailable");
      const blob=await response.blob();
      const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
      imageUploads.current.add(fileId);
      apiRef.current?.addFiles([{id:fileId,dataURL,mimeType:blob.type||"image/png",created:Date.now(),lastRetrieved:Date.now()}]);
    })();
    imageLoads.current.set(fileId,task);
    try{await task}finally{imageLoads.current.delete(fileId)}
  }
  function queueSceneImages(elements){
    for(const e of elements){
      if(e.isDeleted||e.type!=="image"||!e.fileId)continue;
      const id=e.fileId;
      if(String(id).startsWith("sticker:")){
        if(!apiRef.current?.getFiles()?.[id])imageReadQueue.current.set(id,e);
      }else if(!imageUploads.current.has(id)&&!imageReadMissing.current.has(id)&&!imageQueue.current.has(id)&&!imageInFlight.current.has(id)){
        // Confirm the remote blob exists before treating the scene reference as healthy.
        if(!imageReadQueue.current.has(id))imageReadQueue.current.set(id,e);
      }
    }
    pumpImageReads();
  }
  function pumpImageReads(){
    const state=apiRef.current?.getAppState();if(!state)return;
    const view={x:state.scrollX,y:state.scrollY,zoom:state.zoom.value};
    const sorted=[...imageReadQueue.current.entries()].sort((a,b)=>Number(isVisible(b[1],view,innerWidth,innerHeight))-Number(isVisible(a[1],view,innerWidth,innerHeight)));
    while(imageReadActive.current<3&&sorted.length){
      const [id]=sorted.shift();imageReadQueue.current.delete(id);imageReadActive.current++;
      const task=String(id).startsWith("sticker:")?loadImageFile(id):restoreBoardImage(id);
      task.then(()=>{imageReadRetries.current.delete(id);if(!imageQueue.current.size)setImageStatus("")}).catch(error=>{
        if(error.status!==404){
          const retries=imageReadRetries.current.get(id)||0;
          if(retries<2){
            imageReadRetries.current.set(id,retries+1);
            setTimeout(()=>{if(!apiRef.current?.getFiles()?.[id]&&!imageUploads.current.has(id)){imageReadQueue.current.set(id,apiRef.current?.getSceneElements()?.find(element=>element.fileId===id)||{fileId:id});pumpImageReads()}},800*(retries+1));
          }else setImageStatus("تعذّر تحميل بعض الصور؛ سنحاول تلقائيًا عند عودة الاتصال");
        }else {imageReadMissing.current.add(id);setImageStatus("بعض الصور غير متوفرة على التخزين ولا توجد لها نسخة محلية")}
      }).finally(()=>{imageReadActive.current--;pumpImageReads()});
    }
  }
  function persistBoardImages(elements,files){
    if(!files)return;
    const live=new Set();
    for(const e of elements){
      if(e.isDeleted||e.type!=="image"||!e.fileId||String(e.fileId).startsWith("sticker:"))continue;
      live.add(e.fileId);
      const file=files[e.fileId];
      if(!file?.dataURL||imageUploads.current.has(e.fileId)||imageQueue.current.has(e.fileId))continue;
      const record={...file,id:e.fileId};
      imageQueue.current.set(e.fileId,record);
      storageWrite("images",[record]).catch(()=>setImageStatus("تعذّر حفظ الصورة محليًا؛ انتظر اكتمال رفعها"));
    }
    for(const id of imageQueue.current.keys())if(!live.has(id)&&!imageInFlight.current.has(id)){
      imageQueue.current.delete(id);storageWrite("images",[],[id]).catch(()=>{});
    }
    pumpImageUploads();
  }
  function pumpImageUploads(){
    if(!authorized||!apiRef.current)return;
    for(const [id,file] of imageQueue.current){
      if(imageInFlight.current.size>=2)break;
      if(imageInFlight.current.has(id))continue;
      imageInFlight.current.add(id);setImageStatus("جارٍ حفظ الصور…");
      (async()=>{
        const blob=await (await fetch(file.dataURL)).blob();
        if(blob.size>30*1024*1024)throw Error("صورة أكبر من 30 MB؛ احذفها وأضف نسخة أصغر");
        const form=new FormData();form.append("id",id);form.append("file",blob,"image");
        const response=await fetch("/api/board-image",{method:"POST",body:form,signal:AbortSignal.timeout(60000)});
        if(!response.ok)throw Error("تعذّر رفع صورة؛ سنعيد المحاولة");
        imageUploads.current.add(id);imageQueue.current.delete(id);
        await storageWrite("images",[],[id]).catch(()=>{});
        setImageStatus(imageQueue.current.size?"جارٍ حفظ الصور…":"");
      })().catch(error=>setImageStatus(error.message)).finally(()=>imageInFlight.current.delete(id));
    }
  }
  useEffect(()=>{
    if(!authorized)return;
    const timer=setInterval(()=>pumpImageUploads(),4000);
    return()=>clearInterval(timer);
  },[authorized,api]);
  useEffect(()=>()=>cancelAnimationFrame(viewFrame.current),[]);
  async function loadImageFile(fileId) {
    if(!apiRef.current||!fileId?.startsWith("sticker:"))return;
    if(apiRef.current.getFiles()[fileId])return;
    if(imageLoads.current.has(fileId))return imageLoads.current.get(fileId);
    const task=(async()=>{
      const id=fileId.slice(8);
      const r=await fetch("/api/sticker-file?id="+encodeURIComponent(id),{signal:AbortSignal.timeout(30000)});
      if(!r.ok)throw Error("Image unavailable");
      const blob=await r.blob();
      const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
      // Excalidraw canvas images do not reliably accept GIF binaries.
      // Use a transparent PNG as the native selection/resize surface. The animated GIF is the only visible layer.
      let dataURL=source,mimeType=blob.type||"image/png";
      if(mimeType==="image/gif"){
        dataURL=await new Promise((resolve,reject)=>{
          const image=new Image();
          image.onload=()=>{
            try{
              const canvas=document.createElement("canvas");
              canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
              // Intentionally leave the PNG transparent to avoid a frozen duplicate behind the GIF.
              resolve(canvas.toDataURL("image/png"));
            }catch(e){reject(e)}
          };
          image.onerror=()=>reject(Error("GIF preview could not be decoded"));
          image.src=source;
        });
        mimeType="image/png";
      }
      apiRef.current?.addFiles([{id:fileId,dataURL,mimeType,created:Date.now(),lastRetrieved:Date.now()}]);
    })();
    imageLoads.current.set(fileId,task);
    try{await task}finally{imageLoads.current.delete(fileId)}
  }
  useEffect(()=>{
    if(!selectedPack)return;
    let active=true;
    setPackItems([]);setPackPage(1);setPackQuery("");setPackLoading(true);
    getStickerPackItems(selectedPack).then(items=>{if(active)setPackItems(items)}).catch(error=>{if(active)setStickerError(error.message)}).finally(()=>{if(active)setPackLoading(false)});
    return()=>{active=false};
  },[selectedPack]);

  async function addPackSticker(item){
    if(!apiRef.current){setStickerError("Board editor is not ready");return}
    setStickerError("");
    try{
      const response=await fetch(item.url);
      if(!response.ok)throw Error("Sticker image unavailable");
      const svg=await response.text();
      if(!/<svg(?:\s|>)/i.test(svg))throw Error("Sticker is not SVG");
      const source=new Blob([svg],{type:"image/svg+xml"});
      const bitmap=await createImageBitmap(source).catch(()=>null);
      const img=bitmap || await new Promise((resolve,reject)=>{
        const image=new Image(),objectUrl=URL.createObjectURL(source);
        image.onload=()=>{URL.revokeObjectURL(objectUrl);resolve(image)};
        image.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(Error("Could not render sticker"))};
        image.src=objectUrl;
      });
      const canvas=document.createElement("canvas");
      const ratio=Math.min(3,1024/Math.max(img.width||256,img.height||256));
      canvas.width=Math.max(1,Math.round((img.width||256)*ratio));
      canvas.height=Math.max(1,Math.round((img.height||256)*ratio));
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      bitmap?.close();
      const dataURL=canvas.toDataURL("image/png");
      const fileId=crypto.randomUUID();
      apiRef.current.addFiles([{id:fileId,dataURL,mimeType:"image/png",created:Date.now(),lastRetrieved:Date.now()}]);
      const state=apiRef.current.getAppState(),zoom=state.zoom?.value||1;
      const width=150,height=width*canvas.height/canvas.width;
      const id=crypto.randomUUID();
      const x=innerWidth/(2*zoom)-(state.scrollX||0)-width/2;
      const y=innerHeight/(2*zoom)-(state.scrollY||0)-height/2;
      const element={id,type:"image",x,y,width,height,angle:0,strokeColor:"transparent",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:1,strokeStyle:"solid",roughness:0,opacity:100,groupIds:[],frameId:null,roundness:null,seed:Math.floor(Math.random()*2147483647),version:1,versionNonce:Math.floor(Math.random()*2147483647),isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false,fileId,status:"saved",scale:[1,1]};
      apiRef.current.updateScene({elements:[...apiRef.current.getSceneElementsIncludingDeleted(),element],appState:{selectedElementIds:{[id]:true}}});
      pending.current.set(id,element);known.current.set(id,1);
    }catch(error){setStickerError(error.message)}
  }
  async function placeSticker(sticker,legacy=null) {
    if(!api){setStickerError("Board editor is not ready");return}
    const fileId="sticker:"+sticker.id;
    try{await loadImageFile(fileId)}catch(e){setStickerError(e.message);return}
    const state=api.getAppState(),zoom=state.zoom?.value||1;
    const x=legacy?.x??(state.width/2)/zoom-(state.scrollX||0)-75;
    const y=legacy?.y??(state.height/2)/zoom-(state.scrollY||0)-75;
    const width=legacy?.width||150;
    const files=api.getFiles(),data=files[fileId];
    if(!data?.dataURL){setStickerError("Image data was not loaded");return null}
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
    setStickerError("");
    return element;
  }
  function toggleImageDrawing(){
    const editor=apiRef.current;if(!editor)return;
    const selected=editor.getAppState().selectedElementIds||{};
    const ids=Object.keys(selected).filter(id=>selected[id]);
    if(ids.length!==1)return;
    const elements=editor.getSceneElementsIncludingDeleted();
    const image=elements.find(e=>e.id===ids[0]&&e.type==="image"&&!e.isDeleted&&!e.locked);
    if(!image)return;
    const changed={...image,customData:{...image.customData,allowDrawing:!image.customData?.allowDrawing,drawingLayer:true},version:image.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
    editor.updateScene({elements:elements.map(e=>e.id===image.id?changed:e),captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  }

  useEffect(()=>{
    if(!api||!authorized)return;
    const board=document.querySelector(".board");if(!board)return;
    let gesture=null,forwarding=false;
    const point=e=>{const state=api.getAppState(),r=board.getBoundingClientRect();return {x:(e.clientX-r.left)/state.zoom.value-state.scrollX,y:(e.clientY-r.top)/state.zoom.value-state.scrollY}};
    const blocked=(a,b)=>blockedImages.current.some(e=>segmentHitsImage(a,b,e));
    const stop=e=>{e.preventDefault();e.stopImmediatePropagation()};
    const down=e=>{
      if(e.button!==0||api.getAppState().activeTool.type!=="freedraw"||!e.target.closest?.("canvas"))return;
      const p=point(e);gesture={id:e.pointerId,last:p,event:e,blocked:blocked(p,p),canvas:e.target};
      if(gesture.blocked)stop(e);
    };
    const move=e=>{
      if(forwarding||!gesture||e.pointerId!==gesture.id)return;
      if(gesture.blocked){stop(e);return}
      const p=point(e);
      if(blocked(gesture.last,p)){
        stop(e);gesture.blocked=true;
        const last=gesture.event;
        forwarding=true;
        try{gesture.canvas.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:e.pointerId,pointerType:e.pointerType,clientX:last.clientX,clientY:last.clientY,button:0,buttons:0,isPrimary:e.isPrimary}))}finally{forwarding=false}
      }else{gesture.last=p;gesture.event=e}
    };
    const up=e=>{if(!forwarding&&gesture?.id===e.pointerId){if(gesture.blocked)stop(e);gesture=null}};
    board.addEventListener("pointerdown",down,true);
    window.addEventListener("pointermove",move,{capture:true,passive:false});
    window.addEventListener("pointerup",up,true);
    window.addEventListener("pointercancel",up,true);
    return()=>{board.removeEventListener("pointerdown",down,true);window.removeEventListener("pointermove",move,true);window.removeEventListener("pointerup",up,true);window.removeEventListener("pointercancel",up,true)};
  },[api,authorized]);

  // Reconcile media selection handles only after a resize gesture finishes.
  // The normal drag interaction remains untouched while the pointer is held.
  useEffect(()=>{
    if(!authorized||!api)return;
    const board=document.querySelector(".board");
    if(!board)return;
    let start=null;
    const down=event=>{
      if(event.button!==0)return;
      const selection=api.getAppState().selectedElementIds||{};
      const ids=Object.keys(selection).filter(id=>selection[id]);
      if(ids.length!==1){start=null;return}
      const item=api.getSceneElements().find(e=>e.id===ids[0]&&!e.isDeleted&&(e.customData?.voiceNoteId||e.customData?.music?.id));
      start=item?{id:item.id,width:item.width,height:item.height,pointerId:event.pointerId}:null;
    };
    const up=event=>{
      if(!start||start.pointerId!==event.pointerId)return;
      const original=start;start=null;
      requestAnimationFrame(()=>{
        const elements=api.getSceneElementsIncludingDeleted();
        const item=elements.find(e=>e.id===original.id&&!e.isDeleted);
        if(!item||item.customData?.mediaResponsiveLayout)return;
        if(Math.abs(item.width-original.width)<.01&&Math.abs(item.height-original.height)<.01)return;
        const base=item.customData?.voiceNoteId?{width:240,height:76}:item.customData?.music?.displayMode==="audio"?{width:310,height:98}:{width:400,height:265};
        const ratio=Math.min(item.width/base.width,item.height/base.height);
        const width=base.width*ratio,height=base.height*ratio;
        if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
        if(Math.abs(width-item.width)<.01&&Math.abs(height-item.height)<.01)return;
        const updated={...item,x:item.x+(item.width-width)/2,y:item.y+(item.height-height)/2,width,height,version:(item.version||0)+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
        api.updateScene({elements:elements.map(e=>e.id===item.id?updated:e),captureUpdate:CaptureUpdateAction.IMMEDIATELY});
      });
    };
    const cancel=()=>{start=null};
    board.addEventListener("pointerdown",down,true);
    window.addEventListener("pointerup",up,true);
    window.addEventListener("pointercancel",cancel,true);
    return()=>{board.removeEventListener("pointerdown",down,true);window.removeEventListener("pointerup",up,true);window.removeEventListener("pointercancel",cancel,true)};
  },[api,authorized]);

  function toggleSelectedLock(){
    const editor=apiRef.current;if(!editor)return;
    const selected=editor.getAppState().selectedElementIds||{};
    const elements=editor.getSceneElementsIncludingDeleted();
    const ids=expandLockSelection(elements,Object.keys(selected).filter(id=>selected[id]));
    const lock=!elements.some(e=>ids.has(e.id)&&e.locked&&!e.isDeleted);
    const next=elements.map(e=>!ids.has(e.id)||e.isDeleted?e:{...e,locked:lock,version:e.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()});
    editor.updateScene({elements:next,appState:{selectedElementIds:Object.fromEntries([...ids].map(id=>[id,true])),selectedLinearElement:null},captureUpdate:CaptureUpdateAction.IMMEDIATELY});
  }

  function toggleMediaResponsive(){
    const editor=apiRef.current;
    const id=selectedVoiceId||selectedMusicId;
    if(!editor||!id||selectionLocked)return;
    const elements=editor.getSceneElementsIncludingDeleted();
    const item=elements.find(e=>e.id===id&&!e.isDeleted);
    if(!item)return;
    const enabled=!Boolean(item.customData?.mediaResponsiveLayout);
    const next=elements.map(e=>e.id!==id?e:{...e,customData:{...e.customData,mediaResponsiveLayout:enabled},version:(e.version||0)+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()});
    editor.updateScene({elements:next,captureUpdate:CaptureUpdateAction.IMMEDIATELY});
    setMediaResponsive(enabled);
    const changed=next.find(e=>e.id===id);pending.current.set(id,changed);known.current.set(id,changed.version);
  }

  function setVoiceColor(color){
    const editor=apiRef.current;if(!editor||!selectedVoiceId||selectionLocked)return;
    const elements=editor.getSceneElementsIncludingDeleted();
    const next=elements.map(e=>e.id!==selectedVoiceId?e:{...e,customData:{...e.customData,voiceColor:color},backgroundColor:"transparent",strokeColor:"transparent",version:(e.version||0)+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()});
    editor.updateScene({elements:next});
    const changed=next.find(e=>e.id===selectedVoiceId);if(changed){pending.current.set(changed.id,changed);known.current.set(changed.id,changed.version)}
  }

  function setMusicColor(color){
    const editor=apiRef.current;
    if(!editor||!selectedMusicId)return;
    if(color!=="default"&&!/^#[0-9a-fA-F]{6}$/.test(color))return;
    const selection=editor.getAppState()?.selectedElementIds||{};
    if(Object.keys(selection).filter(id=>selection[id]).length!==1||!selection[selectedMusicId])return;
    const elements=editor.getSceneElementsIncludingDeleted();
    const current=elements.find(e=>e.id===selectedMusicId);
    if(!current||current.isDeleted||current.locked||!current.customData?.music)return;
    if((current.customData.musicColor||"default")===color)return;
    const changed={...current,customData:{...current.customData,musicColor:color},
      version:(current.version||0)+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
    editor.updateScene({elements:elements.map(e=>e.id===changed.id?changed:e)});
    pending.current.set(changed.id,changed);
    known.current.set(changed.id,changed.version);
  }

  useEffect(()=>{
    if(!selectedMusicId){setMusicHex("");return}
    const item=apiRef.current?.getSceneElementsIncludingDeleted?.().find(e=>e.id===selectedMusicId);
    const saved=item?.customData?.musicColor;
    setMusicHex(typeof saved==="string"&&/^#[0-9a-fA-F]{6}$/.test(saved)?saved:"");
  },[selectedMusicId]);

  function addMusicCard(link,title="",displayMode="video",thumbnail="",channel=""){
    const music=typeof link==="object"&&link?.provider==="preview"?link:parseMusicLink(link);
    if(!music){setMusicError("Paste a YouTube video or Spotify track link");return}
    const editor=apiRef.current;if(!editor){setMusicError("Board editor is not ready");return}
    const state=editor.getAppState(),zoom=state.zoom?.value||1,width=displayMode==="audio"?310:400,height=displayMode==="audio"?98:265;
    const id=crypto.randomUUID();
    const element={id,type:"rectangle",x:(state.width/2)/zoom-(state.scrollX||0)-width/2,y:(state.height/2)/zoom-(state.scrollY||0)-height/2,width,height,angle:0,strokeColor:"transparent",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:0,opacity:100,groupIds:[],frameId:null,roundness:{type:3},seed:Math.floor(Math.random()*2147483647),version:1,versionNonce:Math.floor(Math.random()*2147483647),isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false,customData:{music:{...music,title,displayMode,thumbnail,channel}}};
    editor.updateScene({elements:[...editor.getSceneElementsIncludingDeleted(),element],appState:{selectedElementIds:{[id]:true}}});
    pending.current.set(id,element);known.current.set(id,1);setMusicOpen(false);setMusicError("");
  }
  async function searchMusic(e){
    e.preventDefault();const q=musicInput.trim();if(!q)return;
    if(parseMusicLink(q)){addMusicCard(q);return}
    setMusicBusy(true);setMusicError("");setMusicResults([]);
    try{
      const r=await fetch("/api/music-search?q="+encodeURIComponent(q));
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(data.error||"Song search unavailable");
      setMusicResults(data.results||[]);
      if(!data.results?.length)setMusicError("No embeddable songs found. Try another title.");
    }catch(err){setMusicError(err.message||"Song search failed. Paste a YouTube or Spotify link instead.")}
    finally{setMusicBusy(false)}
  }

  function addVoiceCard(audioId){
    const editor=apiRef.current;
    if(!editor)throw Error("Board editor is not ready");
    const state=editor.getAppState(),zoom=state.zoom?.value||1;
    const width=240,height=76;
    const x=(state.width/2)/zoom-(state.scrollX||0)-width/2;
    const y=(state.height/2)/zoom-(state.scrollY||0)-height/2;
    const id=crypto.randomUUID();
    const element={id,type:"rectangle",x,y,width,height,angle:0,strokeColor:"transparent",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:0,opacity:100,groupIds:[],frameId:null,roundness:{type:3},seed:Math.floor(Math.random()*2147483647),version:1,versionNonce:Math.floor(Math.random()*2147483647),isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false,customData:{voiceNoteId:audioId}};
    editor.updateScene({elements:[...editor.getSceneElementsIncludingDeleted(),element],appState:{selectedElementIds:{[id]:true}}});
    pending.current.set(id,element);known.current.set(id,1);

  }
  async function startVoice(){
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setStickerError("Voice recording is not supported in this browser");return}
    try{
      setStickerError("");
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      const type=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t=>MediaRecorder.isTypeSupported(t));
      if(!type){stream.getTracks().forEach(t=>t.stop());throw Error("No supported recording format")}
      const recorder=new MediaRecorder(stream,{mimeType:type,audioBitsPerSecond:256000});
      const chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      recorder.onerror=()=>setStickerError("Microphone recording failed");
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        if(voiceStreamRef.current===stream)voiceStreamRef.current=null;
        if(recorderRef.current===recorder)recorderRef.current=null;
        setRecording(false);
        // A cancelled recording is discarded locally; never upload or add it to the board.
        if(recorder.discardRecording)return;
        setVoiceBusy(true);
        try{
          const blob=new Blob(chunks,{type:type.split(";")[0]});
          if(!blob.size)throw Error("Recording was empty");
          const form=new FormData();form.append("audio",blob,"voice."+type.split("/")[1].split(";")[0]);
          const response=await fetch("/api/voice-notes",{method:"POST",body:form});
          const data=await readApiJson(response,"/api/voice-notes");
          addVoiceCard(data.id);
        }catch(e){setStickerError(e.message)}
        finally{setVoiceBusy(false)}
      };
      recorderRef.current=recorder;voiceStreamRef.current=stream;recorder.start(250);setRecording(true);
    }catch(e){setStickerError("Microphone: "+e.message)}
  }
  function stopVoice(){
    if(recorderRef.current?.state==="recording")recorderRef.current.stop();
  }
  function cancelVoice(){
    const recorder=recorderRef.current;
    if(!recorder||recorder.state!=="recording")return;
    // Mark as discarded BEFORE stopping; MediaRecorder always fires onstop.
    recorder.discardRecording=true;
    recorder.stop();
    voiceStreamRef.current?.getTracks().forEach(track=>track.stop());
    setRecording(false);
  }
  useEffect(()=>()=>{const recorder=recorderRef.current;if(recorder?.state==="recording"){recorder.discardRecording=true;recorder.stop()}voiceStreamRef.current?.getTracks().forEach(t=>t.stop())},[]);
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

  function onChange(elements, appState, files) {
    // Camera movement fires onChange every frame. Excalidraw keeps the same
    // scene array when only appState changes, so avoid an O(N) scene-version
    // scan on every pan/zoom frame (N can be hundreds of elements).
    const cachedScene=sceneCache.current;
    const sceneVersion=cachedScene?.elements===elements
      ? cachedScene.version : getSceneVersion(elements);
    const changed=cachedScene?.elements!==elements||cachedScene?.version!==sceneVersion;
    const filesChanged=sceneCache.current?.files!==files;
    if(changed){
    if(!applying.current){
      let repaired=false;
      const comparable=e=>JSON.stringify(Object.fromEntries(Object.entries(e).filter(([key])=>!["version","versionNonce","updated","locked"].includes(key))));
      const safe=elements.map(e=>{
        const previous=lockedSnapshot.current.get(e.id);
        if(!previous?.locked||(previous.version===e.version&&previous.versionNonce===e.versionNonce)||comparable(previous)===comparable(e))return e;
        repaired=true;
        return {...previous,locked:e.locked,version:Math.max(previous.version,e.version)+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
      });
      const present=new Set(safe.map(e=>e.id));
      for(const [id,previous] of lockedSnapshot.current){if(!present.has(id)){safe.push(previous);repaired=true}}
      if(repaired){
        lockedSnapshot.current=new Map(safe.filter(e=>e.locked&&!e.isDeleted).map(e=>[e.id,structuredClone(e)]));
        const selection={...lastSelection.current};
        queueMicrotask(()=>apiRef.current?.updateScene({elements:safe,appState:{selectedElementIds:selection,selectedLinearElement:null}}));
        return;
      }
    }
    lockedSnapshot.current=new Map(elements.filter(e=>e.locked&&!e.isDeleted).map(e=>{
      const previous=lockedSnapshot.current.get(e.id);
      return [e.id,previous&&previous.version===e.version&&previous.versionNonce===e.versionNonce?previous:structuredClone(e)];
    }));

      const images=[],voices=[],musics=[],strokes=[];
      const nextViews=new Map();
      for(const source of elements){
        if(source.isDeleted)continue;
        if(source.type!=="image"&&source.type!=="freedraw"&&!source.customData?.voiceNoteId&&!source.customData?.music?.id)continue;
        const previous=elementViews.current.get(source.id);
        const e=previous&&previous.version===source.version&&previous.versionNonce===source.versionNonce?previous:{...source};
        nextViews.set(e.id,e);
        if(e.type==="image"&&e.fileId)images.push(e);
        if(e.customData?.voiceNoteId)voices.push(e);
        if(e.customData?.music?.id)musics.push(e);
        if(e.type==="freedraw")strokes.push(e);
      }
      elementViews.current=nextViews;
      blockedImages.current=images.filter(e=>!e.customData?.allowDrawing);
      const same=(old,next)=>old.length===next.length&&old.every((e,i)=>e===next[i]);
      setInkStrokes(old=>same(old,strokes)?old:strokes);
      setSceneImages(old=>same(old,images)?old:images);
      setVoiceCards(old=>same(old,voices)?old:voices);
      setMusicCards(old=>same(old,musics)?old:musics);
      sync.observe(elements);
    }
    if(changed||filesChanged){
      persistBoardImages(elements,files);
      // Keep only referenced sources, and reuse the original strings.
      const available=files||apiRef.current?.getFiles?.()||{};
      const sources={};
      for(const e of elements)if(!e.isDeleted&&e.type==="image"&&available[e.fileId]?.dataURL)sources[e.fileId]=available[e.fileId].dataURL;
      setImageSources(old=>Object.keys(old).length===Object.keys(sources).length&&Object.keys(sources).every(id=>old[id]===sources[id])?old:sources);
    }
    if (appState && (changed || lastSelection.current!==appState.selectedElementIds || sceneCache.current?.tool!==appState.activeTool?.type)) {
      setHandActive(appState.activeTool?.type==="hand");
      const isPen=appState.activeTool?.type==="freedraw";
      setPenActive(old=>old===isPen?old:isPen);
      const selectedIds=Object.keys(appState.selectedElementIds||{}).filter(id=>appState.selectedElementIds[id]);
      const selectedSet=new Set(selectedIds),byId=new Map(elements.map(e=>[e.id,e]));
      setSelectionLocked(selectedIds.some(id=>{const e=byId.get(id);return e&&!e.isDeleted&&e.locked}));
      setSelectedBoardIds(old=>old.length===selectedIds.length&&old.every(id=>selectedSet.has(id))?old:selectedIds);
      const mediaOnly=selectedIds.length>0&&selectedIds.every(id=>{
        const item=byId.get(id);
        return item&&!item.isDeleted&&(item.customData?.voiceNoteId||item.customData?.music?.id);
      });
      document.querySelector(".board")?.classList.toggle("board-media-selected",Boolean(mediaOnly));
      const selected=elements.find(e=>e.customData?.voiceNoteId&&appState.selectedElementIds?.[e.id]);
      setSelectedVoiceId(old=>old===(selected?.id||null)?old:(selected?.id||null));
      const selectedMusic=selectedIds.length===1?elements.find(e=>!e.isDeleted&&e.customData?.music&&appState.selectedElementIds?.[e.id]):null;
      setSelectedMusicId(old=>old===(selectedMusic?.id||null)?old:(selectedMusic?.id||null));
      setMediaResponsive(Boolean((selectedMusic||selected)?.customData?.mediaResponsiveLayout));
    }
    if(appState){
      const next = { zoom: appState.zoom?.value || 1, x: appState.scrollX || 0, y: appState.scrollY || 0 };
      const previous=viewNext.current;
      if(!previous||previous.x!==next.x||previous.y!==next.y||previous.zoom!==next.zoom){
        boardRoot.current?.style.setProperty("--world-x",next.x*next.zoom+"px");
        boardRoot.current?.style.setProperty("--world-y",next.y*next.zoom+"px");
        boardRoot.current?.style.setProperty("--world-zoom",String(next.zoom));
      }
      viewNext.current=next;
      if((!previous||previous.x!==next.x||previous.y!==next.y||previous.zoom!==next.zoom)&&!viewFrame.current)viewFrame.current=requestAnimationFrame(()=>{
        viewFrame.current=0;const view=viewNext.current;
        setViewport(old=>old.zoom===view.zoom&&old.x===view.x&&old.y===view.y?old:view);
      });
    }
    lastSelection.current=appState?.selectedElementIds;
    sceneCache.current={elements,files,version:sceneVersion,tool:appState?.activeTool?.type};
  }

  if (!authorized) return <form className="login" onSubmit={login}><h1>Our Whiteboard ♡</h1><p>Enter our 6-digit code</p><input aria-label="6-digit code" type="password" inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}/><button type="submit">Open board</button><p role="alert">{loginError}</p></form>;
  return <main className={`workspace workspace-${theme} ${toolsOpen?"workspace-tools-open":""}`}>
    <div className="workspace-quick-actions" role="group" aria-label="أدوات اللوحة">

    {startWithHand&&<button type="button" className="board-navigation-toggle" disabled={!sync.ready||!api}
      aria-label={handActive?"التبديل إلى التحديد والتعديل":"التبديل إلى تحريك اللوحة"} aria-pressed={handActive} title="بدّل بين تحريك اللوحة وتحديد العناصر"
      onClick={()=>{
        api.updateScene({appState:{selectedElementIds:{},selectedGroupIds:{},editingTextElement:null}});
        api.setActiveTool({type:handActive?"selection":"hand"});
      }}><svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{handActive?<path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 4-3 7-7 7-3 0-5-2-7-4l-3-4a2 2 0 0 1 3-2l2 2"/>:<path d="m5 3 14 9-7 1-3 7z"/>}</svg></button>}
    <div className={`workspace-toolbox ${toolsOpen?"is-open":""}`}>
      <button type="button" className="workspace-toolbox-trigger" onClick={()=>{if(toolsOpen)closePanels();setToolsOpen(open=>!open)}} aria-expanded={toolsOpen} aria-controls="workspace-tools-menu" disabled={!sync.ready} aria-label={toolsOpen?"Close tools menu":"Open tools menu"}>
        <span aria-hidden="true">{toolsOpen?"×":"☰"}</span><span className="workspace-toolbox-label">{toolsOpen?"Close":"Tools"}</span>
      </button>
      <aside id="workspace-tools-menu" className="workspace-toolbar" aria-label="Board tools" aria-hidden={!toolsOpen} inert={!toolsOpen||!sync.ready}><div className="save-indicator" role="status" aria-live="polite">{status}</div><div className="music-controls"><button type="button" aria-expanded={musicOpen} onClick={()=>togglePanel("music")}>♫ Music</button>{musicOpen&&<section aria-label="Add music" className={"music-panel music-panel-"+theme}><button className="panel-close" type="button" onClick={()=>setMusicOpen(false)} aria-label="Close music">×</button><form onSubmit={searchMusic}><input aria-label="Song name or link" placeholder="Song name or YouTube / Spotify URL" value={musicInput} onChange={e=>setMusicInput(e.target.value)}/><button type="submit" disabled={musicBusy}>{musicBusy?"Searching…":"Search / Add"}</button></form>{musicError&&<small role="alert">{musicError}</small>}<div className="music-results">{musicResults.map(item=><div key={item.id} className="music-result">{item.thumbnail&&<img src={item.thumbnail} alt=""/>}<div><strong>{item.title}</strong><small>{item.channel}</small><div className="music-add-options"><button type="button" onClick={()=>addMusicCard("https://www.youtube.com/watch?v="+item.id,item.title,"audio",item.thumbnail,item.channel)}>Add audio</button><button type="button" onClick={()=>addMusicCard("https://www.youtube.com/watch?v="+item.id,item.title,"video",item.thumbnail,item.channel)}>Add video</button></div></div></div>)}</div><small>Choose Audio for a compact song card, or Video for the YouTube player. Some videos restrict embedding.</small></section>}</div><div className="voice-controls"><button type="button" disabled={voiceBusy} onClick={recording?stopVoice:startVoice}>{voiceBusy?"Saving…":recording?"■ Stop voice":"🎙 Voice note"}</button>{recording&&<button type="button" className="voice-cancel-recording" onClick={cancelVoice} title="Discard this recording without saving" aria-label="Discard voice recording">🗑 Cancel</button>}{recording&&<span className="voice-live">● Recording</span>}</div><button type="button" className={`theme-toggle ${theme==="dark"?"theme-toggle--dark":"theme-toggle--light"}`} title="Change theme" onClick={toggleTheme} aria-label="Toggle dark mode">{theme==="dark"?"☀️ Light":"🌙 Dark"}</button><div className="pattern-controls"><button type="button" className={`pattern-button ${theme==="dark"?"pattern-dark":"pattern-light"}`} onClick={()=>togglePanel("background")} aria-expanded={patternMenu}>▦ Background</button>{patternMenu&&<div className={`pattern-menu ${theme==="dark"?"pattern-dark":"pattern-light"}`}>{[["none","Blank"],["lines","Horizontal lines"],["squares","Small squares"],["dots","Dots"],["graph","Graph paper"]].map(([id,label])=><button type="button" key={id} className={pattern===id?"selected":""} onClick={()=>choosePattern(id)}>{label}</button>)}</div>}</div>
    <>
    <button type="button" className="doodle-panel-trigger" onClick={()=>togglePanel("stickers")} aria-expanded={stickerMenu}>♡ Stickers</button>
    {stickerMenu&&<section className={`sticker-library-inline doodle-panel ${theme==="dark"?"pattern-dark":"pattern-light"}`}>
      <button type="button" className="doodle-panel-close" onClick={()=>setStickerMenu(false)} aria-label="Close stickers">×</button>
      <div className="sticker-library-content">
        <div className="sticker-tabs">{[["saved","Saved"],["favorites","♡ Favorites"],["packs","Doodles"],["search","Search"]].map(([id,label])=><button type="button" key={id} className={stickerTab===id?"active":""} onClick={()=>setStickerTab(id)}>{label}</button>)}</div>
        {stickerTab==="saved"&&<>
          <label className="sticker-upload">＋ Upload PNG / JPG / WebP / GIF<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={uploadSticker} hidden/></label>
          <div className="sticker-grid">{stickers.slice(0,savedPage*48).map(sticker=><div className="sticker-tile" key={sticker.id}><button type="button" title={sticker.name} onClick={()=>placeSticker(sticker)}><StickerThumbnail sticker={sticker}/></button><button type="button" className="favorite-action" aria-label="Toggle favorite" onClick={()=>toggleFavorite(sticker.id)}>{favoriteIds.includes(sticker.id)?"♥":"♡"}</button></div>)}</div>
        </>}
        {["saved","favorites"].includes(stickerTab)&&(stickers.length>savedPage*48||stickerCursor)&&<button type="button" disabled={stickerLoading} onClick={()=>{setSavedPage(p=>p+1);if(stickerCursor)loadStickers(true)}}>عرض المزيد</button>}
        {stickerTab==="favorites"&&<div className="sticker-grid">{stickers.filter(s=>favoriteIds.includes(s.id)).slice(0,savedPage*48).map(sticker=><div className="sticker-tile" key={sticker.id}><button type="button" onClick={()=>placeSticker(sticker)}><StickerThumbnail sticker={sticker}/></button><button type="button" className="favorite-action" onClick={()=>toggleFavorite(sticker.id)} aria-label="Remove favorite">♥</button></div>)}</div>}
        {stickerTab==="packs"&&<div className="doodle-library">
          {!selectedPack?<div className="doodle-folders">{STICKER_PACKS.map(pack=><button type="button" key={pack.id} onClick={()=>setSelectedPack(pack)}><span>📁 {pack.name}</span><small>{pack.description}</small></button>)}</div>:<>
            <button type="button" className="doodle-back" onClick={()=>setSelectedPack(null)}>← Folders</button>
            <strong>{selectedPack.name}</strong>
            <input className="doodle-filter" value={packQuery} onChange={e=>{setPackQuery(e.target.value);setPackPage(1)}} placeholder="Search drawings…" aria-label="Search doodles"/>
            {packLoading?<small>Loading folder…</small>:<><small>{packItems.filter(item=>item.name.toLowerCase().includes(packQuery.toLowerCase())).length} stickers · {selectedPack.license}</small>
            <div className="sticker-grid doodle-grid">{packItems.filter(item=>item.name.toLowerCase().includes(packQuery.toLowerCase())).slice(0,packPage*60).map(item=><button type="button" key={item.url} title={item.name} onClick={()=>addPackSticker(item)}><img loading="lazy" src={item.url} alt={item.name}/></button>)}</div>
            {packItems.filter(item=>item.name.toLowerCase().includes(packQuery.toLowerCase())).length>packPage*60&&<button type="button" className="doodle-more" onClick={()=>setPackPage(n=>n+1)}>Load more</button>}</>}
          </>}
          </div>}
        {stickerTab==="search"&&<>
          <form className="sticker-search" onSubmit={searchGiphy}>
            <input aria-label="Search GIFs and stickers" placeholder="Search stickers or GIFs…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}/>
            <select aria-label="Sticker source" value={searchSource} onChange={e=>{setSearchSource(e.target.value);setSearchItems([])}}><option value="giphy">GIPHY</option><option value="commons">Wikimedia Commons</option></select>
            {searchSource==="giphy"&&<select aria-label="Search type" value={searchKind} onChange={e=>setSearchKind(e.target.value)}><option value="stickers">Stickers</option><option value="gif">GIFs</option></select>}
            <button type="submit" disabled={searchBusy}>{searchBusy?"…":"Search"}</button>
          </form>
          <div className="sticker-grid">{searchItems.map(item=><div className="sticker-tile" key={item.id}><button type="button" title={"Save and add "+item.title} onClick={()=>importSticker(item)}><img loading="lazy" decoding="async" src={item.preview} alt={item.title}/></button><button type="button" className="favorite-action" title="Save to favorites" onClick={()=>importSticker(item,true)}>♡</button></div>)}</div>
          <small>GIFs by GIPHY · Images from Wikimedia Commons (check individual licenses)</small>
        </>}
        {stickerError&&<small role="alert">{stickerError}</small>}
      </div>
    </section>}
    </>
    <div className="workspace-menu-footer"><button type="button" className="workspace-logout" onClick={logout}>تسجيل الخروج</button></div>
</aside>
    </div>

    </div>
    {(stickerError||imageStatus||sync.storageError||sync.conflicts.length>0)&&<div className="workspace-notices" aria-live="polite">
      {imageStatus&&<span>{imageStatus}</span>}
      {sync.storageError&&<span role="alert">الحفظ المحلي غير متاح؛ لا تغلق الصفحة قبل الحفظ</span>}
      {sync.conflicts.length>0&&<span>تعارضت {sync.conflicts.length} تعديلات؛ احتفظنا بنسختك. <button type="button" onClick={sync.restoreConflicts}>استبدالها بنسختي</button></span>}
      {stickerError&&<span role="alert">{stickerError} <button type="button" onClick={()=>setStickerError("")} aria-label="إغلاق التنبيه">×</button></span>}
    </div>}

    <div ref={boardRoot} className={`board ${handActive?"board-hand-active":""} ${selectedVoiceId?"board-voice-selected":""} ${selectionLocked?"board-locked-selected":""} ${selectedBoardIds.length===1?"board-single-selected":""} ${selectedBoardIds.length>1?"board-multi-selected":""} ${penActive?"board-pen-active":""}`}>
    {selectedBoardIds.length>0&&<SelectionControls count={selectedBoardIds.length} locked={selectionLocked} customPalette={Boolean(selectedVoiceId||selectedMusicId)}><button type="button" className="selection-lock" onClick={toggleSelectedLock} aria-label={selectionLocked?"Unlock selected items":"Lock selected items"}>{selectionLocked?"Unlock":"Lock"}{selectedBoardIds.length>1?` (${selectedBoardIds.length})`:""}</button>{selectionLocked&&selectedBoardIds.length===1&&<span className="locked-selection-hint">Locked · selection only</span>}{selectedBoardIds.length===1&&selectedVoiceId&&!selectionLocked&&<div className={`voice-palette voice-palette-${theme}`} aria-label="Voice note appearance"><span>Voice color</span><button type="button" className="media-responsive-toggle" aria-pressed={mediaResponsive} onClick={toggleMediaResponsive}>{mediaResponsive?"✓ Responsive layout":"Responsive layout"}</button><div className="voice-palette-swatches">{[["default","Auto"],["violet","Purple"],["blue","Blue"],["rose","Pink"],["mint","Mint"]].map(([value,label])=><button key={value} type="button" className={"voice-swatch voice-swatch-"+value} title={label} aria-label={label} onClick={()=>{setVoiceHex("");setVoiceColor(value)}}>{value==="default"?"◐":""}</button>)}</div><label className="voice-custom-picker" title="Pick a custom color">✎ <input aria-label="Pick any color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(voiceHex)?voiceHex:"#9274db"} onChange={e=>{setVoiceHex(e.target.value);setVoiceColor(e.target.value)}}/></label><form className="voice-hex-form" onSubmit={e=>{e.preventDefault();if(/^#[0-9a-fA-F]{6}$/.test(voiceHex))setVoiceColor(voiceHex)}}><input aria-label="Hex color" placeholder="#9274DB" maxLength={7} value={voiceHex} onChange={e=>setVoiceHex(e.target.value)} /><button type="submit" disabled={!/^#[0-9a-fA-F]{6}$/.test(voiceHex)}>Apply</button></form></div>}
    {selectedBoardIds.length===1&&selectedMusicId&&!selectionLocked&&<div className={`voice-palette music-palette voice-palette-${theme}`} aria-label="Music and video appearance">
      <span>Music / video color</span><button type="button" className="media-responsive-toggle" aria-pressed={mediaResponsive} onClick={toggleMediaResponsive}>{mediaResponsive?"✓ Responsive layout":"Responsive layout"}</button>
      <div className="voice-palette-swatches">
        {[[ "default","Original",null],["#9274db","Purple","#9274db"],["#5394e8","Blue","#5394e8"],["#e078a7","Pink","#e078a7"],["#3eac98","Mint","#3eac98"],["#d99a44","Amber","#d99a44"]].map(([value,label,tone])=><button key={value} type="button" className={`voice-swatch music-color-swatch ${value==="default"?"music-color-original":""}`} style={tone?{backgroundColor:tone}:undefined} title={label} aria-label={label} onClick={()=>{setMusicHex(tone||"");setMusicColor(value)}}>{value==="default"?"◐":""}</button>)}
      </div>
      <label className="voice-custom-picker" title="Pick a custom card color">Custom color <input aria-label="Choose music or video color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(musicHex)?musicHex:"#9274db"} onChange={e=>{setMusicHex(e.target.value);setMusicColor(e.target.value)}}/></label>
      <form className="voice-hex-form" onSubmit={e=>{e.preventDefault();if(/^#[0-9a-fA-F]{6}$/.test(musicHex))setMusicColor(musicHex)}}>
        <input aria-label="Music or video HEX color" placeholder="#9274DB" maxLength={7} value={musicHex} onChange={e=>setMusicHex(e.target.value)}/>
        <button type="submit" disabled={!/^#[0-9a-fA-F]{6}$/.test(musicHex)}>Apply</button>
      </form>
    </div>}
</SelectionControls>}

    <ImageDrawingControl image={selectedBoardIds.length===1?sceneImages.find(e=>e.id===selectedBoardIds[0]):null} onToggle={toggleImageDrawing}/>
    <Excalidraw excalidrawAPI={setApi} onChange={onChange} theme={theme} viewModeEnabled={!sync.ready} initialData={{appState:{viewBackgroundColor:"transparent",activeTool:{type:startWithHand?"hand":"selection"}}}} name="Our Whiteboard" />
    <MediaLayers voices={voiceCards} musics={musicCards} images={sceneImages} sources={imageSources} theme={theme} viewport={viewport}/>
    <ImageInkOverlay images={sceneImages.filter(e=>e.customData?.drawingLayer&&(String(e.fileId).endsWith(".gif")||(theme==="dark"&&imageSources[e.fileId]))&&isVisible(e,viewport,innerWidth,innerHeight))} strokes={inkStrokes} viewport={viewport}/>
    {pattern !== "none" && <div className={`board-pattern pattern-${pattern} pattern-${theme}`} aria-hidden="true" style={{
      "--pattern-size": `${(pattern === "graph" ? 10 : 20) * viewport.zoom}px`,
      "--pattern-x": `${viewport.x * viewport.zoom}px`,
      "--pattern-y": `${viewport.y * viewport.zoom}px`
    }} />}</div></main>;
}
createRoot(document.getElementById("root")).render(<App />);
