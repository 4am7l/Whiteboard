// Pointer capture keeps a pinch owned by navigation until every finger is lifted.
export function installDrawingPinch(board, api) {
  const fingers = new Map();
  const pens = new Set();
  let first = null, pinch = null, navigating = false, forwarding = false;
  let navigationFrame = 0, pendingNavigation = null;
  const cancelNavigation = () => {
    if (navigationFrame) cancelAnimationFrame(navigationFrame);
    navigationFrame = 0;
    pendingNavigation = null;
  };
  const queueNavigation = appState => {
    pendingNavigation = appState;
    if (navigationFrame) return;
    navigationFrame = requestAnimationFrame(() => {
      navigationFrame = 0;
      const latest = pendingNavigation;
      pendingNavigation = null;
      if (latest && navigating) api.updateScene({appState:latest});
    });
  };
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const position = e => ({x:e.clientX,y:e.clientY});
  const pair = () => {
    const [a,b] = [...fingers.values()];
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};
  };
  const baseline = () => {
    if(fingers.size < 2){pinch=null;return;}
    const center=pair(), state=api.getAppState(), rect=board.getBoundingClientRect();
    pinch={...center,zoom:state.zoom.value,
      worldX:(center.x-rect.left)/state.zoom.value-state.scrollX,
      worldY:(center.y-rect.top)/state.zoom.value-state.scrollY};
  };
  const down = e => {
    if(e.pointerType==='pen' && board.contains(e.target)){pens.add(e.pointerId);return;}
    if(e.pointerType==='touch' && pens.size && board.contains(e.target)){stop(e);return;}
    if(forwarding || e.pointerType!== 'touch' || !board.contains(e.target) || !e.target.closest?.('canvas'))return;
    if(!first && api.getAppState().activeTool.type!=='freedraw')return;
    fingers.set(e.pointerId,position(e));
    if(!first){
      first={id:e.pointerId,target:e.target,event:e,existing:new Set(api.getSceneElementsIncludingDeleted().map(el=>el.id))};
      return;
    }
    stop(e);
    if(!navigating){
      navigating=true;
      // Finish the native one-finger stroke before taking ownership of the pinch.
      const draft=api.getAppState().newElement;
      forwarding=true;
      const last=first.event;
      first.target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:first.id,pointerType:'touch',isPrimary:true,button:0,buttons:0,clientX:last.clientX,clientY:last.clientY}));
      forwarding=false;
      // Only discard this gesture's unfinished stroke, never older or remote ink.
      if(draft?.type==='freedraw' && !first.existing.has(draft.id)){
        api.updateScene({elements:api.getSceneElementsIncludingDeleted().map(el=>el.id===draft.id?
          {...el,isDeleted:true,version:el.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()}:el)});
      }
    }
    baseline();
  };
  const move = e => {
    if(forwarding || !fingers.has(e.pointerId))return;
    fingers.set(e.pointerId,position(e));
    if(!navigating){if(e.pointerId===first.id)first.event=e;return;}
    stop(e);
    if(!pinch || fingers.size<2)return;
    const center=pair(),rect=board.getBoundingClientRect();
    const zoom=Math.max(.1,Math.min(30,pinch.zoom*center.distance/pinch.distance));
    queueNavigation({zoom:{value:zoom},scrollX:(center.x-rect.left)/zoom-pinch.worldX,scrollY:(center.y-rect.top)/zoom-pinch.worldY});
  };
  const up = e => {
    if(e.pointerType==='pen'){pens.delete(e.pointerId);return;}
    if(forwarding || !fingers.has(e.pointerId))return;
    fingers.delete(e.pointerId);
    if(navigating)stop(e);
    if(!fingers.size){cancelNavigation();first=null;pinch=null;navigating=false;}
    else if(navigating)baseline();
  };
  const reset = () => {cancelNavigation();pens.clear();fingers.clear();first=null;pinch=null;navigating=false;};
  window.addEventListener('pointerdown',down,{capture:true,passive:false});
  window.addEventListener('pointermove',move,{capture:true,passive:false});
  window.addEventListener('pointerup',up,true);
  window.addEventListener('pointercancel',up,true);
  window.addEventListener('blur',reset);
  return()=>{
    window.removeEventListener('pointerdown',down,true);
    window.removeEventListener('pointermove',move,true);
    window.removeEventListener('pointerup',up,true);
    window.removeEventListener('pointercancel',up,true);
    window.removeEventListener('blur',reset);
    reset();
  };
}

export function isMobileBoardDevice(navigator) {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
}
