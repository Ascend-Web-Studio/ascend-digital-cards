import {photoFromPixels,canonicalPhoto} from './photo-pixels.js';
import {personalGuard} from './personal-access.js';
import {personalSaveSchema,newPersonalDoc} from '../lib/personal.ts';
export async function personalApi(request,env,userId,account,json){
 if(!userId)return json({error:'Sign in to access your personal card.'},401);
 if(!account)return json({error:'The personal editor is in a closed invitation-only pilot. Public registration is not open yet.'},403);
 const DB=env.DB,method=request.method,url=new URL(request.url);
 const membership=personalGuard(account,userId);
 const row=await DB.prepare('SELECT * FROM card_personal_profiles WHERE owner_id=? AND '+membership.sql).bind(userId,...membership.args).first();
 if(account.role==='personal'&&!await DB.prepare('SELECT 1 AS ok WHERE '+membership.sql).bind(...membership.args).first())return json({error:'Your personal access changed. Ask Ascend to restore access.'},403);
 const view=r=>({id:r?.id||null,doc:r?JSON.parse(r.draft):newPersonalDoc(),version:r?.version||0,published:!!r?.live,publishedAt:r?.published_at||null,updatedAt:r?.updated_at||null,account:{role:account.role,email:account.email}});
 if(method==='GET')return json(view(row));
 if(method!=='PUT')return json({error:'Method not allowed.'},405);
 if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
 if(Number(request.headers.get('content-length')||0)>262144)return json({error:'Personal card limit: 256 KB.'},413);
 const window=Math.floor(Date.now()/60000);
 const rate=await DB.prepare('INSERT INTO card_personal_limits(owner_id,window,requests) VALUES (?,?,1) ON CONFLICT(owner_id) DO UPDATE SET window=excluded.window,requests=CASE WHEN card_personal_limits.window=excluded.window THEN card_personal_limits.requests+1 ELSE 1 END RETURNING requests').bind(userId,window).first();
 if(rate.requests>30)return json({error:'Too many saves. Wait a minute before trying again.'},429);
 const chunks=[];let bytes=0;const reader=request.body?.getReader();
 if(reader){while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>262144){await reader.cancel();return json({error:'Personal card limit: 256 KB.'},413);}chunks.push(part.value);}}
 const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}const text=new TextDecoder().decode(buffer);
 let raw;try{raw=JSON.parse(text);}catch{return json({error:'Invalid JSON.'},400);}
 const valid=personalSaveSchema.safeParse(raw);
 if(!valid.success)return json({error:valid.error.issues.slice(0,3).map(i=>i.message).join(' ')},400);
 const {doc,version,action,pixels}=valid.data;
 try{if(pixels)doc.photo=await photoFromPixels(pixels);else if(doc.photo)doc.photo=await canonicalPhoto(doc.photo);}catch{return json({error:'The profile photo could not be validated. Choose it again using the photo control.'},400);}
 if(version!==(row?.version||0))return json({error:'This card changed in another tab. Reload to load the latest saved version.'},409);
 const id=row?.id||crypto.randomUUID(),token=crypto.randomUUID(),now=new Date().toISOString(),payload=JSON.stringify(doc);
 const live=action==='publish'?payload:action==='unpublish'?null:row?.live||null;
 const publishedAt=action==='publish'?now:action==='unpublish'?null:row?.published_at||null;
 const guard='EXISTS (SELECT 1 FROM card_personal_profiles WHERE owner_id=? AND save_token=?)';
 const results=await DB.batch([
  DB.prepare('INSERT INTO card_personal_profiles(owner_id,id,draft,live,version,updated_at,published_at,save_token) SELECT ?,?,?,?,1,?,?,? WHERE (?=0 OR EXISTS (SELECT 1 FROM card_personal_profiles WHERE owner_id=?)) AND '+membership.sql+' ON CONFLICT(owner_id) DO UPDATE SET draft=excluded.draft,live=excluded.live,version=card_personal_profiles.version+1,updated_at=excluded.updated_at,published_at=excluded.published_at,save_token=excluded.save_token WHERE card_personal_profiles.version=? AND '+membership.sql+' RETURNING *').bind(userId,id,payload,live,now,publishedAt,token,version,userId,...membership.args,version,...membership.args),
  DB.prepare('DELETE FROM card_public_views WHERE view_key=? AND owner_id=? AND '+guard).bind('p/'+id,'personal:'+userId,userId,token),
  DB.prepare('INSERT INTO card_public_views(view_key,owner_id,payload) SELECT ?,?,? WHERE ? IS NOT NULL AND '+guard).bind('p/'+id,'personal:'+userId,live,live,userId,token)
 ]);
 const saved=results[0]?.results?.[0];
 return saved?json(view(saved)):json({error:'This card changed while saving. Reload before trying again.'},409);
}

