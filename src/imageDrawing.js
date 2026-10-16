// Test a board-space stroke segment against a rotated image rectangle.
export function segmentHitsImage(start, end, image) {
  const cx=image.x+image.width/2,cy=image.y+image.height/2;
  const c=Math.cos(image.angle||0),s=Math.sin(image.angle||0);
  const local=p=>({x:(p.x-cx)*c+(p.y-cy)*s,y:-(p.x-cx)*s+(p.y-cy)*c});
  const a=local(start),b=local(end);
  let low=0,high=1;
  for(const [p,d,half] of [[a.x,b.x-a.x,image.width/2],[a.y,b.y-a.y,image.height/2]]){
    if(Math.abs(d)<1e-12){if(p < -half || p > half)return false;continue}
    const t1=(-half-p)/d,t2=(half-p)/d;
    low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));
    if(low>high)return false;
  }
  return true;
}
