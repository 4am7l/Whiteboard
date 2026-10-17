import React, { memo, useEffect, useRef, useState } from 'react';
import { thumbnail } from './thumbnails';

const tasks=[];let running=0;
function schedule(task){
  return new Promise((resolve,reject)=>{tasks.push({task,resolve,reject});pump()});
}
function pump(){
  while(running<2&&tasks.length){
    const job=tasks.shift();running++;
    job.task().then(job.resolve,job.reject).finally(()=>{running--;pump()});
  }
}
export const StickerThumbnail=memo(function StickerThumbnail({sticker}){
  const host=useRef(null);const [source,setSource]=useState(null);
  useEffect(()=>{
    let active=true,objectURL;
    const controller=new AbortController();
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      observer.disconnect();
      schedule(async()=>{
        if(!active)return;
        const response=await fetch(sticker.url+'&preview=1',{signal:controller.signal});
        if(!response.ok)throw Error('Preview unavailable');
        const original=await response.blob();
        const small=response.headers.get('X-Thumbnail')==='1'?original:await thumbnail(original);
        if(!active)return;
        objectURL=URL.createObjectURL(small||original);setSource(objectURL);
        if(small&&response.headers.get('X-Thumbnail')!=='1'){
          const form=new FormData();form.append('id',sticker.id);form.append('preview',small,'preview.webp');
          fetch('/api/sticker-preview',{method:'POST',body:form,signal:controller.signal}).catch(()=>{});
        }
      }).catch(()=>{if(active)setSource(sticker.url)});
    },{rootMargin:'100px'});
    observer.observe(host.current);
    return()=>{active=false;controller.abort();observer.disconnect();if(objectURL)URL.revokeObjectURL(objectURL)};
  },[sticker.id,sticker.url]);
  return <img ref={host} src={source||undefined} alt={sticker.name} loading="lazy" decoding="async"/>;
});
