export async function onRequestGet({request,env}) {
 if(!env.GIPHY_API_KEY)return Response.json({error:"Add GIPHY_API_KEY secret to Cloudflare Pages"},{status:503});
 const url=new URL(request.url);
 const q=(url.searchParams.get("q")||"").trim().slice(0,80);
 const kind=url.searchParams.get("kind")==="gif"?"gifs":"stickers";
 if(!q)return Response.json({items:[]});
 const upstream=new URL("https://api.giphy.com/v1/"+kind+"/search");
 upstream.searchParams.set("api_key",env.GIPHY_API_KEY);
 upstream.searchParams.set("q",q);
 upstream.searchParams.set("limit","24");
 upstream.searchParams.set("rating","g");
 const response=await fetch(upstream.toString());
 if(!response.ok)return Response.json({error:"GIF search unavailable"},{status:502});
 const body=await response.json();
 const items=(body.data||[]).map(x=>({id:x.id,title:x.title||"Sticker",preview:x.images?.fixed_width?.url||x.images?.original?.url,url:x.images?.original?.url})).filter(x=>x.preview&&x.url);
 return Response.json({items},{headers:{"Cache-Control":"private, max-age=60"}});
}