export const STICKER_PACKS = [
  {id:"sketchy",name:"Sketchy Icons",description:"Hand-drawn line stickers",prefix:"https://raw.githubusercontent.com/Downshift/sketchy-icons/main/svg/",catalog:"/sticker-catalogs/sketchy.json",license:"MIT"},
  {id:"doodle",name:"Doodle Icons",description:"Wiggly doodle line drawings",prefix:"https://raw.githubusercontent.com/oreo-design/doodle-icons/main/icons/",catalog:"/sticker-catalogs/doodle.json",license:"See original project"},
  {id:"freehand",name:"Streamline Freehand",description:"Freehand outline drawings",iconify:"streamline-freehand",license:"CC BY 4.0"},
  {id:"mega",name:"Mega Doodles Pack",description:"Colorful playful drawings",prefix:"https://raw.githubusercontent.com/MariaLetta/mega-doodles-pack/master/doodles/svg/",catalog:"/sticker-catalogs/mega.json",license:"See original project"},
  {id:"freehand-color",name:"Streamline Freehand Color",description:"Colorful freehand drawings",iconify:"streamline-freehand-color",license:"CC BY 4.0"},
  {id:"stickies-color",name:"Streamline Stickies Color",description:"Colorful cute stickers",iconify:"streamline-stickies-color",license:"CC BY 4.0"},
];
export async function getStickerPackItems(pack){
  if(pack.catalog){
    const response=await fetch(pack.catalog);
    if(!response.ok)throw Error("Could not load sticker folder");
    return (await response.json()).map(name=>({name:name.replace(/\.svg$/,"").replace(/-/g," "),url:pack.prefix+name}));
  }
  const response=await fetch("https://api.iconify.design/collection?prefix="+encodeURIComponent(pack.iconify));
  if(!response.ok)throw Error("Could not load icon collection");
  const data=await response.json();
  const names=[...(data.uncategorized||[]),...Object.values(data.categories||{}).flat()];
  return [...new Set(names)].map(name=>({name:name.replace(/-/g," "),url:"https://api.iconify.design/"+pack.iconify+"/"+encodeURIComponent(name)+".svg"}));
}
