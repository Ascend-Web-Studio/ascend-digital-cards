import {z} from 'zod';
import {workspaceSchema,type State,type Profile} from './model';

export const managerPermissionsSchema=z.object({manageTeams:z.boolean(),editBranding:z.boolean(),publish:z.boolean()}).strict();
export type ManagerPermissions=z.infer<typeof managerPermissionsSchema>;
export const managerConfigSchema=z.object({
 email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),
 enabled:z.boolean(),companyIds:z.array(z.string().min(1).max(80)).max(30).refine(v=>new Set(v).size===v.length,'Choose each company once.'),
 permissions:managerPermissionsSchema,revision:z.number().int().min(0)
}).strict().refine(v=>!v.enabled||v.companyIds.length>0,'Select at least one company before enabling manager access.');
export type ManagerConfig=z.infer<typeof managerConfigSchema>;
export type StudioAccess={role:'owner'|'manager';email:string;companyIds:string[];permissions:ManagerPermissions};
export const ownerPermissions:ManagerPermissions={manageTeams:true,editBranding:true,publish:true};
export class PermissionError extends Error{}

export function scopedWorkspace(state:State,companyIds:string[]):State{
 const allowed=new Set(companyIds);
 return {...state,companies:state.companies.filter(c=>allowed.has(c.id)),groups:state.groups.filter(g=>allowed.has(g.companyId)),profiles:state.profiles.filter(p=>allowed.has(p.companyId)),sections:[],cards:[],activity:[]};
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const publicFields=(p:Profile)=>({live:p.live,history:p.history,publishedAt:p.publishedAt,publicEnabled:p.publicEnabled??false,archived:p.archived});
const draftFields=(p:Profile)=>({fontFamily:p.fontFamily??'system',textSize:p.textSize??16,companyId:p.companyId,groupId:p.groupId,name:p.name,role:p.role,email:p.email,phone:p.phone,website:p.website,accent:p.accent,template:p.template,blocks:p.blocks,photo:p.photo??'',coverImage:p.coverImage??'',backgroundImage:p.backgroundImage??'',photoPosition:p.photoPosition??50,coverPosition:p.coverPosition??50});

export function mergeManagerWorkspace(current:State,incoming:State,access:StudioAccess):State{
 const fail=(message:string):never=>{throw new PermissionError(message);};
 if(access.role!=='manager')return workspaceSchema.parse(incoming);
 const allowed=new Set(access.companyIds),visible=scopedWorkspace(current,access.companyIds);
 if(incoming.sections.length||incoming.cards.length)fail('Reusable libraries and NFC assignments are managed by the owner.');
 if(incoming.companies.length!==visible.companies.length||incoming.companies.some(c=>!allowed.has(c.id)||!visible.companies.some(v=>v.id===c.id)))fail('You can only edit companies assigned to you. Company creation and removal require the owner.');
 for(const c of incoming.companies)if(!access.permissions.editBranding&&!same(c,current.companies.find(old=>old.id===c.id)))fail('Your account does not have permission to edit company branding.');
 for(const g of visible.groups)if(!incoming.groups.some(v=>v.id===g.id))fail('Group removal requires the owner.');
 for(const g of incoming.groups){
  if(!allowed.has(g.companyId))fail('This group is outside your assigned companies.');
  const old=current.groups.find(v=>v.id===g.id);
  if(old&&!allowed.has(old.companyId)||old&&old.companyId!==g.companyId)fail('Moving a group between companies requires the owner.');
  if(!old&&!access.permissions.manageTeams)fail('Your account does not have permission to create teams.');
  if(old&&!access.permissions.manageTeams&&(g.name!==old.name))fail('Your account does not have permission to edit teams.');
  const expected=old||{color:incoming.companies.find(c=>c.id===g.companyId)?.color,lockBrand:true};
  if(!access.permissions.editBranding&&(g.color!==expected.color||g.lockBrand!==expected.lockBrand))fail('Your account does not have permission to change shared team branding.');
 }
 for(const p of visible.profiles)if(!incoming.profiles.some(v=>v.id===p.id))fail('Profile removal requires the owner. Archive a profile only when you have publishing permission.');
 for(const p of incoming.profiles){
  if(!allowed.has(p.companyId))fail('This profile is outside your assigned companies.');
  const old=current.profiles.find(v=>v.id===p.id);
  if(old&&(!allowed.has(old.companyId)||old.companyId!==p.companyId))fail('Moving profiles between companies requires the owner.');
  if(!old){
   if(!access.permissions.manageTeams)fail('Your account does not have permission to create profiles.');
   if(!access.permissions.publish&&(p.live||p.publicEnabled||p.publishedAt||p.history.length||p.archived))fail('Your account does not have permission to publish new profiles.');
  }else{
   if(!access.permissions.manageTeams&&!same(draftFields(p),draftFields(old)))fail('Your account does not have permission to edit profile drafts.');
   if(!access.permissions.publish&&!same(publicFields(p),publicFields(old)))fail('Your account does not have permission to publish, unpublish, archive or restore public revisions.');
  }
 }
 const next:State={...current,
  companies:current.companies.map(c=>incoming.companies.find(v=>v.id===c.id)||c),
  groups:[...current.groups.map(g=>incoming.groups.find(v=>v.id===g.id)||g),...incoming.groups.filter(g=>!current.groups.some(old=>old.id===g.id))],
  profiles:[...current.profiles.map(p=>incoming.profiles.find(v=>v.id===p.id)||p),...incoming.profiles.filter(p=>!current.profiles.some(old=>old.id===p.id))],
  // A manager's submitted activity is untrusted; the server records their actual save.
  activity:current.activity
 };
 const checked=workspaceSchema.safeParse(next);
 if(!checked.success)throw new PermissionError('The update exceeds workspace limits or contains an invalid company/group relationship.');
 return checked.data;
}



