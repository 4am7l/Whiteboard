import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./style.css";
import { STICKER_PACKS, getStickerPackItems } from "./stickerPacks";

function VoiceNoteCard({element,theme,viewport}){
  const audioRef=useRef(null);
  const [playing,setPlaying]=useState(false);
  const [time,setTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const color=element.customData?.voiceColor||"default";
  const hex=/^#[0-9a-fA-F]{6}$/.test(color)?color:({violet:"#9274db",blue:"#5394e8",rose:"#e078a7",mint:"#3eac98"}[color]||(theme==="dark"?"#a99af6":"#745bd4"));
  const format=t=>Number.isFinite(t)?Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0"):"0:00";
  const progress=duration>0?Math.min(1,time/duration):0;
  const bars=Array.from({length:32},(_,i)=>7+Math.round(Math.abs(Math.sin(i*1.73)*Math.cos(i*.39)+Math.sin(i*.91)*.48)*17));
  return <div className={`voice-card voice-card-${theme} voice-card-chat`} data-voice-element={element.id} style={{"--voice-accent":hex,left:(element.x+viewport.x)*viewport.zoom+(viewport.zoom-1)*element.width/2,top:(element.y+viewport.y)*viewport.zoom+(viewport.zoom-1)*element.height/2,width:element.width,height:element.height,transform:`rotate(${element.angle||0}rad) scale(${viewport.zoom})`,transformOrigin:"center center",opacity:(element.opacity??100)/100}}>
    <div className="voice-chat-player">
      <button type="button" className="voice-chat-play" aria-label={playing?"Pause voice note":"Play voice note"} onClick={()=>{const a=audioRef.current;if(!a)return;if(a.paused)a.play().catch(()=>setPlaying(false));else a.pause()}}>{playing?<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>:<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>}</button>
      <div className="voice-chat-body"><div className="voice-waveform" role="slider" aria-label="Voice playback position" aria-valuemin={0} aria-valuemax={Math.max(1,Math.round(duration))} aria-valuenow={Math.round(time)} tabIndex={0} onPointerDown={e=>{const a=audioRef.current;if(!a||!Number.isFinite(duration)||duration<=0)return;e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();a.currentTime=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*duration}} onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();e.stopPropagation();if(audioRef.current)audioRef.current.currentTime=Math.max(0,Math.min(duration||0,audioRef.current.currentTime+(e.key==="ArrowRight"?5:-5)))}}}>{bars.map((height,i)=><span key={i} className={i/32<=progress?"played":""} style={{height:height+"px"}}/>)}</div><div className="voice-chat-meta"><span>{format(time)} / {format(duration)}</span></div></div>
    </div>
    <audio ref={audioRef} preload="metadata" src={"/api/voice-notes?id="+encodeURIComponent(element.customData.voiceNoteId)} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)} onLoadedMetadata={e=>setDuration(e.currentTarget.duration)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setTime(0)}}/>
  </div>;
}


function parseMusicLink(raw){
  try{
    const u=new URL(raw.trim());const h=u.hostname.toLowerCase().replace(/^www\./,"");
    if(h==="youtu.be"){const id=u.pathname.split("/")[1];return /^[\w-]{11}$/.test(id)?{provider:"youtube",id}:null}
    if(["youtube.com","m.youtube.com","music.youtube.com","youtube-nocookie.com"].includes(h)){
      const id=u.pathname.startsWith("/shorts/")||u.pathname.startsWith("/embed/")?u.pathname.split("/")[2]:u.searchParams.get("v");
      return /^[\w-]{11}$/.test(id||"")?{provider:"youtube",id}:null;
    }
    if(h==="open.spotify.com"){const parts=u.pathname.split("/").filter(Boolean);const index=parts[0]?.startsWith("intl-")?1:0;return parts[index]==="track"&&/^[a-zA-Z0-9]{22}$/.test(parts[index+1]||"")?{provider:"spotify",id:parts[index+1]}:null}
  }catch{}return null;
}
function MusicCard({element,theme,viewport}){
  const music=element.customData.music;
  const audioMode=music.displayMode==="audio";
  const [active,setActive]=useState(false),[playing,setPlaying]=useState(false),[ready,setReady]=useState(false),[elapsed,setElapsed]=useState(0),[duration,setDuration]=useState(0),[failed,setFailed]=useState(false);
  const mount=useRef(null),player=useRef(null);
  const youtube=music.provider==="youtube";
  const embed=youtube?"https://www.youtube-nocookie.com/embed/"+music.id+"?autoplay=1&rel=0":"https://open.spotify.com/embed/track/"+music.id;
  const url=music.provider==="preview"?(music.url||"https://music.apple.com"):youtube?"https://www.youtube.com/watch?v="+music.id:"https://open.spotify.com/track/"+music.id;
  useEffect(()=>{
    if(!audioMode||!youtube||!mount.current)return;
    let disposed=false;
    const initialize=()=>{
      if(disposed||!mount.current||!window.YT?.Player||player.current)return;
      const node=document.createElement("div");mount.current.appendChild(node);
      player.current=new window.YT.Player(node,{videoId:music.id,width:240,height:200,playerVars:{controls:0,playsinline:1,rel:0},events:{
        onReady:e=>{if(!disposed){setReady(true);e.target.setVolume(80)}},
        onStateChange:e=>{if(!disposed)setPlaying(e.data===window.YT.PlayerState.PLAYING)},
        onError:()=>{if(!disposed)setFailed(true)}
      }});
    };
    if(window.YT?.Player)initialize();else{
      const prior=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{prior?.();initialize()};
      if(!document.querySelector("script[data-youtube-iframe-api]")){const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.dataset.youtubeIframeApi="1";document.head.appendChild(script)}
    }
    return()=>{disposed=true;try{player.current?.destroy?.()}catch{}player.current=null;if(mount.current)mount.current.replaceChildren()};
  },[audioMode,youtube,music.id]);
  useEffect(()=>{if(!ready)return;const timer=setInterval(()=>{try{setElapsed(player.current?.getCurrentTime?.()||0);setDuration(player.current?.getDuration?.()||0)}catch{}},600);return()=>clearInterval(timer)},[ready]);
  const fmt=t=>Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");
  const toggle=()=>{if(!ready)return;playing?player.current?.pauseVideo?.():player.current?.playVideo?.()};
  return <div className={`music-card music-card-${theme} music-glass-card ${audioMode?"music-glass-audio":"music-glass-video"}`} data-music-element={element.id} style={{left:(element.x+viewport.x)*viewport.zoom+(viewport.zoom-1)*element.width/2,top:(element.y+viewport.y)*viewport.zoom+(viewport.zoom-1)*element.height/2,width:element.width,height:element.height,transform:`rotate(${element.angle||0}rad) scale(${viewport.zoom})`,transformOrigin:"center center",opacity:(element.opacity??100)/100}}>
    {audioMode&&youtube?<><div className="music-glass-hidden" aria-hidden="true"><div ref={mount}/></div><div className="music-glass-cover">{music.thumbnail?<img src={music.thumbnail} alt="Album artwork"/>:<div className="music-glass-art">♪</div>}<button type="button" className="music-glass-cover-play" onClick={toggle} disabled={!ready||failed} aria-label={playing?"Pause":"Play"}><svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor">{playing?<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>:<path d="M8 4v16l12-8z"/>}</svg></button></div><div className="music-glass-body"><div className="music-glass-title" title={music.title}>{music.title||"Music"}</div><div className="music-glass-artist">{music.channel||"YouTube"}</div><input type="range" aria-label="Song progress" min="0" max={Math.max(duration,1)} value={Math.min(elapsed,duration||1)} onChange={e=>{player.current?.seekTo?.(Number(e.target.value),true);setElapsed(Number(e.target.value))}}/><div className="music-glass-times"><span>{fmt(elapsed)}</span><span>{fmt(duration)}</span></div></div><a className="music-glass-link" href={url} target="_blank" rel="noopener noreferrer" aria-label="Open original"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6M20 4l-9 9"/><path d="M20 13v6H5V4h6"/></svg></a>{failed&&<a className="music-glass-failure" href={url} target="_blank" rel="noopener noreferrer">Open on YouTube</a>}</>
    :<><div className="music-glass-video-top"><span>{music.title||"YouTube video"}</span><a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open original"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6M20 4l-9 9"/><path d="M20 13v6H5V4h6"/></svg></a></div>{music.provider==="preview"?<div className="music-preview-player"><strong>{music.title}</strong><audio controls src={music.previewUrl}/></div>:active?<iframe title="Song player" src={embed} allow="autoplay;encrypted-media;fullscreen;picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button type="button" className="music-glass-video-poster" onClick={()=>setActive(true)} style={music.thumbnail?{backgroundImage:`linear-gradient(#0002,#0005),url("${music.thumbnail}")`}:undefined}><span className="music-glass-video-play"><svg viewBox="0 0 24 24" width="25" height="25" fill="currentColor"><path d="M8 4v16l12-8z"/></svg></span></button>}</>}
  </div>;
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
  const [selectedBoardIds,setSelectedBoardIds]=useState([]);
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
        await Promise.all(elements.filter(e=>e.type==="image"&&!e.isDeleted).map(e=>String(e.fileId||"").startsWith("sticker:")?loadImageFile(e.fileId).catch(()=>{}):restoreBoardImage(e.fileId).catch(()=>{})));
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
      // Keep each D1 write below the API's 500-element / 2MB limits.
      const batch = [];
      let bytes = 15;
      for (const element of pending.current.values()) {
        const size = JSON.stringify(element).length + 1;
        if (batch.length && (batch.length >= 200 || bytes + size > 1500000)) break;
        batch.push(element);
        bytes += size;
      }
      try {
        const response = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ elements: batch }) });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          throw new Error(detail.error || "Save failed");
        }
        if (!active) return;
        for (const element of batch) {
          if (pending.current.get(element.id)?.versionNonce === element.versionNonce) pending.current.delete(element.id);
        }
        setStatus("Saved");
      } catch (error) { console.error("Board save failed:", error); setStatus("Save failed — retrying"); }
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

  // Keep media on the canvas visible, but never let it cover an open Excalidraw sidebar.
  useEffect(()=>{
    if(!authorized)return;
    const board=document.querySelector(".board");
    if(!board)return;
    const update=()=>{
      const boardRect=board.getBoundingClientRect();
      let left=0,right=0;
      const candidates=board.querySelectorAll('.excalidraw .sidebar, .excalidraw [data-testid="sidebar"], .excalidraw .library-menu, .excalidraw .layer-ui__library, .excalidraw .App-menu_left .Island, .excalidraw .App-menu_left .App-menu__left, .excalidraw .App-menu_left .panelColumn, .excalidraw .App-menu_left .properties-content, .excalidraw .App-menu_left .App-menu__left__content');
      for(const node of candidates){
        const rect=node.getBoundingClientRect();
        if(rect.width<140||rect.height<120||rect.width>boardRect.width*.65||rect.bottom<=boardRect.top||rect.top>=boardRect.bottom)continue;
        if(getComputedStyle(node).visibility==="hidden"||getComputedStyle(node).display==="none")continue;
        if(rect.right>=boardRect.right-24)right=Math.max(right,boardRect.right-rect.left);
        if(rect.left<=boardRect.left+24)left=Math.max(left,rect.right-boardRect.left);
      }
      board.style.setProperty("--media-clip-right",Math.max(0,right)+"px");
      board.style.setProperty("--media-clip-left",Math.max(0,left)+"px");
    };
    const observer=new MutationObserver(update);
    observer.observe(board,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","data-state"]});
    window.addEventListener("resize",update);
    update();
    return()=>{observer.disconnect();window.removeEventListener("resize",update)};
  },[authorized]);
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
  async function restoreBoardImage(fileId){
    if(!fileId||String(fileId).startsWith("sticker:")||apiRef.current?.getFiles()?.[fileId])return;
    if(imageLoads.current.has(fileId))return imageLoads.current.get(fileId);
    const task=(async()=>{
      const response=await fetch("/api/board-image?id="+encodeURIComponent(fileId),{cache:"no-store"});
      if(!response.ok)throw Error("Saved image unavailable");
      const blob=await response.blob();
      const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
      apiRef.current?.addFiles([{id:fileId,dataURL,mimeType:blob.type||"image/png",created:Date.now(),lastRetrieved:Date.now()}]);
    })();
    imageLoads.current.set(fileId,task);
    try{await task}finally{imageLoads.current.delete(fileId)}
  }
  function persistBoardImages(elements,files){
    if(!files)return;
    for(const element of elements){
      if(element.isDeleted||element.type!=="image"||!element.fileId||String(element.fileId).startsWith("sticker:"))continue;
      const file=files[element.fileId];
      if(!file?.dataURL||imageUploads.current.has(element.fileId))continue;
      imageUploads.current.add(element.fileId);
      fetch("/api/board-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:element.fileId,dataURL:file.dataURL})})
        .then(response=>{if(!response.ok)throw Error("Image upload failed")})
        .catch(()=>{imageUploads.current.delete(element.fileId);setStatus("Image save failed — retry by editing the board")});
    }
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
    const x=legacy?.x??(window.innerWidth/2)/zoom-(state.scrollX||0)-75;
    const y=legacy?.y??(window.innerHeight/2)/zoom-(state.scrollY||0)-75;
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
  function deleteSelectedBoardItems(){
    const editor=apiRef.current;
    if(!editor)return;
    const selected=editor.getAppState()?.selectedElementIds||{};
    const ids=Object.keys(selected).filter(id=>selected[id]);
    if(!ids.length)return;
    const idSet=new Set(ids);
    const now=Date.now();
    const next=editor.getSceneElementsIncludingDeleted().map(element=>{
      if(!idSet.has(element.id)||element.isDeleted)return element;
      return {...element,isDeleted:true,version:(element.version||0)+1,versionNonce:Math.floor(Math.random()*2147483647),updated:now};
    });
    editor.updateScene({elements:next,appState:{selectedElementIds:{}}});
    for(const element of next){
      if(!idSet.has(element.id)||!element.isDeleted)continue;
      pending.current.set(element.id,element);
      known.current.set(element.id,element.version||1);
    }
    setSelectedBoardIds([]);
    setSelectedVoiceId(null);
  }
  function setVoiceColor(color){
    const editor=apiRef.current;if(!editor||!selectedVoiceId)return;
    const elements=editor.getSceneElementsIncludingDeleted();
    const next=elements.map(e=>e.id!==selectedVoiceId?e:{...e,customData:{...e.customData,voiceColor:color},backgroundColor:"transparent",strokeColor:"transparent",version:(e.version||0)+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()});
    editor.updateScene({elements:next});
    const changed=next.find(e=>e.id===selectedVoiceId);if(changed){pending.current.set(changed.id,changed);known.current.set(changed.id,changed.version)}
  }

  function addMusicCard(link,title="",displayMode="video",thumbnail="",channel=""){
    const music=typeof link==="object"&&link?.provider==="preview"?link:parseMusicLink(link);
    if(!music){setMusicError("Paste a YouTube video or Spotify track link");return}
    const editor=apiRef.current;if(!editor){setMusicError("Board editor is not ready");return}
    const state=editor.getAppState(),zoom=state.zoom?.value||1,width=displayMode==="audio"?310:400,height=displayMode==="audio"?98:265;
    const id=crypto.randomUUID();
    const element={id,type:"rectangle",x:(window.innerWidth/2)/zoom-(state.scrollX||0)-width/2,y:(window.innerHeight/2)/zoom-(state.scrollY||0)-height/2,width,height,angle:0,strokeColor:"transparent",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:0,opacity:100,groupIds:[],frameId:null,roundness:{type:3},seed:Math.floor(Math.random()*2147483647),version:1,versionNonce:Math.floor(Math.random()*2147483647),isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false,customData:{music:{...music,title,displayMode,thumbnail,channel}}};
    editor.updateScene({elements:[...editor.getSceneElementsIncludingDeleted(),element],appState:{selectedElementIds:{[id]:true}}});
    pending.current.set(id,element);known.current.set(id,1);setMusicCards(old=>[...old,element]);setMusicOpen(false);setMusicError("");
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
    const x=(window.innerWidth/2)/zoom-(state.scrollX||0)-width/2;
    const y=(window.innerHeight/2)/zoom-(state.scrollY||0)-height/2;
    const id=crypto.randomUUID();
    const element={id,type:"rectangle",x,y,width,height,angle:0,strokeColor:"transparent",backgroundColor:"transparent",fillStyle:"solid",strokeWidth:2,strokeStyle:"solid",roughness:0,opacity:100,groupIds:[],frameId:null,roundness:{type:3},seed:Math.floor(Math.random()*2147483647),version:1,versionNonce:Math.floor(Math.random()*2147483647),isDeleted:false,boundElements:null,updated:Date.now(),link:null,locked:false,customData:{voiceNoteId:audioId}};
    editor.updateScene({elements:[...editor.getSceneElementsIncludingDeleted(),element],appState:{selectedElementIds:{[id]:true}}});
    pending.current.set(id,element);known.current.set(id,1);
    setVoiceCards(old=>[...old,element]);
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
        stream.getTracks().forEach(t=>t.stop());voiceStreamRef.current=null;
        setRecording(false);setVoiceBusy(true);
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
  useEffect(()=>()=>{if(recorderRef.current?.state==="recording")recorderRef.current.stop();voiceStreamRef.current?.getTracks().forEach(t=>t.stop())},[]);
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
    persistBoardImages(elements,files);
    const images=elements.filter(e=>e.type==="image"&&!e.isDeleted&&e.fileId);
    const voices=elements.filter(e=>!e.isDeleted&&e.customData?.voiceNoteId);
    const musics=elements.filter(e=>!e.isDeleted&&e.customData?.music?.id);
    const liveZoom=appState?.zoom?.value||1,liveX=appState?.scrollX||0,liveY=appState?.scrollY||0;
    // Update GIF geometry immediately, without waiting for a React render while dragging.
    for(const element of [...voices,...musics]){
      const card=document.querySelector(element.customData?.music?`.music-card[data-music-element="${element.id}"]`:`.voice-card[data-voice-element="${element.id}"]`);
      if(!card)continue;
      card.style.left=((element.x+liveX)*liveZoom+(liveZoom-1)*element.width/2)+"px";card.style.top=((element.y+liveY)*liveZoom+(liveZoom-1)*element.height/2)+"px";
      card.style.width=element.width+"px";card.style.height=element.height+"px";
      card.style.transform=`rotate(${element.angle||0}rad) scale(${liveZoom})`;
      card.style.transformOrigin="center center";
      card.style.opacity=String((element.opacity??100)/100);
    }
    for(const element of images){
      const img=document.querySelector(`.animated-stickers img[data-sticker-element="${element.id}"]`);
      if(!img)continue;
      img.style.left=((element.x+liveX)*liveZoom)+"px";
      img.style.top=((element.y+liveY)*liveZoom)+"px";
      img.style.width=(element.width*liveZoom)+"px";
      img.style.height=(element.height*liveZoom)+"px";
      img.style.transform=`rotate(${element.angle||0}rad) scale(${(element.scale||[1,1])[0]},${(element.scale||[1,1])[1]})`;
      img.style.opacity=String((element.opacity??100)/100);
      img.style.borderRadius=element.roundness?.type?Math.min(32,element.width/4,element.height/4)*liveZoom+"px":"0px";
    }
    setSceneImages(old=>old.length===images.length&&old.every((e,i)=>e===images[i])?old:images);
    if(theme==="dark"){
      const available=apiRef.current?.getFiles?.()||files||{};
      setImageSources(old=>{
        let next=null;
        for(const e of images){
          if(String(e.fileId).endsWith(".gif")||old[e.fileId])continue;
          const source=available[e.fileId]?.dataURL;
          if(source){if(!next)next={...old};next[e.fileId]=source}
        }
        return next||old;
      });
    }
    setVoiceCards(old=>old.length===voices.length&&old.every((e,i)=>e===voices[i])?old:voices);
    setMusicCards(old=>old.length===musics.length&&old.every((e,i)=>e===musics[i])?old:musics);
    if (appState) {
      const selectedIds=Object.keys(appState.selectedElementIds||{}).filter(id=>appState.selectedElementIds[id]);
      setSelectedBoardIds(old=>old.length===selectedIds.length&&old.every(id=>selectedIds.includes(id))?old:selectedIds);
      const mediaOnly=selectedIds.length>0&&selectedIds.every(id=>{
        const item=elements.find(e=>e.id===id);
        return item&&!item.isDeleted&&(item.customData?.voiceNoteId||item.customData?.music?.id);
      });
      document.querySelector(".board")?.classList.toggle("board-media-selected",Boolean(mediaOnly));
      const selected=elements.find(e=>e.customData?.voiceNoteId&&appState.selectedElementIds?.[e.id]);
      setSelectedVoiceId(old=>old===(selected?.id||null)?old:(selected?.id||null));
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
  return <main className={`board ${selectedVoiceId?"board-voice-selected":""}`}><div className="music-controls"><button type="button" onClick={()=>setMusicOpen(v=>!v)}>♫ Music</button>{musicOpen&&<section className={"music-panel music-panel-"+theme}><form onSubmit={searchMusic}><input aria-label="Song name or link" placeholder="Song name or YouTube / Spotify URL" value={musicInput} onChange={e=>setMusicInput(e.target.value)}/><button type="submit" disabled={musicBusy}>{musicBusy?"Searching…":"Search / Add"}</button></form>{musicError&&<small role="alert">{musicError}</small>}<div className="music-results">{musicResults.map(item=><div key={item.id} className="music-result">{item.thumbnail&&<img src={item.thumbnail} alt=""/>}<div><strong>{item.title}</strong><small>{item.channel}</small><div className="music-add-options"><button type="button" onClick={()=>addMusicCard("https://www.youtube.com/watch?v="+item.id,item.title,"audio",item.thumbnail,item.channel)}>Add audio</button><button type="button" onClick={()=>addMusicCard("https://www.youtube.com/watch?v="+item.id,item.title,"video",item.thumbnail,item.channel)}>Add video</button></div></div></div>)}</div><small>Choose Audio for a compact song card, or Video for the YouTube player. Some videos restrict embedding.</small></section>}</div><div className="voice-controls"><button type="button" disabled={voiceBusy} onClick={recording?stopVoice:startVoice}>{voiceBusy?"Saving…":recording?"■ Stop voice":"🎙 Voice note"}</button>{recording&&<span className="voice-live">● Recording</span>}</div><button type="button" className={`theme-toggle ${theme==="dark"?"theme-toggle--dark":"theme-toggle--light"}`} title="Change theme" onClick={toggleTheme} aria-label="Toggle dark mode">{theme==="dark"?"☀️ Light":"🌙 Dark"}</button><div className="pattern-controls"><button type="button" className={`pattern-button ${theme==="dark"?"pattern-dark":"pattern-light"}`} onClick={()=>setPatternMenu(v=>!v)} aria-expanded={patternMenu}>▦ Background</button>{patternMenu&&<div className={`pattern-menu ${theme==="dark"?"pattern-dark":"pattern-light"}`}>{[["none","Blank"],["lines","Horizontal lines"],["squares","Small squares"],["dots","Dots"],["graph","Graph paper"]].map(([id,label])=><button type="button" key={id} className={pattern===id?"selected":""} onClick={()=>choosePattern(id)}>{label}</button>)}</div>}</div>
    {createPortal(<>
    <button type="button" className="doodle-panel-trigger" onClick={()=>setStickerMenu(v=>!v)} aria-expanded={stickerMenu}>♡ Stickers</button>
    {stickerMenu&&<section className={`sticker-library-inline doodle-panel ${theme==="dark"?"pattern-dark":"pattern-light"}`}>
      <button type="button" className="doodle-panel-close" onClick={()=>setStickerMenu(false)} aria-label="Close stickers">×</button>
      <div className="sticker-library-content">
        <div className="sticker-tabs">{[["saved","Saved"],["favorites","♡ Favorites"],["packs","Doodles"],["search","Search"]].map(([id,label])=><button type="button" key={id} className={stickerTab===id?"active":""} onClick={()=>setStickerTab(id)}>{label}</button>)}</div>
        {stickerTab==="saved"&&<>
          <label className="sticker-upload">＋ Upload PNG / JPG / WebP / GIF<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={uploadSticker} hidden/></label>
          <div className="sticker-grid">{stickers.map(sticker=><div className="sticker-tile" key={sticker.id}><button type="button" title={sticker.name} onClick={()=>placeSticker(sticker)}><img src={sticker.url} alt={sticker.name}/></button><button type="button" className="favorite-action" aria-label="Toggle favorite" onClick={()=>toggleFavorite(sticker.id)}>{favoriteIds.includes(sticker.id)?"♥":"♡"}</button></div>)}</div>
        </>}
        {stickerTab==="favorites"&&<div className="sticker-grid">{stickers.filter(s=>favoriteIds.includes(s.id)).map(sticker=><div className="sticker-tile" key={sticker.id}><button type="button" onClick={()=>placeSticker(sticker)}><img src={sticker.url} alt={sticker.name}/></button><button type="button" className="favorite-action" onClick={()=>toggleFavorite(sticker.id)} aria-label="Remove favorite">♥</button></div>)}</div>}
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
          <div className="sticker-grid">{searchItems.map(item=><div className="sticker-tile" key={item.id}><button type="button" title={"Save and add "+item.title} onClick={()=>importSticker(item)}><img src={item.preview} alt={item.title}/></button><button type="button" className="favorite-action" title="Save to favorites" onClick={()=>importSticker(item,true)}>♡</button></div>)}</div>
          <small>GIFs by GIPHY · Images from Wikimedia Commons (check individual licenses)</small>
        </>}
        {stickerError&&<small role="alert">{stickerError}</small>}
      </div>
    </section>}
    </>, document.body)}
    {stickerError&&<div className="sticker-global-error" role="alert">{stickerError}<button type="button" onClick={()=>setStickerError("")}>×</button></div>}
    {selectedVoiceId&&<div className={`voice-palette voice-palette-${theme}`} aria-label="Voice note appearance"><span>Voice color</span><div className="voice-palette-swatches">{[["default","Auto"],["violet","Purple"],["blue","Blue"],["rose","Pink"],["mint","Mint"]].map(([value,label])=><button key={value} type="button" className={"voice-swatch voice-swatch-"+value} title={label} aria-label={label} onClick={()=>{setVoiceHex("");setVoiceColor(value)}}>{value==="default"?"◐":""}</button>)}</div><label className="voice-custom-picker" title="Pick a custom color">✎ <input aria-label="Pick any color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(voiceHex)?voiceHex:"#9274db"} onChange={e=>{setVoiceHex(e.target.value);setVoiceColor(e.target.value)}}/></label><form className="voice-hex-form" onSubmit={e=>{e.preventDefault();if(/^#[0-9a-fA-F]{6}$/.test(voiceHex))setVoiceColor(voiceHex)}}><input aria-label="Hex color" placeholder="#9274DB" maxLength={7} value={voiceHex} onChange={e=>setVoiceHex(e.target.value)} /><button type="submit" disabled={!/^#[0-9a-fA-F]{6}$/.test(voiceHex)}>Apply</button></form></div>}
    <Excalidraw excalidrawAPI={setApi} onChange={onChange} theme={theme} name="Our Whiteboard" />{selectedBoardIds.length>0&&<button type="button" className="board-delete-selected" onClick={deleteSelectedBoardItems} aria-label="Delete selected items" title="Delete selected items">🗑 Delete{selectedBoardIds.length>1?" ("+selectedBoardIds.length+")":""}</button>}
    <div className="voice-overlay">{voiceCards.map(e=><VoiceNoteCard key={e.id} element={e} theme={theme} viewport={viewport}/>)}</div><div className="music-overlay">{musicCards.map(e=><MusicCard key={e.id} element={e} theme={theme} viewport={viewport}/>)}</div>
    <div className="animated-stickers" aria-hidden="true">{sceneImages.filter(e=>String(e.fileId).endsWith(".gif")||(theme==="dark"&&imageSources[e.fileId])).map(e=>{
      const isGif=String(e.fileId).endsWith(".gif");
      const id=isGif?e.fileId.slice(8):null;
      const scale=e.scale||[1,1];
      return <img key={e.id} data-sticker-element={e.id} src={isGif?"/api/sticker-file?id="+encodeURIComponent(id):imageSources[e.fileId]} alt="" draggable="false" style={{
        position:"absolute",left:(e.x+viewport.x)*viewport.zoom,top:(e.y+viewport.y)*viewport.zoom,
        width:e.width*viewport.zoom,height:e.height*viewport.zoom,objectFit:"fill",filter:"none",
        borderRadius:e.roundness?.type?Math.min(32,e.width/4,e.height/4)*viewport.zoom:0,
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
