import {MediaError} from '../lib/workspace-media.ts';
import {expandWorkspace} from '../lib/workspace-media.ts';
export async function readWorkspace(DB,ownerId,payload){
 const raw=JSON.parse(payload),ids=new Set();
 function scan(v){if(Array.isArray(v))v.forEach(scan);else if(v&&typeof v==='object'){if(Object.keys(v).length===1&&typeof v.__ascendImage==='string')ids.add(v.__ascendImage);else Object.values(v).forEach(scan);}}
 scan(raw);const list=[...ids],assets=[];
 for(let i=0;i<list.length;i+=5){
  const row=await DB.prepare('SELECT json_group_array(json_object(\'id\',id,\'data\',data_uri)) AS assets FROM card_workspace_images WHERE owner_id=? AND id IN (SELECT value FROM json_each(?))').bind(ownerId,JSON.stringify(list.slice(i,i+5))).first();
  assets.push(...JSON.parse(row.assets));
 }
 return expandWorkspace(raw,assets);
}
export function imageStatements(DB,ownerId,assets,saveToken){
 const guard='EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=? AND save_token=?)',out=[];
 for(let i=0;i<assets.length;i+=5)out.push(DB.prepare("INSERT INTO card_workspace_images(owner_id,id,data_uri) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.data') FROM json_each(?) WHERE "+guard+" ON CONFLICT(owner_id,id) DO NOTHING").bind(ownerId,JSON.stringify(assets.slice(i,i+5)),ownerId,saveToken));
 out.push(DB.prepare('DELETE FROM card_workspace_images WHERE owner_id=? AND id NOT IN (SELECT value FROM json_each(?)) AND '+guard).bind(ownerId,JSON.stringify(assets.map(a=>a.id)),ownerId,saveToken));
 return out;
}


export async function boundedText(request,max){const reader=request.body?.getReader(),parts=[];let size=0;if(reader){while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new MediaError('Workspace size limit exceeded.',413);}parts.push(value);}}const out=new Uint8Array(size);let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length;}return new TextDecoder().decode(out);}
