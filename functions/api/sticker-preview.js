export async function onRequestPost({request,env}){
  if(!env.STICKERS)return new Response('R2 unavailable',{status:503});
  const form=await request.formData().catch(()=>null),id=form?.get('id'),file=form?.get('preview');
  if(typeof id!=='string'||!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(id)||!(file instanceof File)||file.type!=='image/webp'||!file.size||file.size>512000)return new Response('Invalid preview',{status:400});
  if(!await env.STICKERS.head('library/'+id))return new Response('Sticker not found',{status:404});
  await env.STICKERS.put('previews/'+id,file.stream(),{httpMetadata:{contentType:'image/webp'}});
  return Response.json({ok:true});
}
