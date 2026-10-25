import test from 'node:test';
import assert from 'node:assert/strict';
import {installDrawingPinch,isMobileBoardDevice} from '../src/touchNavigation.js';

test('navigation button distinguishes iPad desktop UA from touch laptops',()=>{
  assert.equal(isMobileBoardDevice({userAgent:'iPhone',maxTouchPoints:5}),true);
  assert.equal(isMobileBoardDevice({userAgent:'Android',maxTouchPoints:5}),true);
  assert.equal(isMobileBoardDevice({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(isMobileBoardDevice({userAgent:'Windows',platform:'Win32',maxTouchPoints:10}),false);
  assert.equal(isMobileBoardDevice({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}),false);
});

test('pinch discards only current ink, anchors zoom and consumes remaining finger',()=>{
  const handlers={};
  globalThis.window={addEventListener:(type,fn)=>handlers[type]=fn,removeEventListener:type=>delete handlers[type]};
  globalThis.PointerEvent=class {constructor(type,init){Object.assign(this,init);this.type=type;}};
  let state={activeTool:{type:'freedraw'},zoom:{value:1},scrollX:0,scrollY:0};
  let elements=[{id:'old',type:'freedraw',version:1}];
  const canvas={closest:()=>true,dispatchEvent:e=>handlers[e.type](e)};
  const api={getAppState:()=>state,getSceneElementsIncludingDeleted:()=>elements,updateScene:patch=>{
    if(patch.elements)elements=patch.elements;
    if(patch.appState)state={...state,...patch.appState};
  }};
  const cleanup=installDrawingPinch({contains:()=>true,getBoundingClientRect:()=>({left:0,top:0})},api);
  const emit=(type,id,x,y)=>{const e={pointerType:'touch',pointerId:id,clientX:x,clientY:y,target:canvas,preventDefault(){this.stopped=true},stopImmediatePropagation(){this.stopped=true}};handlers[type](e);return e;};
  assert.equal(emit('pointerdown',1,100,100).stopped,undefined);
  const draft={id:'draft',type:'freedraw',version:1};elements.push(draft,{id:'remote',type:'freedraw',version:1});state.newElement=draft;
  assert.equal(emit('pointerdown',2,200,100).stopped,true);
  assert.equal(elements.find(e=>e.id==='draft').isDeleted,true);
  assert.equal(elements.find(e=>e.id==='old').isDeleted,undefined);
  assert.equal(elements.find(e=>e.id==='remote').isDeleted,undefined);
  emit('pointermove',2,300,100);
  assert.equal(state.zoom.value,2);
  assert.equal(state.scrollX,-50);
  emit('pointerup',2,300,100);
  assert.equal(emit('pointermove',1,120,100).stopped,true);
  emit('pointercancel',1,120,100);
  assert.equal(emit('pointerdown',3,100,100).stopped,undefined);
  emit('pointerup',3,100,100);
  cleanup();assert.deepEqual(handlers,{});
  delete globalThis.window;delete globalThis.PointerEvent;
});
