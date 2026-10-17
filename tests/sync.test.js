import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet, onRequestPost } from '../functions/api/board.js';
import { mergeRemote, makeBatch } from '../src/syncModel.js';
import { isVisible } from '../src/viewport.js';

class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('CREATE TABLE board_elements(board_id TEXT,element_id TEXT,version INTEGER,data TEXT,PRIMARY KEY(board_id,element_id))');}
  prepare(sql){const db=this.db;return {args:[],bind(...args){this.args=args;return this},execute(){const stmt=db.prepare(sql);return /^\s*(SELECT|WITH)/i.test(sql)?{results:stmt.all(...this.args)}:{results:[],meta:stmt.run(...this.args)}}};}
  async batch(statements){this.db.exec('BEGIN');try{const result=statements.map(s=>s.execute());this.db.exec('COMMIT');return result}catch(e){this.db.exec('ROLLBACK');throw e}}
}
const element=(id,version=1,versionNonce=1)=>({id,version,versionNonce,type:'rectangle',x:0,y:0,width:100,height:100});
const put=(DB,elements)=>onRequestPost({env:{DB},request:new Request('https://test/api/board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({elements})})}).then(r=>r.json());
const get=(DB,since)=>onRequestGet({env:{DB},request:new Request('https://test/api/board'+(since===undefined?'':'?since='+since))}).then(r=>r.json());
test('old board migrates, empty delta stays empty, edits and tombstones advance cursor',async()=>{
  const DB=new D1();DB.db.prepare('INSERT INTO board_elements VALUES(?,?,?,?)').run('shared','old',1,JSON.stringify(element('old')));
  const first=await get(DB);assert.equal(first.elements.length,1);assert.equal(first.cursor,0);
  assert.deepEqual((await get(DB,first.cursor)).elements,[]);
  await put(DB,[element('new')]);const delta=await get(DB,first.cursor);assert.deepEqual(delta.elements.map(e=>e.id),['new']);
  await put(DB,[{...element('new',2),isDeleted:true}]);const deleted=await get(DB,delta.cursor);assert.equal(deleted.elements[0].isDeleted,true);
  assert.equal((await get(DB,99999)).full,true);
});
test('same-version concurrent edit is explicit; retry is idempotent; higher version wins',async()=>{
  const DB=new D1();const a=element('a',3,10),b=element('a',3,11);
  assert.equal((await put(DB,[a])).accepted.length,1);
  assert.deepEqual((await put(DB,[b])).conflicts,[a]);
  assert.equal((await put(DB,[a])).accepted.length,1);
  const cursor=(await get(DB)).cursor;await put(DB,[a]);assert.equal((await get(DB)).cursor,cursor);
  assert.equal((await put(DB,[element('a',4,20)])).accepted.length,1);
});
test('receiving unrelated updates never replaces pending local work',()=>{
  const local=[element('a',2,10)],pending=new Map([['a',local[0]]]);
  const merged=mergeRemote(local,[element('a',3,11),element('b')],pending);
  assert.equal(merged.find(e=>e.id==='a').version,2);assert.equal(merged.length,2);
});
test('batch bounds and rotated viewport culling',()=>{
  const pending=new Map(Array.from({length:80},(_,i)=>[String(i),element(String(i))]));
  assert.equal(makeBatch(pending).length,25);
  assert.equal(isVisible({...element('a'),x:10000},{x:0,y:0,zoom:1},800,600),false);
  assert.equal(isVisible({...element('a'),x:10000},{x:-10000,y:0,zoom:1},800,600),true);
});

test('image upload supports binary requests and old base64 clients',async()=>{
  const {onRequestPost}=await import('../functions/api/board-image.js');
  const saved=[];const env={STICKERS:{put:async(...args)=>saved.push(args)}};
  const form=new FormData();form.append('id','image-id');form.append('file',new Blob(['png'],{type:'image/png'}),'image.png');
  const binary=await onRequestPost({env,request:new Request('https://test/api/board-image',{method:'POST',body:form})});assert.equal(binary.status,200);
  const legacy=await onRequestPost({env,request:new Request('https://test/api/board-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'old-id',dataURL:'data:image/png;base64,cG5n'})})});assert.equal(legacy.status,200);assert.equal(saved.length,2);
});
test('voice requests expose the requested byte range',async()=>{
  const {onRequestGet}=await import('../functions/api/voice-notes.js');
  const env={STICKERS:{get:async()=>({body:new Uint8Array([1,2,3]),size:100,range:{offset:10,length:3},httpMetadata:{contentType:'audio/webm'}})}};
  const response=await onRequestGet({env,request:new Request('https://test/api/voice-notes?id=11111111-1111-1111-1111-111111111111.webm',{headers:{Range:'bytes=10-12'}})});
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 10-12/100');assert.equal((await response.arrayBuffer()).byteLength,3);
});
