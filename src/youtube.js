let loading;
export function loadYouTube() {
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(!loading)loading=new Promise((resolve,reject)=>{
    let script=document.querySelector('script[data-youtube-iframe-api]');
    const previous=window.onYouTubeIframeAPIReady;
    const finish=()=>{clearTimeout(timer);window.onYouTubeIframeAPIReady=previous;resolve(window.YT)};
    window.onYouTubeIframeAPIReady=()=>{previous?.();finish()};
    const timer=setTimeout(()=>{window.onYouTubeIframeAPIReady=previous;script?.remove();reject(Error('YouTube took too long to load'))},20000);
    if(!script){script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.dataset.youtubeIframeApi='1';document.head.appendChild(script)}
    script.onerror=()=>{clearTimeout(timer);window.onYouTubeIframeAPIReady=previous;script.remove();reject(Error('YouTube is unavailable'))};
  }).catch(error=>{loading=null;throw error});
  return loading;
}
