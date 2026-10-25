import React, { memo, useCallback, useState, useRef, useMemo } from 'react';
import { VoiceNoteCard, MusicCard } from './MediaCards';
import { WORLD_VIEW, isVisible } from './viewport';

const ImageLayer = memo(function ImageLayer({element:e,source}) {
  const scale=e.scale||[1,1];
  return <img data-sticker-element={e.id} src={source} alt="" draggable="false" decoding="async" style={{position:'absolute',left:e.x,top:e.y,width:e.width,height:e.height,objectFit:'fill',filter:'none',borderRadius:e.roundness?.type?Math.min(32,e.width/4,e.height/4):0,transform:`rotate(${e.angle||0}rad) scale(${scale[0]},${scale[1]})`,opacity:(e.opacity??100)/100}}/>;
});
export const MediaLayers = memo(function MediaLayers({voices,musics,images,sources,theme,viewport}) {
  const positions=useRef(new Map());
  const playback=useMemo(()=>({get:id=>positions.current.get(id)||0,set:(id,time)=>positions.current.set(id,time)}),[]);
  const [playing,setPlaying] = useState(new Set());
  const onPlayback=useCallback((id,value)=>setPlaying(old=>{if(old.has(id)===value)return old;const next=new Set(old);value?next.add(id):next.delete(id);return next}),[]);
  const visible=useCallback(e=>isVisible(e,viewport,innerWidth,innerHeight),[viewport]);
  const visibleVoices=useMemo(()=>voices.filter(e=>visible(e)||playing.has(e.id)),[voices,visible,playing]);
  const visibleMusics=useMemo(()=>musics.filter(e=>visible(e)||playing.has(e.id)),[musics,visible,playing]);
  const visibleImages=useMemo(()=>images.filter(e=>visible(e)&&(String(e.fileId).endsWith('.gif')||(theme==='dark'&&sources[e.fileId]))),[images,visible,theme,sources]);
  return <>
    <div className="voice-overlay media-world">{visibleVoices.map(e=><VoiceNoteCard key={e.id} element={e} theme={theme} viewport={WORLD_VIEW} onPlayback={onPlayback} playback={playback}/>)}</div>
    <div className="music-overlay media-world">{visibleMusics.map(e=><MusicCard key={e.id} element={e} theme={theme} viewport={WORLD_VIEW} onPlayback={onPlayback} playback={playback}/>)}</div>
    <div className="animated-stickers media-world" aria-hidden="true">{visibleImages.map(e=><ImageLayer key={e.id} element={e} source={String(e.fileId).endsWith('.gif')?'/api/sticker-file?id='+encodeURIComponent(e.fileId.slice(8)):sources[e.fileId]}/>)}</div>
  </>;
});
