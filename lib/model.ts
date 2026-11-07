import { z } from 'zod';

export const COLORS = ['#06b6d4','#7c5ce7','#de8c45','#437a69','#263c66'];
export const uid = () => crypto.randomUUID();
const id = z.string().min(1).max(80);
const short = z.string().max(180);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// Raster-only embedded images keep the local demo portable and avoid external image tracking.
export const imageSchema = z.string().max(100000).refine(v=>!v||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v),'Upload a supported image; image links and SVG are not accepted.');
const imagePosition = z.number().min(0).max(100).optional();
const link = z.string().max(1000).refine(v => !v || /^https:\/\//i.test(v), 'Use a full HTTPS website address.');
const itemSchema = z.object({id, title: short, text: z.string().max(2000), label: short, url: link});
export const blockSchema = z.object({
  id, type: z.enum(['header','contact','about','social','services','gallery','button','location','custom','divider']),
  title: short, text: z.string().max(4000), label: short, url: link,
  background: color, color, radius: z.number().int().min(0).max(32), padding: z.number().int().min(8).max(40),
  columns: z.number().int().min(1).max(2), items: z.array(itemSchema).max(12),
});
export type Block = z.infer<typeof blockSchema>;
const companySchema = z.object({id,name:short,industry:short,color,logo:imageSchema.optional(),coverImage:imageSchema.optional(),coverPosition:imagePosition});
const groupSchema = z.object({id,companyId:id,name:short,color,lockBrand:z.boolean()});
export const cardDocSchema = z.object({name:short,role:short,email:z.string().max(254).refine(v=>!v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),'Enter a valid email.'),phone:z.string().max(40).refine(v=>!v||/^\+?[\d\s()-]{5,40}$/.test(v),'Enter a valid phone number.'),website:link,companyName:short,fontFamily:z.enum(['system','arial']).optional(),textSize:z.number().int().min(16).max(20).optional(),accent:color,template:z.enum(['professional','visual','minimal']),blocks:z.array(blockSchema).max(40),companyLogo:imageSchema.optional(),photo:imageSchema.optional(),coverImage:imageSchema.optional(),backgroundImage:imageSchema.optional(),photoPosition:imagePosition,coverPosition:imagePosition});
export type CardDoc = z.infer<typeof cardDocSchema>;
export const profileSchema = z.object({id,companyId:id,groupId:z.string().max(80),name:short.min(1),fontFamily:cardDocSchema.shape.fontFamily,textSize:cardDocSchema.shape.textSize,role:short,email:cardDocSchema.shape.email,phone:cardDocSchema.shape.phone,website:link,accent:color,template:cardDocSchema.shape.template,blocks:z.array(blockSchema).max(40),archived:z.boolean(),publicEnabled:z.boolean().optional(),updatedAt:short,publishedAt:short,live:cardDocSchema.nullable(),history:z.array(z.object({at:short,doc:cardDocSchema})).max(10),photo:imageSchema.optional(),coverImage:imageSchema.optional(),backgroundImage:imageSchema.optional(),photoPosition:imagePosition,coverPosition:imagePosition});
export type Profile = z.infer<typeof profileSchema>;
export const workspaceSchema = z.object({
  schemaVersion:z.literal(1),companies:z.array(companySchema).max(30),groups:z.array(groupSchema).max(100),
  profiles:z.array(profileSchema).max(100),sections:z.array(z.object({id,name:short,block:blockSchema})).max(50),
  cards:z.array(z.object({id,token:z.string().min(20).max(80),profileId:z.string().max(80),status:z.enum(['unassigned','assigned','disabled']),qa:z.boolean(),createdAt:short})).max(200),
  activity:z.array(z.object({id,action:short,at:short})).max(60),
}).superRefine((s,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  for(const list of [s.companies,s.groups,s.profiles,s.sections,s.cards]) if(new Set(list.map(x=>x.id)).size!==list.length) fail('Duplicate record IDs.');
  for(const g of s.groups) if(!s.companies.some(c=>c.id===g.companyId)) fail('Group company does not exist.');
  for(const p of s.profiles){
    if(!s.companies.some(c=>c.id===p.companyId)) fail('Profile company does not exist.');
    if(p.groupId&&!s.groups.some(g=>g.id===p.groupId&&g.companyId===p.companyId)) fail('Profile and group must belong to the same company.');
    if(new Set(p.blocks.map(b=>b.id)).size!==p.blocks.length) fail('Duplicate block IDs.');
  }
  if(new Set(s.cards.map(c=>c.token)).size!==s.cards.length) fail('Duplicate NFC tokens.');
  for(const c of s.cards) if(c.profileId&&!s.profiles.some(p=>p.id===c.profileId)) fail('NFC profile does not exist.');
});
export type State = z.infer<typeof workspaceSchema>;
export type Company = State['companies'][number];
export type Group = State['groups'][number];
export const blockNames: Record<Block['type'],string> = {header:'Profile header',contact:'Contact actions',about:'About',social:'Social links',services:'Services',gallery:'Image / cover',button:'Action button',location:'Location',custom:'Custom section',divider:'Divider'};
export function newBlock(type:Block['type']):Block {
  return {id:uid(),type,title:type==='custom'?'Your custom section':type==='about'?'A little about me':type==='services'?'How I can help':blockNames[type],text:type==='about'?'Tell your story. Share what you do and what makes working with you different.':type==='custom'?'Make this space your own.':'',label:'Learn more',url:'',background:type==='custom'?'#e8f7fa':'#ffffff',color:'#152c3b',radius:16,padding:20,columns:1,items:[]};
}
export function defaultBlocks():Block[]{return ['header','contact','about','button'].map(t=>newBlock(t as Block['type']));}
export function toDoc(p:Profile,s:State):CardDoc{
  const company=s.companies.find(c=>c.id===p.companyId); const g=s.groups.find(g=>g.id===p.groupId);
  return {fontFamily:p.fontFamily,textSize:p.textSize,name:p.name,role:p.role,email:p.email,phone:p.phone,website:p.website,companyName:company?.name||'',accent:g?.lockBrand?g.color:p.accent,template:p.template,blocks:structuredClone(p.blocks),companyLogo:company?.logo||'',photo:p.photo||'',coverImage:p.coverImage||company?.coverImage||'',backgroundImage:p.backgroundImage||'',photoPosition:p.photoPosition??50,coverPosition:p.coverImage?(p.coverPosition??50):(company?.coverPosition??50)};
}
export function newProfile(companyId:string):Profile{return {id:uid(),companyId,groupId:'',name:'',role:'',email:'',phone:'',website:'',accent:'#06b6d4',template:'professional',blocks:defaultBlocks(),archived:false,updatedAt:new Date().toISOString(),publishedAt:'',live:null,history:[]};}
export function seedState():State{
  const company={id:'demo-company',name:'Coastline Property Co.',industry:'Property · fictional demo',color:'#06b6d4'};
  const group={id:'demo-group',companyId:company.id,name:'Cape Town team',color:'#06b6d4',lockBrand:true};
  const people=[['Mia Jacobs','Property Consultant','#06b6d4'],['Daniel Smith','Sales Partner','#7c5ce7'],['Zara Williams','Property Specialist','#de8c45'],['Noah Petersen','Branch Manager','#437a69']];
  const profiles=people.map(([name,role,accent],i)=>{const p=newProfile(company.id);p.id=`demo-profile-${i+1}`;p.groupId=group.id;p.name=name;p.role=role;p.accent=accent;p.email=`${name.split(' ')[0].toLowerCase()}@example.com`;p.blocks.find(b=>b.type==='about')!.text='Helping people find their place along the Cape coast. Personal guidance, local knowledge and a considered approach to your next move.';return p;});
  return {schemaVersion:1,companies:[company],groups:[group],profiles,sections:[],cards:[],activity:[]};
}
export function price(kind:'individual'|'team',count:number=1,annual=false){const n=Math.max(0,Math.floor(count));return kind==='individual'?{setup:499,maintenance:annual?400:35,period:annual?'year':'month'}:{setup:999+300*n,maintenance:25*n,period:'month'};}
export function vcard(doc:CardDoc){
 const esc=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 const encoder=new TextEncoder();
 const fold=(line:string)=>{let result='',bytes=0;for(const char of line){const size=encoder.encode(char).length;if(bytes+size>75){result+='\r\n ';bytes=1;}result+=char;bytes+=size;}return result;};
 // The editor has one full-name field. Preserve it without guessing family/given names.
 const lines=['BEGIN:VCARD','VERSION:3.0', 'N:;'+esc(doc.name)+';;;', 'FN:'+esc(doc.name),'ORG:'+esc(doc.companyName),'TITLE:'+esc(doc.role),'EMAIL:'+esc(doc.email),'TEL:'+esc(doc.phone),...(doc.website?['URL:'+esc(doc.website)]:[]),'END:VCARD'];
 return lines.map(fold).join('\r\n')+'\r\n';
}


