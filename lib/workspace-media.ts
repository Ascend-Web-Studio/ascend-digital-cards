import {imageSchema,type State} from './model';
export const MAX_EXPANDED=16_000_000,MAX_DOCUMENT=1_400_000,MAX_ASSETS=4_000_000;
export type Asset={id:string,data:string};
export class MediaError extends Error{constructor(message:string,public status=400){super(message);}}
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length;
export async function assetId(data:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function packWorkspace(state:State){
 if(bytes(state)>MAX_EXPANDED)throw new MediaError('This workspace exceeds the 16 MB expanded safety limit. Export a backup before continuing.',413);
 const assets:Asset[]=[],known=new Map<string,string>();
 async function walk(v:unknown):Promise<unknown>{
  if(typeof v==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(v)){
   let id=known.get(v);if(!id){id=await assetId(v);known.set(v,id);assets.push({id,data:v});}
   return {__ascendImage:id};
  }
  if(Array.isArray(v)){const out=[];for(const x of v)out.push(await walk(x));return out;}
  if(v&&typeof v==='object'){const out:Record<string,unknown>={};for(const [k,x]of Object.entries(v))out[k]=await walk(x);return out;}
  return v;
 }
 const packed=await walk(state);
 if(assets.length>200||bytes(assets)>MAX_ASSETS)throw new MediaError('This workspace exceeds its 4 MB unique-image budget. Export a backup before continuing.',413);
 if(bytes(packed)>MAX_DOCUMENT)throw new MediaError('The workspace text and revision data exceed the document budget. Export a backup before continuing.',413);
 return {state:packed,assets};
}
export function expandWorkspace(raw:unknown,assets:Asset[]):unknown{
 const map=new Map(assets.map(a=>[a.id,a.data]));
 function walk(v:unknown):unknown{
  if(Array.isArray(v))return v.map(walk);
  if(v&&typeof v==='object'){
   const obj=v as Record<string,unknown>;
   if(Object.keys(obj).length===1&&typeof obj.__ascendImage==='string'){
    const data=map.get(obj.__ascendImage);if(!data)throw new MediaError('An image is missing from this save. Export your draft and retry.');return data;
   }
   return Object.fromEntries(Object.entries(obj).map(([k,x])=>[k,walk(x)]));
  }return v;
 }
 const result=walk(raw);if(bytes(result)>MAX_EXPANDED)throw new MediaError('The expanded workspace exceeds its safety limit.',413);return result;
}
export async function checkAssets(raw:unknown):Promise<Asset[]>{
 if(!Array.isArray(raw)||raw.length>200||bytes(raw)>MAX_ASSETS)throw new MediaError('Invalid or oversized image collection.',413);
 const result:Asset[]=[];const ids=new Set<string>();
 for(const a of raw){
  if(!a||typeof a.id!=='string'||!/^[a-f0-9]{64}$/.test(a.id)||typeof a.data!=='string'||!imageSchema.safeParse(a.data).success||!a.data||ids.has(a.id)||await assetId(a.data)!==a.id)throw new MediaError('An image reference failed validation.');
  ids.add(a.id);result.push({id:a.id,data:a.data});
 }return result;
}

