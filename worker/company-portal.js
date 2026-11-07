import {workspaceSchema} from '../lib/model.ts';
import {companyGrantSchema,companyView,mergeCompanyState} from '../lib/company-access.ts';
import {readWorkspace,boundedText} from './workspace-media.js';
import {saveWorkspace} from './save-workspace.js';
import {checkAssets,expandWorkspace} from '../lib/workspace-media.ts';
import {photoFromPixels,canonicalPhoto} from './photo-pixels.js';
const full={manageTeams:true,editBranding:true,publish:true};
const viewGrant=r=>({email:r.email,role:r.role,profileId:r.profile_id,groupIds:JSON.parse(r.group_ids),editableFields:JSON.parse(r.editable_fields),permissions:JSON.parse(r.permissions),enabled:!!r.enabled,revision:r.revision,hasSignedIn:!!r.user_id,updatedAt:r.updated_at});
async function workspace(env,ownerId){const row=await env.DB.prepare('SELECT payload,version FROM card_workspaces WHERE owner_id=?').bind(ownerId).first();return row?{state:workspaceSchema.parse(await readWorkspace(env.DB,ownerId,row.payload)),version:row.version}:null;}
async function studioOwner(env){return(await env.DB.prepare('SELECT owner_id FROM card_studio_owner WHERE singleton=1').bind().first())?.owner_id;}
export async function companyMemberships(env,context,userId,email){
 if(!userId||!email)return [];
 const ownerId=context?.role==='owner'?context.ownerId:await studioOwner(env);if(!ownerId)return [];
 const ws=await workspace(env,ownerId);if(!ws)return [];
 if(context?.role==='owner')return ws.state.companies.map(c=>({companyId:c.id,name:c.name,role:'owner'}));
 const row=await env.DB.prepare("SELECT json_group_array(json_object('companyId',company_id,'role',role,'userId',user_id)) AS memberships FROM card_company_access WHERE studio_owner_id=? AND email=? AND enabled=1").bind(ownerId,email.toLowerCase()).first();
 return JSON.parse(row.memberships).filter(g=>(!g.userId||g.userId===userId)&&ws.state.companies.some(c=>c.id===g.companyId)).map(g=>({companyId:g.companyId,role:g.role,name:ws.state.companies.find(c=>c.id===g.companyId).name}));
}
async function memberContext(env,context,userId,email,companyId){
 if(!userId||!email||!companyId)return null;
 if(context?.role==='owner')return {role:'owner',companyId,profileId:null,groupIds:[],editableFields:[],permissions:full,ownerId:context.ownerId,admin:true};
 const ownerId=await studioOwner(env);if(!ownerId)return null;
 let row=await env.DB.prepare('SELECT * FROM card_company_access WHERE studio_owner_id=? AND company_id=? AND email=? AND enabled=1').bind(ownerId,companyId,email.toLowerCase()).first();
 if(!row||row.user_id&&row.user_id!==userId)return null;
 if(!row.user_id)row=await env.DB.prepare('UPDATE card_company_access SET user_id=? WHERE id=? AND user_id IS NULL AND enabled=1 AND revision=? RETURNING *').bind(userId,row.id,row.revision).first()||await env.DB.prepare('SELECT * FROM card_company_access WHERE id=? AND user_id=? AND enabled=1 AND revision=?').bind(row.id,userId,row.revision).first();
 if(!row)return null;
 return {...viewGrant(row),companyId,ownerId,grantId:row.id,admin:false};
}
const safeAccess=a=>({role:a.role,companyId:a.companyId,profileId:a.profileId,groupIds:a.groupIds,editableFields:a.editableFields,permissions:a.permissions,admin:a.admin});
export async function companyApi(request,env,context,userId,email,json){
 if(!userId)return json({error:'Sign in to access your company.'},401);
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==='/api/company/session')return method==='GET'?json({memberships:await companyMemberships(env,context,userId,email),email}):json({error:'Method not allowed.'},405);
 const companyId=url.searchParams.get('companyId')||'',a=await memberContext(env,context,userId,email,companyId);
 if(!a)return json({error:'Company unavailable or access revoked.'},403);
 if(method==='PUT'){
  if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
  const rate=await env.DB.prepare('INSERT INTO card_personal_limits(owner_id,window,requests) VALUES (?,?,1) ON CONFLICT(owner_id) DO UPDATE SET window=excluded.window,requests=CASE WHEN card_personal_limits.window=excluded.window THEN card_personal_limits.requests+1 ELSE 1 END RETURNING requests').bind('company:'+userId,Math.floor(Date.now()/60000)).first();
  if(rate.requests>60)return json({error:'Too many company changes. Wait a minute before trying again.'},429);
 }
 const ws=await workspace(env,a.ownerId);if(!ws||!ws.state.companies.some(c=>c.id===companyId))return json({error:'Company unavailable.'},404);
 if(path==='/api/company/access'){
  if(a.role!=='owner')return json({error:'Only a company owner can manage its members.'},403);
  if(method==='GET'){
   const row=await env.DB.prepare("SELECT json_group_array(json_object('email',email,'role',role,'profileId',profile_id,'groupIds',json(group_ids),'editableFields',json(editable_fields),'permissions',json(permissions),'enabled',enabled,'revision',revision,'hasSignedIn',CASE WHEN user_id IS NULL THEN 0 ELSE 1 END,'updatedAt',updated_at)) AS members FROM (SELECT * FROM card_company_access WHERE studio_owner_id=? AND company_id=? ORDER BY email LIMIT 250)").bind(a.ownerId,companyId).first();
   return json({members:JSON.parse(row.members).map(g=>({...g,enabled:!!g.enabled,hasSignedIn:!!g.hasSignedIn})),limit:250});
  }
  if(method!=='PUT')return json({error:'Method not allowed.'},405);
  if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
  let raw;try{raw=JSON.parse(await boundedText(request,32000));}catch{return json({error:'Invalid or oversized access settings.'},400);}
  const parsed=companyGrantSchema.safeParse(raw);if(!parsed.success)return json({error:parsed.error.issues.map(i=>i.message).join(' ')},400);
  const c=parsed.data;if(c.companyId!==companyId)return json({error:'Choose the current company.'},403);
  if(c.email===env.ADMIN_EMAIL?.toLowerCase())return json({error:'Ascend owner access is already available.'},400);
  if(!a.admin&&c.email===email.toLowerCase())return json({error:'Ask Ascend to change your own owner access.'},403);
  if(c.groupIds.some(id=>!ws.state.groups.some(g=>g.id===id&&g.companyId===companyId)))return json({error:'Choose groups from this company.'},400);
  if(c.enabled&&c.role==='employee'&&!ws.state.profiles.some(p=>p.id===c.profileId&&p.companyId===companyId&&!p.archived))return json({error:'Choose an active profile from this company.'},400);
  if(c.enabled&&c.role==='employee'){
   const conflict=await env.DB.prepare("SELECT id FROM card_company_access WHERE studio_owner_id=? AND company_id=? AND profile_id=? AND role='employee' AND enabled=1 AND email<>?").bind(a.ownerId,companyId,c.profileId,c.email).first();
   if(conflict)return json({error:'That employee profile is already assigned to another account.'},409);
  }
  const memberGuard=a.admin?'1=1':"EXISTS (SELECT 1 FROM card_company_access WHERE id=? AND user_id=? AND enabled=1 AND revision=? AND role='owner')";
  const guard='('+memberGuard+') AND EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=? AND version=?)';
  const args=[...(a.admin?[]:[a.grantId,userId,a.revision]),a.ownerId,ws.version],perms=c.role==='owner'?full:c.role==='employee'?{manageTeams:false,editBranding:false,publish:c.permissions.publish}:c.permissions;
  const token=crypto.randomUUID();
  const result=await env.DB.batch([env.DB.prepare("INSERT INTO card_company_access(id,studio_owner_id,company_id,email,user_id,role,profile_id,group_ids,editable_fields,permissions,enabled,revision,mutation_token,updated_at) SELECT ?,?,?,?,NULL,?,?,?,?,?,?,1,?,? WHERE ((?=0 AND ?=1 AND (SELECT count(*) FROM card_company_access WHERE studio_owner_id=? AND company_id=?)<250) OR EXISTS (SELECT 1 FROM card_company_access WHERE studio_owner_id=? AND company_id=? AND email=?)) AND "+guard+" ON CONFLICT(studio_owner_id,company_id,email) DO UPDATE SET role=excluded.role,profile_id=excluded.profile_id,group_ids=excluded.group_ids,editable_fields=excluded.editable_fields,permissions=excluded.permissions,enabled=excluded.enabled,revision=card_company_access.revision+1,mutation_token=excluded.mutation_token,updated_at=excluded.updated_at WHERE card_company_access.revision=? AND "+guard+" RETURNING *").bind(crypto.randomUUID(),a.ownerId,companyId,c.email,c.role,c.role==='employee'?c.profileId:null,JSON.stringify(c.role==='manager'?c.groupIds:[]),JSON.stringify(c.role==='employee'?c.editableFields:[]),JSON.stringify(perms),c.enabled?1:0,token,new Date().toISOString(),c.revision,c.enabled?1:0,a.ownerId,companyId,a.ownerId,companyId,c.email,...args,c.revision,...args)]);
  return result[0]?.results?.[0]?json({member:viewGrant(result[0].results[0])}):json({error:'Access changed or the pilot member limit was reached. Reload the member list.'},409);
 }
 if(path!=='/api/company/workspace')return json({error:'Not found.'},404);
 if(method==='GET')return json({state:companyView(ws.state,a),version:ws.version,access:safeAccess(a)});
 if(method!=='PUT')return json({error:'Method not allowed.'},405);
 if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
 let body;try{body=JSON.parse(await boundedText(request,8000000));}catch{return json({error:'Invalid or oversized save.'},400);}
 if(body.version!==ws.version)return json({error:'Company data changed in another tab. Export your draft before reloading.'},409);
 const parsed=workspaceSchema.safeParse(body.assets?expandWorkspace(body.state,await checkAssets(body.assets)):body.state);
 if(!parsed.success)return json({error:'Invalid company profile data.'},400);
 const op=body.operation||{action:'save'};
 if(!['save','publish','unpublish'].includes(op.action)||op.profileId&&typeof op.profileId!=='string')return json({error:'Invalid publication action.'},400);
 // External customer uploads use the same controlled pixel pipeline as personal photos.
 for(const p of parsed.data.profiles){
  const old=ws.state.profiles.find(x=>x.id===p.id);
  if((p.coverImage||'')!==(old?.coverImage||'')||(p.backgroundImage||'')!==(old?.backgroundImage||''))return json({error:'Cover and background uploads are managed by Ascend during this pilot.'},403);
  if(body.operation?.pixels&&op.profileId===p.id){try{p.photo=await photoFromPixels(body.operation.pixels);}catch{return json({error:'Invalid profile photo pixels.'},400);}}
  else if((p.photo||'')!==(old?.photo||'')){try{if(p.photo)p.photo=await canonicalPhoto(p.photo);}catch{return json({error:'Choose the profile photo using the upload control.'},400);}}
 }
 const state=mergeCompanyState(ws.state,parsed.data,a,op);
 state.activity=[{id:crypto.randomUUID(),action:('Company '+a.role+' '+email+' saved '+companyId).slice(0,180),at:new Date().toISOString()},...state.activity].slice(0,60);
 const guard=a.admin?'1=1':'EXISTS (SELECT 1 FROM card_company_access WHERE id=? AND studio_owner_id=? AND company_id=? AND user_id=? AND enabled=1 AND revision=?)';
 const guardArgs=a.admin?[]:[a.grantId,a.ownerId,companyId,userId,a.revision];
 const version=await saveWorkspace(env,{ownerId:a.ownerId,state,version:body.version,guard,guardArgs});
 return version?json({state:companyView(state,a),version,access:safeAccess(a)}):json({error:'Your company access or data changed during saving. Export your draft and reload.'},409);
}

