import {z} from 'zod';
const configSchema=z.object({email:z.string().trim().toLowerCase().email().max(254),enabled:z.boolean(),revision:z.number().int().min(0)}).strict();
const memberView=r=>({email:r.email,enabled:!!r.enabled,revision:r.revision,hasSignedIn:!!r.user_id,updatedAt:r.updated_at});
export async function personalContext(env,context,userId,email){
 if(context?.role==='owner')return {role:'owner',email};
 if(!userId||!email)return null;
 let row=await env.DB.prepare('SELECT * FROM card_personal_access WHERE email=? AND enabled=1').bind(email.toLowerCase()).first();
 if(!row||row.user_id&&row.user_id!==userId)return null;
 if(!row.user_id)row=await env.DB.prepare('UPDATE card_personal_access SET user_id=? WHERE id=? AND user_id IS NULL AND enabled=1 AND revision=? RETURNING *').bind(userId,row.id,row.revision).first()||await env.DB.prepare('SELECT * FROM card_personal_access WHERE id=? AND enabled=1 AND revision=? AND user_id=?').bind(row.id,row.revision,userId).first();
 return row?{role:'personal',email,grantId:row.id,revision:row.revision,studioOwnerId:row.studio_owner_id}:null;
}
export function personalGuard(account,userId){
 return account.role==='owner'?{sql:'1=1',args:[]}:{
 sql:'EXISTS (SELECT 1 FROM card_personal_access WHERE id=? AND studio_owner_id=? AND user_id=? AND enabled=1 AND revision=?)',
 args:[account.grantId,account.studioOwnerId,userId,account.revision]};
}
export async function personalAccessApi(request,env,context,userId,json){
 if(!userId)return json({error:'Sign in to manage personal access.'},401);
 if(context?.role!=='owner')return json({error:'Only the studio owner can manage personal access.'},403);
 const DB=env.DB,method=request.method;
 if(method==='GET'){
  const row=await DB.prepare("SELECT json_group_array(json_object('email',email,'enabled',enabled,'revision',revision,'hasSignedIn',CASE WHEN user_id IS NULL THEN 0 ELSE 1 END,'updatedAt',updated_at)) AS members FROM (SELECT * FROM card_personal_access WHERE studio_owner_id=? ORDER BY email LIMIT 100)").bind(context.ownerId).first();
  return json({members:JSON.parse(row.members).map(r=>({...r,enabled:!!r.enabled,hasSignedIn:!!r.hasSignedIn})),limit:100});
 }
 if(method!=='PUT')return json({error:'Method not allowed.'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'Unexpected request origin.'},403);
 if(Number(request.headers.get('content-length')||0)>4096)return json({error:'Access settings are too large.'},413);
 const text=await request.text();if(new TextEncoder().encode(text).length>4096)return json({error:'Access settings are too large.'},413);
 let raw;try{raw=JSON.parse(text);}catch{return json({error:'Invalid JSON.'},400);}
 const valid=configSchema.safeParse(raw);if(!valid.success)return json({error:'Enter a valid email, access setting and current revision.'},400);
 const c=valid.data;
 if(c.email===env.ADMIN_EMAIL?.toLowerCase())return json({error:'Your owner access is already enabled.'},400);
 const id=crypto.randomUUID(),token=crypto.randomUUID(),now=new Date().toISOString();
 const grantGuard='EXISTS (SELECT 1 FROM card_personal_access WHERE studio_owner_id=? AND mutation_token=? AND enabled=0 AND user_id IS NOT NULL)';
 const result=await DB.batch([
  DB.prepare('INSERT INTO card_personal_access(id,studio_owner_id,email,user_id,enabled,revision,updated_at,mutation_token) SELECT ?,?,?,NULL,?,1,?,? WHERE (?=0 AND ?=1 AND (SELECT count(*) FROM card_personal_access WHERE studio_owner_id=?)<100) OR EXISTS (SELECT 1 FROM card_personal_access WHERE studio_owner_id=? AND email=?) ON CONFLICT(email) DO UPDATE SET enabled=excluded.enabled,revision=card_personal_access.revision+1,updated_at=excluded.updated_at,mutation_token=excluded.mutation_token WHERE card_personal_access.studio_owner_id=? AND card_personal_access.revision=? RETURNING *').bind(id,context.ownerId,c.email,c.enabled?1:0,now,token,c.revision,c.enabled?1:0,context.ownerId,context.ownerId,c.email,context.ownerId,c.revision),
  DB.prepare("DELETE FROM card_public_views WHERE owner_id='personal:'||(SELECT user_id FROM card_personal_access WHERE mutation_token=? AND studio_owner_id=?) AND "+grantGuard).bind(token,context.ownerId,context.ownerId,token),
  DB.prepare('UPDATE card_personal_profiles SET live=NULL,published_at=NULL,version=version+1,save_token=?,updated_at=? WHERE owner_id=(SELECT user_id FROM card_personal_access WHERE mutation_token=? AND studio_owner_id=?) AND '+grantGuard).bind(token,now,token,context.ownerId,context.ownerId,token)
 ]);
 const row=result[0]?.results?.[0];
 return row?json({member:memberView(row)}):json({error:'Access changed in another tab, or the pilot has reached its 100-account limit. Reload the list.'},409);
}

