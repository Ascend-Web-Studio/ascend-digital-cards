import {z} from 'zod';
import {scopedWorkspace,mergeManagerWorkspace,PermissionError,type ManagerPermissions} from './access';
import {workspaceSchema,toDoc,type State,type Profile} from './model';
export const employeeFields=['name','role','email','phone','website','photo'] as const;
export type CompanyAccess={role:'owner'|'manager'|'employee',companyId:string,profileId:string|null,groupIds:string[],editableFields:string[],permissions:ManagerPermissions};
export const companyGrantSchema=z.object({
 companyId:z.string().min(1).max(80),email:z.string().trim().toLowerCase().email().max(254),
 role:z.enum(['owner','manager','employee']),profileId:z.string().max(80).nullable(),
 groupIds:z.array(z.string().min(1).max(80)).max(100),editableFields:z.array(z.enum(employeeFields)).max(6),
 permissions:z.object({manageTeams:z.boolean(),editBranding:z.boolean(),publish:z.boolean()}).strict(),
 enabled:z.boolean(),revision:z.number().int().min(0)
}).strict().superRefine((v,ctx)=>{
 if(v.role==='employee'&&!v.profileId)ctx.addIssue({code:'custom',message:'Assign an employee profile.'});
 if(v.role==='employee'&&(v.permissions.manageTeams||v.permissions.editBranding||v.groupIds.length))ctx.addIssue({code:'custom',message:'Employees can edit only their assigned personal fields.'});
 if(new Set(v.groupIds).size!==v.groupIds.length||new Set(v.editableFields).size!==v.editableFields.length)ctx.addIssue({code:'custom',message:'Duplicate selections.'});
});
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const pub=(p:Profile)=>({live:p.live,history:p.history,publishedAt:p.publishedAt,publicEnabled:p.publicEnabled??false});
export function companyView(state:State,a:CompanyAccess):State{
 const s=scopedWorkspace(state,[a.companyId]);
 if(a.role==='employee'){
  s.profiles=s.profiles.filter(p=>p.id===a.profileId&&!p.archived).map(p=>({...p,history:[]}));
  s.groups=s.groups.filter(g=>s.profiles.some(p=>p.groupId===g.id));
 }else if(a.role==='manager'&&a.groupIds.length){
  s.groups=s.groups.filter(g=>a.groupIds.includes(g.id));
  s.profiles=s.profiles.filter(p=>a.groupIds.includes(p.groupId));
 }
 return s;
}
export function mergeCompanyState(current:State,input:State,a:CompanyAccess,operation:{action:'save'|'publish'|'unpublish',profileId?:string}):State{
 const fail=(m:string):never=>{throw new PermissionError(m);};
 const visible=companyView(current,a),incoming=structuredClone(input);
 if(incoming.sections.length||incoming.cards.length||incoming.activity.length)fail('Studio libraries, NFC and activity are not customer-editable.');
 if(incoming.companies.length!==1||incoming.companies[0].id!==a.companyId)fail('Choose your own company.');
 for(const list of [incoming.groups,incoming.profiles])for(const item of list)if(item.companyId!==a.companyId)fail('Records must belong to your company.');
 const target=operation.profileId;
 if(operation.action!=='save'&&(!a.permissions.publish||!target||!incoming.profiles.some(p=>p.id===target)))fail('Publishing permission and a visible profile are required.');
 const existing=current.companies.find(c=>c.id===a.companyId);
 if(!existing)fail('Company unavailable.');
 // Only the trusted studio changes uploaded company media during this pilot.
 for(const key of ['logo','coverImage','coverPosition'] as const)if(!same(incoming.companies[0][key],existing![key]))fail('Company media is managed by Ascend during this pilot.');
 for(const p of incoming.profiles){
  const old=current.profiles.find(x=>x.id===p.id);
  if(old&&!visible.profiles.some(x=>x.id===p.id))fail('This profile is outside your assigned scope.');
  if(!old&&(p.live||p.history.length||p.publicEnabled||p.publishedAt))fail('New profiles must start as private drafts.');
  if(operation.action==='save'&&old&&!same(pub(p),pub(visible.profiles.find(x=>x.id===p.id)||old)))fail('Use the Publish or Unpublish action for public changes.');
  if(old){p.live=structuredClone(old.live);p.history=structuredClone(old.history);p.publishedAt=old.publishedAt;p.publicEnabled=old.publicEnabled;}
 }
 let merged:State;
 if(a.role==='employee'){
  if(incoming.profiles.length!==1||incoming.profiles[0].id!==a.profileId||!visible.profiles.length)fail('Only your assigned active profile is available.');
  if(!same(incoming.companies,visible.companies)||!same(incoming.groups,visible.groups))fail('Company branding and groups are locked.');
  const old=current.profiles.find(x=>x.id===a.profileId)!,p=incoming.profiles[0],allowed=new Set([...a.editableFields,'updatedAt']);
  for(const key of Object.keys({...old,...p}) as (keyof Profile)[])if(!allowed.has(key)&&!same(p[key],old[key]))fail('That profile field is locked by your company.');
  merged=workspaceSchema.parse({...current,profiles:current.profiles.map(x=>x.id===p.id?p:x)});
 }else{
  if(a.role==='manager'&&a.groupIds.length){
   if(!same(incoming.companies,visible.companies))fail('A team-scoped manager cannot change company-wide branding.');
   for(const g of incoming.groups){if(!a.groupIds.includes(g.id)||!visible.groups.some(x=>x.id===g.id))fail('Only assigned groups are available.');}
   for(const p of incoming.profiles)if(!a.groupIds.includes(p.groupId))fail('Choose an assigned group.');
  }
  const company=scopedWorkspace(current,[a.companyId]);
  const expanded={...incoming,
   groups:[...company.groups.filter(g=>!visible.groups.some(v=>v.id===g.id)),...incoming.groups],
   profiles:[...company.profiles.filter(p=>!visible.profiles.some(v=>v.id===p.id)),...incoming.profiles]
  };
  merged=mergeManagerWorkspace(current,expanded,{role:'manager',email:'company member',companyIds:[a.companyId],permissions:a.permissions});
 }
 if(operation.action!=='save'){
  const p=merged.profiles.find(x=>x.id===target)!;
  if(p.archived)fail('Restore this profile before publishing.');
  if(operation.action==='publish'){
   if(p.live)p.history=[{at:p.publishedAt,doc:structuredClone(p.live)},...p.history].slice(0,10);
   p.live=toDoc(p,merged);p.publishedAt=new Date().toISOString();p.publicEnabled=true;
  }else p.publicEnabled=false;
 }
 return workspaceSchema.parse(merged);
}

