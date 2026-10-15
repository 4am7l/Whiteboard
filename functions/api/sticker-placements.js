export async function onRequestGet({env}) {
 if(!env.DB)return Response.json({error:"D1 missing"},{status:503});
 try {const rows=await env.DB.prepare("SELECT id, sticker_id, x, y, width, updated_at FROM sticker_placements").all();return Response.json({placements:rows.results},{headers:{"Cache-Control":"no-store"}})}
 catch{return Response.json({error:"Run sticker SQL migration"},{status:503})}
}
export async function onRequestPost({request,env}) {
 if(!env.DB)return Response.json({error:"D1 missing"},{status:503});
 const p=await request.json().catch(()=>null);
 if(!p||!/^[a-f0-9-]{36}$/.test(p.id)||!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(p.sticker_id)||![p.x,p.y,p.width].every(v=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<1000000)||p.width<30||p.width>1000)return Response.json({error:"Invalid placement"},{status:400});
 await env.DB.prepare("INSERT INTO sticker_placements(id,sticker_id,x,y,width,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET x=excluded.x,y=excluded.y,width=excluded.width,updated_at=excluded.updated_at").bind(p.id,p.sticker_id,p.x,p.y,p.width,Date.now()).run();
 return Response.json({ok:true});
}
export async function onRequestDelete({request,env}) {
 if(!env.DB)return Response.json({error:"D1 missing"},{status:503});
 const id=new URL(request.url).searchParams.get("id");
 if(!id||!/^[a-f0-9-]{36}$/.test(id))return Response.json({error:"Invalid id"},{status:400});
 await env.DB.prepare("DELETE FROM sticker_placements WHERE id=?").bind(id).run();
 return Response.json({ok:true});
}