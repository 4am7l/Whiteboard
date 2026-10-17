const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);
const allowed=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const MAX=30*1024*1024;
export async function onRequestGet({request,env}){
  if(!env.STICKERS)return Response.json({error:'R2 binding STICKERS missing'},{status:503});
  const id=new URL(request.url).searchParams.get('id');
  if(!validId(id))return new Response('Invalid image ID',{status:400});
  const item=await env.STICKERS.get('board-images/'+id);
  if(!item)return new Response('Image not found',{status:404});
  return new Response(item.body,{headers:{'Content-Type':item.httpMetadata?.contentType||'image/png','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}});
}
export async function onRequestPost({request,env}){
  if(!env.STICKERS)return Response.json({error:'R2 binding STICKERS missing'},{status:503});
  let id,bytes,type;
  try{
    if(request.headers.get('content-type')?.includes('multipart/form-data')){
      const form=await request.formData(),file=form.get('file');id=form.get('id');
      if(!(file instanceof File)||!allowed.has(file.type)||!file.size||file.size>MAX)return new Response('Images up to 30 MB only',{status:413});
      bytes=file.stream();type=file.type;
    }else{
      // Preserve compatibility with already-open clients.
      const body=await request.json();id=body?.id;
      if(typeof body?.dataURL!=='string'||body.dataURL.length>MAX*4/3+100)return new Response('Invalid image',{status:400});
      const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-zA-Z0-9+/=]+)$/.exec(body.dataURL);
      if(!match)return new Response('Unsupported image',{status:400});
      const raw=atob(match[2]);if(raw.length>MAX)return new Response('Image too large',{status:413});
      bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));type=match[1];
    }
  }catch{return new Response('Invalid image upload',{status:400})}
  if(!validId(id))return new Response('Invalid image ID',{status:400});
  await env.STICKERS.put('board-images/'+id,bytes,{httpMetadata:{contentType:type}});
  return Response.json({ok:true});
}
