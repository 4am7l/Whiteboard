export async function onRequestGet({request,env}) {
 if(!env.STICKERS)return new Response("R2 unavailable",{status:503});
 const id=new URL(request.url).searchParams.get("id");
 if(!id||!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(id))return new Response("Invalid id",{status:400});
 const preview=new URL(request.url).searchParams.has("preview");
 const small=preview?await env.STICKERS.get("previews/"+id):null;
 const item=small||await env.STICKERS.get("library/"+id);
 if(!item)return new Response("Not found",{status:404});
 return new Response(item.body,{headers:{"Content-Type":item.httpMetadata?.contentType||"application/octet-stream","X-Thumbnail":small?"1":"0","Cache-Control":preview&&!small?"private, no-store":"private, max-age=86400","X-Content-Type-Options":"nosniff"}});
}