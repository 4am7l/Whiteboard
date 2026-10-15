export async function onRequestPost({request,env}) {
 try {
 if(!env.STICKERS)return Response.json({error:"R2 binding missing"},{status:503});
 const body=await request.json().catch(()=>null);
 let url;
 try{url=new URL(body?.url)}catch{return Response.json({error:"Invalid URL"},{status:400})}
 if(url.protocol!=="https:"||!(/^(media\d*|i)\.giphy\.com$/.test(url.hostname)||url.hostname==="upload.wikimedia.org"))return Response.json({error:"Only GIPHY or Wikimedia images allowed"},{status:400});
 let r;
 try {r=await fetch(url.toString(),{redirect:"follow"})}catch(e){return Response.json({error:"GIPHY download failed",detail:String(e?.message||e)},{status:502})}
 if(!r.ok)return Response.json({error:"Could not import image"},{status:502});
 const type=(r.headers.get("content-type")||"").split(";")[0].trim();
 const ext=({"image/gif":"gif","image/webp":"webp","image/png":"png","image/jpeg":"jpg"})[type];
 if(!ext)return Response.json({error:"Unsupported image type"},{status:400});
 const max=30*1024*1024;
 if(Number(r.headers.get("content-length")||0)>max)return Response.json({error:"File exceeds 30 MB"},{status:413});
 const bytes=await r.arrayBuffer();
 if(bytes.byteLength>max)return Response.json({error:"File exceeds 30 MB"},{status:413});
 const id=crypto.randomUUID()+"."+ext;
 try {await env.STICKERS.put("library/"+id,bytes,{httpMetadata:{contentType:type},customMetadata:{name:String(body?.name||"GIPHY sticker").slice(0,100)}})}catch(e){return Response.json({error:"R2 sticker storage failed",detail:String(e?.message||e)},{status:503})}
 return Response.json({id,ok:true});
 } catch(e){return Response.json({error:"Sticker import server error",detail:String(e?.message||e)},{status:500})}
}