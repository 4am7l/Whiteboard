const valid=id=>/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(id||"");
export async function onRequestGet({env}){
 if(!env.STICKERS)return Response.json({error:"R2 binding missing"},{status:503});
 const list=await env.STICKERS.list({prefix:"favorites/",limit:500});
 return Response.json({ids:list.objects.map(o=>o.key.slice("favorites/".length))},{headers:{"Cache-Control":"no-store"}});
}
export async function onRequestPost({request,env}){
 if(!env.STICKERS)return Response.json({error:"R2 binding missing"},{status:503});
 const {id}=await request.json().catch(()=>({}));
 if(!valid(id))return Response.json({error:"Invalid sticker"},{status:400});
 if(!await env.STICKERS.head("library/"+id))return Response.json({error:"Sticker not found"},{status:404});
 await env.STICKERS.put("favorites/"+id,"1");
 return Response.json({ok:true});
}
export async function onRequestDelete({request,env}){
 if(!env.STICKERS)return Response.json({error:"R2 binding missing"},{status:503});
 const id=new URL(request.url).searchParams.get("id");
 if(!valid(id))return Response.json({error:"Invalid sticker"},{status:400});
 await env.STICKERS.delete("favorites/"+id);
 return Response.json({ok:true});
}