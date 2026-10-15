export async function onRequestGet({request,env}) {
 const params=new URL(request.url).searchParams;
 const q=(params.get("q")||"").trim().slice(0,80);
 const source=params.get("source")==="commons"?"commons":"giphy";
 const kind=params.get("kind")==="gif"?"gifs":"stickers";
 if(!q)return Response.json({items:[]});
 if(source==="commons"){
   const u=new URL("https://commons.wikimedia.org/w/api.php");
   for(const [k,v] of Object.entries({action:"query",generator:"search",gsrsearch:q+" filetype:bitmap",gsrnamespace:"6",gsrlimit:"24",prop:"imageinfo",iiprop:"url|mime|size",iiurlwidth:"180",format:"json",origin:"*"}))u.searchParams.set(k,v);
   const r=await fetch(u.toString(),{headers:{"User-Agent":"WhiteboardStickerSearch/1.0 (personal project)"}});
   if(!r.ok)return Response.json({error:"Wikimedia search unavailable"},{status:502});
   const data=await r.json();
   const items=Object.values(data.query?.pages||{}).map(p=>({id:String(p.pageid),title:p.title.replace(/^File:/,""),preview:p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url,url:p.imageinfo?.[0]?.url,source:"commons"})).filter(x=>x.preview&&x.url&&/^https:\/\/upload\.wikimedia\.org\//.test(x.url));
   return Response.json({items},{headers:{"Cache-Control":"private, max-age=60"}});
 }
 if(!env.GIPHY_API_KEY)return Response.json({error:"Add GIPHY_API_KEY secret"},{status:503});
 const u=new URL("https://api.giphy.com/v1/"+kind+"/search");
 for(const [k,v] of Object.entries({api_key:env.GIPHY_API_KEY,q,limit:"24",rating:"g"}))u.searchParams.set(k,v);
 const r=await fetch(u.toString());
 if(!r.ok)return Response.json({error:"GIPHY search unavailable"},{status:502});
 const data=await r.json();
 const items=(data.data||[]).map(x=>({id:x.id,title:x.title||"Sticker",preview:x.images?.fixed_width?.url||x.images?.original?.url,url:x.images?.original?.url,source:"giphy"})).filter(x=>x.preview&&x.url);
 return Response.json({items},{headers:{"Cache-Control":"private, max-age=60"}});
}