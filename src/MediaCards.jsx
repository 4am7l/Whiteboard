import React, { memo, useEffect, useRef, useState } from "react";
import { loadYouTube } from "./youtube";
import { mediaCardStyle } from "./mediaGeometry";

export const VoiceNoteCard = memo(function VoiceNoteCard({element,theme,viewport,onPlayback,playback}){
  const audioRef=useRef(null);
  const [playing,setPlaying]=useState(false);
  const [time,setTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const color=element.customData?.voiceColor||"default";
  const hex=/^#[0-9a-fA-F]{6}$/.test(color)?color:({violet:"#9274db",blue:"#5394e8",rose:"#e078a7",mint:"#3eac98"}[color]||(theme==="dark"?"#a99af6":"#745bd4"));
  const format=t=>Number.isFinite(t)?Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0"):"0:00";
  const progress=duration>0?Math.min(1,time/duration):0;
  const bars=Array.from({length:32},(_,i)=>7+Math.round(Math.abs(Math.sin(i*1.73)*Math.cos(i*.39)+Math.sin(i*.91)*.48)*17));
  return <div className={`voice-card voice-card-${theme} voice-card-chat`} data-voice-element={element.id} style={{"--voice-accent":hex,...mediaCardStyle(element,viewport)}}>
    <div className="voice-chat-player">
      <button type="button" className="voice-chat-play" aria-label={playing?"Pause voice note":"Play voice note"} onClick={()=>{const a=audioRef.current;if(!a)return;if(a.paused)a.play().catch(()=>setPlaying(false));else a.pause()}}>{playing?<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>:<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>}</button>
      <div className="voice-chat-body"><div className="voice-waveform" role="slider" aria-label="Voice playback position" aria-valuemin={0} aria-valuemax={Math.max(1,Math.round(duration))} aria-valuenow={Math.round(time)} tabIndex={0} onPointerDown={e=>{const a=audioRef.current;if(!a||!Number.isFinite(duration)||duration<=0)return;e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();a.currentTime=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*duration}} onKeyDown={e=>{if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();e.stopPropagation();if(audioRef.current)audioRef.current.currentTime=Math.max(0,Math.min(duration||0,audioRef.current.currentTime+(e.key==="ArrowRight"?5:-5)))}}}>{bars.map((height,i)=><span key={i} className={i/32<=progress?"played":""} style={{height:height+"px"}}/>)}</div><div className="voice-chat-meta"><span>{format(time)} / {format(duration)}</span></div></div>
    </div>
    <audio ref={audioRef} preload="none" src={"/api/voice-notes?id="+encodeURIComponent(element.customData.voiceNoteId)} onTimeUpdate={e=>{setTime(e.currentTarget.currentTime);playback.set(element.id,e.currentTarget.currentTime)}} onLoadedMetadata={e=>{setDuration(e.currentTarget.duration);const saved=playback.get(element.id);if(saved)e.currentTarget.currentTime=saved}} onPlay={()=>{setPlaying(true);onPlayback(element.id,true)}} onPause={()=>{setPlaying(false);onPlayback(element.id,false)}} onEnded={()=>{setPlaying(false);setTime(0);playback.set(element.id,0);onPlayback(element.id,false)}}/>
  </div>;
});


export function parseMusicLink(raw){
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
export const MusicCard = memo(function MusicCard({element,theme,viewport,onPlayback,playback}){
  const music=element.customData.music;
  const savedAccent=element.customData?.musicColor;
  const accent=typeof savedAccent==="string"&&/^#[0-9a-fA-F]{6}$/.test(savedAccent)?savedAccent:null;
  const audioMode=music.displayMode==="audio";
  const [active,setActive]=useState(false),[playing,setPlaying]=useState(false),[ready,setReady]=useState(false),[elapsed,setElapsed]=useState(0),[duration,setDuration]=useState(0),[failed,setFailed]=useState(false);
  const mount=useRef(null),player=useRef(null);
  const youtube=music.provider==="youtube";
  const embed=youtube?"https://www.youtube-nocookie.com/embed/"+music.id+"?autoplay=1&rel=0":"https://open.spotify.com/embed/track/"+music.id;
  const url=music.provider==="preview"?(music.url||"https://music.apple.com"):youtube?"https://www.youtube.com/watch?v="+music.id:"https://open.spotify.com/track/"+music.id;
  useEffect(()=>{
    if(!active||!youtube||!mount.current)return;
    setReady(false);setFailed(false);
    let disposed=false;
    const initialize=()=>{
      if(disposed||!mount.current||!window.YT?.Player||player.current)return;
      const node=document.createElement("div");mount.current.appendChild(node);
      player.current=new window.YT.Player(node,{videoId:music.id,width:audioMode?240:"100%",height:audioMode?200:"100%",playerVars:{controls:audioMode?0:1,playsinline:1,rel:0},events:{
        onReady:e=>{if(!disposed){setReady(true);e.target.setVolume(80);const saved=playback.get(element.id);if(saved)e.target.seekTo(saved,true);e.target.playVideo()}},
        onStateChange:e=>{if(!disposed){const isPlaying=e.data===window.YT.PlayerState.PLAYING;setPlaying(isPlaying);playback.set(element.id,e.data===window.YT.PlayerState.ENDED?0:player.current?.getCurrentTime?.()||0);onPlayback(element.id,isPlaying||e.data===window.YT.PlayerState.BUFFERING)}},
        onError:()=>{if(!disposed){setFailed(true);onPlayback(element.id,false)}}
      }});
    };
    loadYouTube().then(initialize).catch(()=>{if(!disposed){setFailed(true);onPlayback(element.id,false)}});
    return()=>{disposed=true;try{player.current?.destroy?.()}catch{}player.current=null;if(mount.current)mount.current.replaceChildren()};
  },[active,audioMode,youtube,music.id,onPlayback,element.id,playback]);
  useEffect(()=>{if(!ready||!playing)return;const timer=setInterval(()=>{try{const time=player.current?.getCurrentTime?.()||0;setElapsed(time);playback.set(element.id,time);setDuration(player.current?.getDuration?.()||0)}catch{}},600);return()=>clearInterval(timer)},[ready,playing,playback,element.id]);
  const fmt=t=>Math.floor(t/60)+":"+String(Math.floor(t%60)).padStart(2,"0");
  const toggle=()=>{if(!active){setActive(true);onPlayback(element.id,true);return}if(!ready)return;playing?player.current?.pauseVideo?.():player.current?.playVideo?.()};
  return <div className={`music-card music-card-${theme} music-glass-card ${audioMode?"music-glass-audio":"music-glass-video"} ${accent?"music-glass-tinted":""}`} data-music-element={element.id} style={{...(accent?{"--music-accent":accent}:{}),...mediaCardStyle(element,viewport)}}>
    {audioMode&&youtube?<><div className="music-glass-hidden" aria-hidden="true"><div ref={mount}/></div><div className="music-glass-cover">{music.thumbnail?<img src={music.thumbnail} alt="Album artwork"/>:<div className="music-glass-art">♪</div>}<button type="button" className="music-glass-cover-play" onClick={toggle} disabled={(active&&!ready)||failed} aria-label={playing?"Pause":"Play"}><svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor">{playing?<path d="M6 4h4v16H6zm8 0h4v16h-4z"/>:<path d="M8 4v16l12-8z"/>}</svg></button></div><div className="music-glass-body"><div className="music-glass-title" title={music.title}>{music.title||"Music"}</div><div className="music-glass-artist">{music.channel||"YouTube"}</div><input type="range" aria-label="Song progress" min="0" max={Math.max(duration,1)} value={Math.min(elapsed,duration||1)} onChange={e=>{player.current?.seekTo?.(Number(e.target.value),true);setElapsed(Number(e.target.value))}}/><div className="music-glass-times"><span>{fmt(elapsed)}</span><span>{fmt(duration)}</span></div></div><a className="music-glass-link" href={url} target="_blank" rel="noopener noreferrer" aria-label="Open original"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6M20 4l-9 9"/><path d="M20 13v6H5V4h6"/></svg></a>{failed&&<a className="music-glass-failure" href={url} target="_blank" rel="noopener noreferrer">Open on YouTube</a>}</>
    :<><div className="music-glass-video-top"><span>{music.title||"YouTube video"}</span><a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open original"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6M20 4l-9 9"/><path d="M20 13v6H5V4h6"/></svg></a></div>{music.provider==="preview"?<div className="music-preview-player"><strong>{music.title}</strong><audio controls preload="none" src={music.previewUrl} onPlay={()=>onPlayback(element.id,true)} onPause={()=>onPlayback(element.id,false)} onEnded={()=>onPlayback(element.id,false)}/></div>:active&&youtube?<div className="music-video-mount" ref={mount}/>:active?<iframe title="Song player" src={embed} allow="autoplay;encrypted-media;fullscreen;picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button type="button" className="music-glass-video-poster" onClick={()=>{setActive(true);onPlayback(element.id,true)}} style={music.thumbnail?{backgroundImage:`linear-gradient(#0002,#0005),url("${music.thumbnail}")`}:undefined}><span className="music-glass-video-play"><svg viewBox="0 0 24 24" width="25" height="25" fill="currentColor"><path d="M8 4v16l12-8z"/></svg></span></button>}</>}
  </div>;
});
