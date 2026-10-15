export async function onRequestGet({request,env}){
  const key=env.YOUTUBE_API_KEY;
  if(!key)return Response.json({error:"Set YOUTUBE_API_KEY in Cloudflare Pages environment variables to enable full-song search."},{status:503});
  const q=new URL(request.url).searchParams.get("q")?.trim();
  if(!q||q.length>150)return Response.json({error:"Enter a song name (up to 150 characters)."},{status:400});
  const url=new URL("https://www.googleapis.com/youtube/v3/search");
  url.search=new URLSearchParams({part:"snippet",type:"video",videoEmbeddable:"true",maxResults:"12",q:q+" music",key}).toString();
  try{
    const response=await fetch(url.toString());
    const data=await response.json();
    if(!response.ok)return Response.json({error:data.error?.message||"YouTube search unavailable"},{status:502});
    return Response.json({results:(data.items||[]).filter(x=>/^[a-zA-Z0-9_-]{11}$/.test(x.id?.videoId||"")).map(x=>({id:x.id.videoId,title:x.snippet?.title||"Song",channel:x.snippet?.channelTitle||"",thumbnail:x.snippet?.thumbnails?.medium?.url||""}))},{headers:{"Cache-Control":"public, max-age=120"}});
  }catch{return Response.json({error:"Unable to reach YouTube search."},{status:502})}
}
