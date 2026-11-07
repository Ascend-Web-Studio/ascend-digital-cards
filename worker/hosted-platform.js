import {companyApi,companyMemberships} from './company-portal.js';
import {profileDeletion} from './profile-deletion.js';
import {saveWorkspace} from './save-workspace.js';
import {packWorkspace,expandWorkspace,checkAssets,MediaError} from '../lib/workspace-media.ts';
import {readWorkspace,imageStatements,boundedText} from './workspace-media.js';
import {adminCustomers} from './admin-customers.js';
import {personalContext,personalAccessApi} from './personal-access.js';
import {personalApi} from './personal.js';
import {projectionStatements,companyProfiles} from './customer-foundation.js';
import {workspaceSchema,seedState,vcard} from '../lib/model.ts';
import {html,js,css} from 'ascend:assets';
import {faviconPng,touchIconPng,brandLogo} from '../lib/brand.ts';
import {managerConfigSchema,ownerPermissions,scopedWorkspace,mergeManagerWorkspace,PermissionError} from '../lib/access.ts';
const safeHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
const json=(body,status=200)=>Response.json(body,{status,headers:safeHeaders});
const unavailable=()=>json({error:'This card is unavailable or has not been published.'},404);
const pageHeaders={...safeHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://chatgpt.com"};
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 const userId=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
 // Identity headers must be supplied by Sites dispatch, never by an untrusted proxy.
 const isOwner=!!userId&&!!email&&!!env.ADMIN_EMAIL&&email.toLowerCase()===env.ADMIN_EMAIL.toLowerCase();
 const readOnly=method==='GET'||method==='HEAD';
 if(path==='/_assets/app.js'&&readOnly)return new Response(method==='HEAD'?null:js,{headers:{...safeHeaders,'Content-Type':'text/javascript; charset=utf-8'}});
 if(path==='/_assets/studio.css'&&readOnly)return new Response(method==='HEAD'?null:css,{headers:{...safeHeaders,'Content-Type':'text/css; charset=utf-8'}});
 if(['/favicon.png','/favicon.ico','/favicon.svg','/apple-touch-icon.png'].includes(path)&&readOnly){
  if(path==='/favicon.svg')return new Response(null,{status:302,headers:{...safeHeaders,Location:'/favicon.png?v=ascend-brand-1'}});
  const asset=path==='/apple-touch-icon.png'?touchIconPng:faviconPng;
  const bytes=Uint8Array.from(atob(asset.split(',')[1]),c=>c.charCodeAt(0));
  return new Response(method==='HEAD'?null:bytes,{headers:{...safeHeaders,'Content-Type':'image/png'}});
 }
 try{
  const publicView=async key=>{const row=await env.DB.prepare('SELECT payload FROM card_public_views WHERE view_key=?').bind(key).first();return row?JSON.parse(row.payload):null;};
  const apiProfile=path.match(/^\/api\/profile\/([^/]+)$/),cardPath=path.match(/^\/p\/([^/]+)(\/contact\.vcf)?$/),nfc=path.match(/^\/n\/([a-zA-Z0-9_-]+)$/);
  if(apiProfile||cardPath||nfc){
   if(!readOnly)return json({error:'Method not allowed.'},405);
   if(nfc){const assignment=await publicView('n/'+nfc[1]);if(!assignment)return unavailable();const doc=await publicView('p/'+assignment.profileId);if(!doc)return unavailable();return new Response(null,{status:302,headers:{...safeHeaders,Location:'/p/'+encodeURIComponent(assignment.profileId)}});}
   const profileId=(apiProfile||cardPath)[1],doc=await publicView('p/'+profileId);if(!doc)return unavailable();
   if(apiProfile)return json({doc});
   if(cardPath[2])return new Response(method==='HEAD'?null:vcard(doc),{headers:{...safeHeaders,'Content-Type':'text/vcard; charset=utf-8','Content-Disposition':'attachment; filename="contact.vcf"'}});
   return new Response(method==='HEAD'?null:html,{headers:pageHeaders});
  }

  if(path==='/login'&&readOnly)return new Response(method==='HEAD'?null:loginPage(brandLogo),{headers:pageHeaders});
  const context=await studioContext(env,userId,email,isOwner);
  const access=context?{role:context.role,email,companyIds:context.companyIds,permissions:context.permissions}:null;
  const deletionPath=path.match(/^\/api\/admin\/profiles\/([^/]+)\/deletion$/);
  if(deletionPath)return await profileDeletion(request,env,context,userId,deletionPath[1],json);
  if(['/api/company/session','/api/company/workspace','/api/company/access'].includes(path))return await companyApi(request,env,context,userId,email,json);
  if(path==='/company'&&readOnly){
   if(!userId)return new Response(null,{status:302,headers:{...safeHeaders,Location:'/signin-with-chatgpt?return_to=%2Fcompany'}});
   if(!(await companyMemberships(env,context,userId,email)).length)return new Response('Company access is invitation-only. Ask your company owner or Ascend to enable your sign-in email. Sign out at /signout-with-chatgpt?return_to=%2Fcompany',{status:403,headers:safeHeaders});
   return new Response(method==='HEAD'?null:html,{headers:pageHeaders});
  }
  if(path==='/api/admin/personal-customers')return await adminCustomers(request,env,context,userId,json);
  if(path==='/api/access/personal')return await personalAccessApi(request,env,context,userId,json);
  if(path==='/api/personal')return await personalApi(request,env,userId,await personalContext(env,context,userId,email),json);
  if(path==='/personal'&&readOnly){
   if(!userId)return new Response(null,{status:302,headers:{...safeHeaders,Location:'/signin-with-chatgpt?return_to=%2Fpersonal'}});
   if(!await personalContext(env,context,userId,email))return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal access | Ascend</title><body style="font-family:system-ui;padding:32px;max-width:600px;margin:auto"><h1>Personal access is invitation-only</h1><p>Ask Ascend to enable your ChatGPT sign-in email. If you have access under another account, sign out and try that account.</p><p><a href="/signout-with-chatgpt?return_to=%2Fpersonal" target="_top">Sign out</a></p><a href="/login">Back to sign-in</a></body></html>',{status:403,headers:pageHeaders});
   return new Response(method==='HEAD'?null:html,{headers:pageHeaders});
  }
  if(path==='/api/company/profiles'){
   if(!userId)return json({error:'Sign in to access company profiles.'},401);
   if(!readOnly)return json({error:'Method not allowed.'},405);
   return await companyProfiles(env,context,url,json);
  }
  if(path==='/api/data/sync'){
   if(!userId)return json({error:'Sign in.'},401);
   if(context?.role!=='owner')return json({error:'Only the owner can sync company data.'},403);
   if(method!=='POST')return json({error:'Method not allowed.'},405);
   if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
   const row=await env.DB.prepare('SELECT payload,version FROM card_workspaces WHERE owner_id=?').bind(context.ownerId).first();
   if(!row)return json({error:'Save the studio workspace first.'},409);
   const state=workspaceSchema.parse(await readWorkspace(env.DB,context.ownerId,row.payload));
   const guard='EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=? AND version=?)';
   const commands=projectionStatements(env.DB,context.ownerId,JSON.parse(row.payload),guard,[context.ownerId,row.version]);
   commands.push(env.DB.prepare('INSERT INTO card_projection_versions(owner_id,version) SELECT ?,? WHERE '+guard+' ON CONFLICT(owner_id) DO UPDATE SET version=excluded.version RETURNING version').bind(context.ownerId,row.version,context.ownerId,row.version));
   const result=await env.DB.batch(commands);
   return result.at(-1)?.results?.length?json({version:row.version,companies:state.companies.length,profiles:state.profiles.length}):json({error:'The workspace changed during sync. Try again.'},409);
  }
  if(path==='/api/session')return readOnly?json({authenticated:!!userId,isAdmin:context?.role==='owner',access}):json({error:'Method not allowed.'},405);
  if(path==='/api/access/manager'){
   if(!userId)return json({error:'Sign in to manage access.'},401);
   if(context?.role!=='owner')return json({error:'Only the owner can manage account access.'},403);
   if(method==='GET'){const row=await env.DB.prepare("SELECT * FROM card_manager_access WHERE id='manager' AND owner_id=?").bind(context.ownerId).first();return json({manager:row?managerView(row):null});}
   if(method!=='PUT')return json({error:'Method not allowed.'},405);
   if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
   const input=await request.text();if(new TextEncoder().encode(input).length>16000)return json({error:'Access settings are too large.'},413);
   let raw;try{raw=JSON.parse(input);}catch{return json({error:'Invalid access settings.'},400);}
   const checked=managerConfigSchema.safeParse(raw);if(!checked.success)return json({error:checked.error.issues.map(i=>i.message).join(' ')},400);
   const config=checked.data;
   if(config.email===env.ADMIN_EMAIL.toLowerCase())return json({error:'Use a separate account for the manager. Your owner access is preserved.'},400);
   const stored=await env.DB.prepare('SELECT payload FROM card_workspaces WHERE owner_id=?').bind(context.ownerId).first();
   if(!stored)return json({error:'Save your workspace before configuring a manager.'},409);
   const state=workspaceSchema.parse(await readWorkspace(env.DB,context.ownerId,stored.payload));
   if(config.companyIds.some(id=>!state.companies.some(c=>c.id===id)))return json({error:'Choose only existing companies.'},400);
   const saved=await env.DB.prepare("INSERT INTO card_manager_access (id,owner_id,email,user_id,enabled,company_ids,permissions,revision,updated_at) SELECT 'manager',?,?,NULL,?,?,?,1,? WHERE ?=0 OR EXISTS (SELECT 1 FROM card_manager_access WHERE id='manager') ON CONFLICT(id) DO UPDATE SET email=excluded.email,user_id=CASE WHEN card_manager_access.email=excluded.email THEN card_manager_access.user_id ELSE NULL END,enabled=excluded.enabled,company_ids=excluded.company_ids,permissions=excluded.permissions,revision=card_manager_access.revision+1,updated_at=excluded.updated_at WHERE card_manager_access.owner_id=? AND card_manager_access.revision=? RETURNING *").bind(context.ownerId,config.email,config.enabled?1:0,JSON.stringify(config.companyIds),JSON.stringify(config.permissions),new Date().toISOString(),config.revision,context.ownerId,config.revision).first();
   return saved?json({manager:managerView(saved)}):json({error:'Access settings changed in another tab. Reload before trying again.'},409);
  }
  if(path==='/api/workspace'){
   if(!userId)return json({error:'Sign in to access the dashboard.'},401);
   if(!env.ADMIN_EMAIL)return json({error:'Owner access has not been configured.'},503);
   if(!context)return json({error:'This account has not been granted studio access.'},403);
   const row=await env.DB.prepare('SELECT payload,version FROM card_workspaces WHERE owner_id=?').bind(context.ownerId).first();
   const previous=row?workspaceSchema.parse(await readWorkspace(env.DB,context.ownerId,row.payload)):seedState();
   if(method==='GET')return json({state:context.role==='owner'?previous:scopedWorkspace(previous,context.companyIds),version:row?.version??0,access});
   if(method!=='PUT')return json({error:'Method not allowed.'},405);
   if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
   if(Number(request.headers.get('content-length')||0)>8000000)return json({error:'Workspace size limit exceeded.'},413);
   const text=await boundedText(request,8000000);if(new TextEncoder().encode(text).length>8000000)return json({error:'Workspace size limit exceeded.'},413);
   let body;try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON. Your existing work is unchanged.'},400);}
   if(!body||!Number.isSafeInteger(body.version)||body.version<0)return json({error:'Invalid save version.'},400);
   if(body.version!==(row?.version??0))return json({error:'This workspace changed in another tab. Export your draft before reloading.'},409);
   const parsed=workspaceSchema.safeParse(body.assets?expandWorkspace(body.state,await checkAssets(body.assets)):body.state);if(!parsed.success)return json({error:parsed.error.issues.slice(0,3).map(i=>`${i.path.join('.')}: ${i.message}`).join(' ')},400);
   const state=context.role==='owner'?parsed.data:mergeManagerWorkspace(previous,parsed.data,access),saveToken=crypto.randomUUID(),now=new Date().toISOString();
   if(context.role==='manager')state.activity=[{id:crypto.randomUUID(),action:('Manager '+email+' saved assigned company changes').slice(0,180),at:now},...state.activity].slice(0,60);
   const guard=context.role==='manager'?"EXISTS (SELECT 1 FROM card_manager_access WHERE id='manager' AND enabled=1 AND revision=? AND user_id=? AND owner_id=?)":'1=1';
   const guardArgs=context.role==='manager'?[context.managerRevision,userId,context.ownerId]:[];
   const savedVersion=await saveWorkspace(env,{ownerId:context.ownerId,state,version:body.version,guard,guardArgs});
   return savedVersion?json({version:savedVersion}):json({error:'Your workspace version or access permissions changed. Reload before trying again.'},409);
  }
  if(path.startsWith('/api/'))return json({error:'Not found.'},404);
  if(path!=='/'||!readOnly)return new Response('Not found',{status:404,headers:safeHeaders});
  if(!userId)return new Response(null,{status:302,headers:{...safeHeaders,Location:'/login'}});
  if(!context&&await personalContext(env,context,userId,email))return new Response(null,{status:302,headers:{...safeHeaders,Location:'/personal'}});
  if(!context&&(await companyMemberships(env,context,userId,email)).length)return new Response(null,{status:302,headers:{...safeHeaders,Location:'/company'}});
  if(!context)return new Response('This account has not been granted studio access. Ask the owner to assign your email and companies. You can sign out at /signout-with-chatgpt?return_to=%2Flogin',{status:403,headers:safeHeaders});
  return new Response(method==='HEAD'?null:html,{headers:pageHeaders});
 }catch(error){if(error instanceof MediaError)return json({error:error.message},error.status);if(error instanceof PermissionError)return json({error:error.message},403);console.error('workspace_request_failed',error instanceof Error?error.message:'unknown');return json({error:'The service is temporarily unavailable. Your unsaved changes remain on screen.'},503);}
}};


function managerView(row){return {email:row.email,enabled:!!row.enabled,companyIds:JSON.parse(row.company_ids),permissions:JSON.parse(row.permissions),revision:row.revision,hasSignedIn:!!row.user_id,updatedAt:row.updated_at};}
async function studioContext(env,userId,email,isOwner){
 if(!userId||!email||!env.ADMIN_EMAIL)return null;
 let owner=await env.DB.prepare('SELECT owner_id FROM card_studio_owner WHERE singleton=1').bind().first();
 if(!owner&&isOwner)owner=await env.DB.prepare('INSERT INTO card_studio_owner (singleton,owner_id) VALUES (1,?) ON CONFLICT(singleton) DO NOTHING RETURNING owner_id').bind(userId).first()||await env.DB.prepare('SELECT owner_id FROM card_studio_owner WHERE singleton=1').bind().first();
 if(!owner)return null;
 if(isOwner)return owner.owner_id===userId?{ownerId:owner.owner_id,role:'owner',permissions:ownerPermissions,companyIds:[]}:null;
 let manager=await env.DB.prepare("SELECT * FROM card_manager_access WHERE id='manager' AND owner_id=? AND email=? AND enabled=1").bind(owner.owner_id,email.toLowerCase()).first();
 if(!manager||manager.user_id&&manager.user_id!==userId)return null;
 if(!manager.user_id)manager=await env.DB.prepare("UPDATE card_manager_access SET user_id=? WHERE id='manager' AND enabled=1 AND user_id IS NULL AND email=? AND revision=? RETURNING *").bind(userId,email.toLowerCase(),manager.revision).first();
 if(!manager)return null;
 return {ownerId:owner.owner_id,role:'manager',permissions:JSON.parse(manager.permissions),companyIds:JSON.parse(manager.company_ids),managerRevision:manager.revision};
}
function loginPage(logo){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in | Ascend Digital Cards</title><link rel="icon" type="image/png" href="/favicon.png?v=ascend-brand-1"><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:#edf5fa;color:#011e50;font-family:Arial,sans-serif}.login{width:min(480px,100%);background:white;padding:40px;border:1px solid #dce9f3;border-radius:24px;box-shadow:0 20px 70px #183f5812;text-align:center}.logo{width:180px;max-width:70%;height:auto}h1{font-size:27px;margin:28px 0 14px}p{font-size:14px;line-height:1.8;color:#557186}.roles{display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:left;margin:24px 0}.roles div{padding:16px;background:#f4f8fb;border-radius:12px}.roles strong{font-size:14px}.roles p{font-size:12px;margin-bottom:0}.sign-in{display:block;background:#011e50;color:white;text-decoration:none;border-radius:10px;padding:16px;font-weight:bold;font-size:14px}.note{font-size:12px;margin:20px 0 0}@media(max-width:420px){.login{padding:26px}.roles{grid-template-columns:1fr}}</style></head><body><main class="login"><img class="logo" src="${logo}" alt="Ascend Web Studios"><h1>Your studio. Your team.</h1><p>Sign in with your own account. Your access is set by the studio owner.</p><div class="roles"><div><strong>Owner</strong><p>Full studio control, company access and manager permissions.</p></div><div><strong>Manager</strong><p>Assigned companies and only the tools the owner enables.</p></div></div><a class="sign-in" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in with ChatGPT</a><p><a href="/company">Company member? Open your company dashboard</a></p><p><a href="/personal">Invited personal tester? Open your card editor</a></p><p class="note">Managers must use the email granted access by the owner. Public digital cards remain available without sign-in.</p></main></body></html>`;}
