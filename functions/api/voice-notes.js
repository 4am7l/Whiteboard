const types=new Map([["audio/webm","webm"],["audio/ogg","ogg"],["audio/mp4","mp4"],["audio/mpeg","mp3"]]);
export async function onRequestPost({request,env}){
 if(!env.STICKERS)return Response.json({error:"R2 binding STICKERS missing"},{status:503});
 try{
  const form=await request.formData();
  const file=form.get("audio");
  const type=(file?.type||"").split(";")[0];
  if(!(file instanceof File)||!types.has(type)||!file.size||file.size>12*1024*1024)return Response.json({error:"Audio must be WebM, OGG, MP4 or MP3 under 12 MB"},{status:400});
  const id=crypto.randomUUID()+"."+types.get(type);
  await env.STICKERS.put("voice/"+id,file.stream(),{httpMetadata:{contentType:type}});
  return Response.json({id});
 }catch(e){return Response.json({error:"Voice upload failed: "+String(e?.message||e)},{status:500})}
}
export async function onRequestGet({request,env}){
 if(!env.STICKERS)return new Response("R2 unavailable",{status:503});
 const id=new URL(request.url).searchParams.get("id");
 if(!id||!/^[a-f0-9-]{36}\.(webm|ogg|mp4|mp3)$/.test(id))return new Response("Invalid voice ID",{status:400});
 const range=request.headers.get("range");
 const item=await env.STICKERS.get("voice/"+id,range?{range:request.headers}:undefined);
 if(!item)return new Response("Voice note not found",{status:404});
 const headers={"Content-Type":item.httpMetadata?.contentType||"audio/webm","Cache-Control":"private, max-age=86400","Accept-Ranges":"bytes","X-Content-Type-Options":"nosniff"};
 if(range&&item.range){
   const offset=item.range.offset??Math.max(0,item.size-(item.range.suffix??item.size));
   const length=item.range.length??item.range.suffix??(item.size-offset);
   headers["Content-Range"]=`bytes ${offset}-${offset+length-1}/${item.size}`;
   headers["Content-Length"]=String(length);
   return new Response(item.body,{status:206,headers});
 }
 headers["Content-Length"]=String(item.size);
 return new Response(item.body,{headers});
}
