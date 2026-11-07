import {workspaceSchema,seedState,vcard} from '../lib/model.ts';
import {html,js,css} from 'ascend:assets';
const privateHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
const json=(body,status=200)=>Response.json(body,{status,headers:privateHeaders});
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 // Hosted sign-in headers are supplied by Sites dispatch. The Site remains owner-private.
 const owner=request.headers.get('oai-authenticated-user-id');
 if(!owner)return json({error:'Sign in with the workspace owner account to continue.'},401);
 if(path==='/_assets/app.js')return new Response(js,{headers:{...privateHeaders,'Content-Type':'text/javascript; charset=utf-8'}});
 if(path==='/_assets/studio.css')return new Response(css,{headers:{...privateHeaders,'Content-Type':'text/css; charset=utf-8'}});
 if(path==='/favicon.svg')return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#143449"/><text x="7" y="30" fill="#1cc1d4" font-family="Arial" font-style="italic" font-weight="900" font-size="30">A</text></svg>',{headers:{'Content-Type':'image/svg+xml'}});
 try{
  const load=async()=>{const row=await env.DB.prepare('SELECT payload,version FROM card_workspaces WHERE owner_id=?').bind(owner).first();return {state:row?JSON.parse(row.payload):seedState(),version:row?.version??0};};
  if(path==='/api/workspace'&&request.method==='GET')return json(await load());
  if(path==='/api/workspace'&&request.method==='PUT'){
   if(request.headers.get('origin')!==url.origin)return json({error:'Unexpected request origin.'},403);
   if(Number(request.headers.get('content-length')||0)>1500000)return json({error:'Workspace size limit exceeded.'},413);
   const text=await request.text();if(new TextEncoder().encode(text).length>1500000)return json({error:'Workspace size limit exceeded.'},413);
   let body;try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON. Your existing work is unchanged.'},400);}
   if(!Number.isSafeInteger(body.version)||body.version<0)return json({error:'Invalid save version.'},400);
   const parsed=workspaceSchema.safeParse(body.state);if(!parsed.success)return json({error:parsed.error.issues.slice(0,3).map(i=>`${i.path.join('.')}: ${i.message}`).join(' ')},400);
   const result=await env.DB.prepare('INSERT INTO card_workspaces (owner_id,payload,version,updated_at) SELECT ?,?,1,? WHERE ?=0 OR EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=?) ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload,version=card_workspaces.version+1,updated_at=excluded.updated_at WHERE card_workspaces.version=? RETURNING version').bind(owner,JSON.stringify(parsed.data),new Date().toISOString(),body.version,owner,body.version).first();
   return result?json({version:result.version}):json({error:'This workspace changed in another tab. Export your draft before reloading.'},409);
  }
  if(path.startsWith('/api/')){
   if(request.method!=='GET')return json({error:'Method not allowed.'},405);
   const m=path.match(/^\/api\/profile\/([^/]+)$/);if(!m)return json({error:'Not found.'},404);
   const {state}=await load(),p=state.profiles.find(p=>p.id===m[1]&&!p.archived&&p.live);return p?json({doc:p.live}):json({error:'This profile is unavailable or has no published revision.'},404);
  }
  if(path.startsWith('/n/')){const {state}=await load(),card=state.cards.find(c=>c.token===path.slice(3)&&c.status==='assigned'),p=state.profiles.find(p=>p.id===card?.profileId&&!p.archived&&p.live);if(!p)return new Response('This card is unavailable. Return to your card studio to review the assignment.',{status:404,headers:privateHeaders});return new Response(null,{status:302,headers:{...privateHeaders,Location:'/p/'+p.id}});}
  const vcf=path.match(/^\/p\/([^/]+)\/contact\.vcf$/);if(vcf){const {state}=await load(),p=state.profiles.find(p=>p.id===vcf[1]&&!p.archived&&p.live);return p?new Response(vcard(p.live),{headers:{...privateHeaders,'Content-Type':'text/vcard; charset=utf-8','Content-Disposition':'attachment; filename="contact.vcf"'}}):new Response('Profile unavailable',{status:404,headers:privateHeaders});}
  if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Method not allowed.'},405);
  if(path!=='/'&&!/^\/p\/[^/]+$/.test(path))return new Response('Not found',{status:404,headers:privateHeaders});
  return new Response(request.method==='HEAD'?null:html,{headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://chatgpt.com"}});
 }catch(error){console.error('workspace_request_failed',error instanceof Error?error.message:'unknown');return json({error:'The workspace service is temporarily unavailable. Your unsaved work stays on screen.'},503);}
}};
