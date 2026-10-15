const validId=id=>typeof id==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
export async function onRequestGet({request,env}){
  if(!env.STICKERS)return Response.json({error:"R2 binding STICKERS missing"},{status:503});
  const id=new URL(request.url).searchParams.get("id");
  if(!validId(id))return new Response("Invalid image ID",{status:400});
  const item=await env.STICKERS.get("board-images/"+id);
  if(!item)return new Response("Image not found",{status:404});
  return new Response(item.body,{headers:{"Content-Type":item.httpMetadata?.contentType||"image/png","Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff"}});
}
export async function onRequestPost({request,env}){
  if(!env.STICKERS)return Response.json({error:"R2 binding STICKERS missing"},{status:503});
  let body;try{body=await request.json()}catch{return new Response("Invalid JSON",{status:400})}
  if(!validId(body?.id)||typeof body?.dataURL!=="string"||body.dataURL.length>9500000)return new Response("Invalid image",{status:400});
  const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=]+)$/.exec(body.dataURL);
  if(!match)return new Response("Unsupported image",{status:400});
  const raw=atob(match[2]);if(raw.length>6500000)return new Response("Image too large",{status:413});
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  await env.STICKERS.put("board-images/"+body.id,bytes,{httpMetadata:{contentType:match[1]}});
  return Response.json({ok:true});
}
