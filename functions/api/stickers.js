const allowed = new Map([["image/png","png"],["image/jpeg","jpg"],["image/webp","webp"],["image/gif","gif"]]);
export async function onRequestGet({env,request}) {
 if (!env.STICKERS) return Response.json({error:"R2 binding STICKERS missing"},{status:503});
 const cursor=new URL(request.url).searchParams.get("cursor")||undefined;
 const items = await env.STICKERS.list({prefix:"library/",limit:100,cursor,include:["customMetadata","httpMetadata"]});
 return Response.json({cursor:items.truncated?items.cursor:null,stickers:items.objects.map(o=>({id:o.key.slice(8),name:o.customMetadata?.name||o.key.slice(8),type:o.httpMetadata?.contentType||"image/png",url:"/api/sticker-file?id="+encodeURIComponent(o.key.slice(8))}))},{headers:{"Cache-Control":"no-store"}});
}
export async function onRequestPost({request,env}) {
 if (!env.STICKERS) return Response.json({error:"R2 binding STICKERS missing"},{status:503});
 const form=await request.formData().catch(()=>null);
 const file=form?.get("file");
 if (!(file instanceof File)||!allowed.has(file.type)||file.size>30*1024*1024||file.size===0) return Response.json({error:"PNG, JPG, WebP or GIF up to 30 MB only"},{status:400});
 const id=crypto.randomUUID()+"."+allowed.get(file.type);
 await env.STICKERS.put("library/"+id,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{name:file.name.slice(0,100)}});
 const preview=form.get("preview");
 if(preview instanceof File&&preview.type==="image/webp"&&preview.size<512000)await env.STICKERS.put("previews/"+id,preview.stream(),{httpMetadata:{contentType:"image/webp"}});
 return Response.json({ok:true,id});
}
export async function onRequestDelete({request,env}) {
 if(!env.STICKERS)return Response.json({error:"R2 unavailable"},{status:503});
 const id=new URL(request.url).searchParams.get("id");
 if(!id||!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(id))return Response.json({error:"Invalid id"},{status:400});
 await env.STICKERS.delete(["library/"+id,"previews/"+id,"favorites/"+id]);
 return Response.json({ok:true});
}