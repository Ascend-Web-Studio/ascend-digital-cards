import {workspaceSchema} from '../lib/model.ts';
import {packWorkspace,assetId} from '../lib/workspace-media.ts';
import {readWorkspace,boundedText} from './workspace-media.js';
import {saveWorkspace} from './save-workspace.js';

const memberSnapshotSql="SELECT json_group_array(json_object('id',id,'revision',revision,'userId',user_id)) AS snapshot FROM (SELECT id,revision,user_id FROM card_company_access WHERE studio_owner_id=? AND company_id=? AND profile_id=? AND role='employee' ORDER BY id)";
export async function profileDeletion(request,env,context,userId,profileId,json){
 if(!userId)return json({error:'Sign in to manage profiles.'},401);
 if(context?.role!=='owner')return json({error:'Only the studio owner can permanently delete profiles.'},403);
 if(!['GET','DELETE'].includes(request.method))return json({error:'Method not allowed.'},405);
 const origin=new URL(request.url).origin;
 if(request.method==='DELETE'&&request.headers.get('origin')!==origin)return json({error:'Unexpected request origin.'},403);
 const row=await env.DB.prepare('SELECT payload,version FROM card_workspaces WHERE owner_id=?').bind(context.ownerId).first();
 if(!row)return json({error:'Profile unavailable.'},404);
 const state=workspaceSchema.parse(await readWorkspace(env.DB,context.ownerId,row.payload));
 const profile=state.profiles.find(p=>p.id===profileId);
 if(!profile)return json({error:'Profile unavailable or already deleted.'},404);
 if(!profile.archived)return json({error:'Archive and save this profile before permanently deleting it.'},409);
 const memberArgs=[context.ownerId,profile.companyId,profile.id];
 const {snapshot}=await env.DB.prepare(memberSnapshotSql).bind(...memberArgs).first();
 const accessFingerprint=await assetId(snapshot);
 const next=structuredClone(state);
 next.profiles=next.profiles.filter(p=>p.id!==profile.id);
 const assignments=next.cards.filter(c=>c.profileId===profile.id);
 for(const card of assignments){card.profileId='';card.status='disabled';card.qa=false;}
 // Remove profile-labelled activity as well as draft, live and history data.
 next.activity=next.activity.filter(a=>!a.action.includes(profile.id)&&!a.action.includes(profile.name));
 next.activity=[{id:crypto.randomUUID(),action:'Permanently deleted an archived profile',at:new Date().toISOString()},...next.activity].slice(0,60);
 if(request.method==='GET'){
  const [before,after]=await Promise.all([packWorkspace(state),packWorkspace(next)]);
  const retained=new Set(after.assets.map(a=>a.id));
  return json({profile:{id:profile.id,name:profile.name,companyName:state.companies.find(c=>c.id===profile.companyId)?.name||''},version:row.version,accessFingerprint,
   impact:{profiles:1,savedRevisions:profile.history.length+(profile.live?1:0),employeeAccessRecords:JSON.parse(snapshot).length,nfcAssignments:assignments.length,unusedImages:before.assets.filter(a=>!retained.has(a.id)).length}});
 }
 let body;try{body=JSON.parse(await boundedText(request,4096));}catch{return json({error:'Invalid or oversized deletion request.'},400);}
 if(!body||Object.keys(body).sort().join(',')!=='accessFingerprint,confirmationName,version'||!Number.isSafeInteger(body.version)||typeof body.confirmationName!=='string'||typeof body.accessFingerprint!=='string')return json({error:'Invalid deletion confirmation.'},400);
 if(body.version!==row.version||body.accessFingerprint!==accessFingerprint)return json({error:'Profile or access settings changed. Close this dialog and review a fresh deletion preview.'},409);
 if(body.confirmationName!==profile.name)return json({error:'Type the exact profile name to confirm deletion.'},400);
 // Recheck access changes inside the same transaction as the workspace revision.
 const guard='('+memberSnapshotSql+')=?';
 const version=await saveWorkspace(env,{ownerId:context.ownerId,state:next,version:row.version,guard,guardArgs:[...memberArgs,snapshot],
  additionalStatements:(DB,saveGuard,saveArgs)=>[
   DB.prepare('DELETE FROM card_company_access WHERE studio_owner_id=? AND company_id=? AND profile_id=? AND role=\'employee\' AND '+saveGuard).bind(...memberArgs,...saveArgs),
   DB.prepare('INSERT INTO card_deleted_profiles(owner_id,profile_id,deleted_at) SELECT ?,?,? WHERE '+saveGuard).bind(context.ownerId,profile.id,new Date().toISOString(),...saveArgs)
  ]});
 return version?json({state:next,version}):json({error:'Profile or access settings changed during deletion. Reload and review again.'},409);
}
