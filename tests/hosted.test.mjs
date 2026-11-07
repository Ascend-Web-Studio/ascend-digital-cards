import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');db.exec(readFileSync('drizzle/0000_workspace.sql','utf8'));db.exec(readFileSync('drizzle/0001_public_views.sql','utf8'));db.exec(readFileSync('drizzle/0002_team_access.sql','utf8'));db.exec(readFileSync('drizzle/0003_customer_foundation.sql','utf8'));db.exec(readFileSync('drizzle/0004_personal_access.sql','utf8'));db.exec(readFileSync('drizzle/0005_workspace_images.sql','utf8'));db.exec(readFileSync('drizzle/0006_company_memberships.sql','utf8'));db.exec(readFileSync('drizzle/0007_deleted_profiles.sql','utf8'));
const DB={prepare(sql){return {bind(...args){return {sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const results=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,ADMIN_EMAIL:'admin@example.com'},origin='https://studio.example';
const admin={'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'admin@example.com'};
async function call(path,{method='GET',body,headers={},identity=admin,config=env}={}){return worker.fetch(new Request(origin+path,{method,headers:{...identity,...(method==='PUT'?{'Origin':origin,'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),config);}
assert.equal((await call('/api/workspace',{identity:{}})).status,401);
assert.equal((await call('/api/workspace',{identity:{...admin,'oai-authenticated-user-email':'other@example.com'}})).status,403);
assert.equal((await call('/api/workspace',{config:{DB}})).status,503);
assert.equal((await call('/',{identity:{}})).status,302);
assert.equal((await call('/_assets/app.js',{identity:{}})).status,200);
let {state,version}=await(await call('/api/workspace')).json();assert.equal(version,0);
const p=state.profiles[0],token='01234567890123456789012345678901';
p.live={name:'Published Person',role:p.role,email:p.email,phone:p.phone,website:p.website,companyName:'Fictional test company',accent:p.accent,template:p.template,blocks:structuredClone(p.blocks)};p.publishedAt=new Date().toISOString();
state.cards.push({id:'qa-card',token,profileId:p.id,status:'assigned',qa:false,createdAt:new Date().toISOString()});
const save=async(v=version,s=state)=>{const r=await call('/api/workspace',{method:'PUT',body:{state:s,version:v}});if(r.ok)version=(await r.json()).version;return r;};
assert.equal((await save()).status,200);
assert.equal((await call('/api/profile/'+p.id,{identity:{}})).status,404); // legacy demo revisions are private
assert.equal((await call('/n/'+token,{identity:{}})).status,404);
p.publicEnabled=true;assert.equal((await save()).status,200);
const doc=await(await call('/api/profile/'+p.id,{identity:{}})).json();assert.equal(doc.doc.name,'Published Person');assert.equal('history' in doc.doc,false);assert.equal('activity' in doc.doc,false);
assert.equal((await call('/p/'+p.id,{identity:{}})).status,200);
let r=await call('/n/'+token,{identity:{}});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/p/'+p.id);
r=await call('/p/'+p.id+'/contact.vcf',{identity:{}});assert.equal(r.status,200);const downloaded=await r.text();assert(downloaded.includes('FN:Published Person\r\n'));assert(downloaded.includes('N:;Published Person;;;\r\n'));assert(downloaded.endsWith('END:VCARD\r\n'));
const stale=structuredClone(state);stale.profiles[0].publicEnabled=false;assert.equal((await save(0,stale)).status,409);assert.equal((await call('/api/profile/'+p.id,{identity:{}})).status,200); // stale save cannot delete public rows
const oldLiveName=p.live.name;p.name='Private draft name';assert.equal((await save()).status,200);assert.equal((await(await call('/api/profile/'+p.id,{identity:{}})).json()).doc.name,oldLiveName);
assert.equal((await call('/api/workspace',{method:'PUT',body:{state,version},identity:{}})).status,401);
assert.equal((await call('/api/workspace',{method:'PUT',body:{state,version},headers:{Origin:'https://attacker.example'}})).status,403);
const bad=structuredClone(state);bad.profiles[0].photo='data:image/svg+xml;base64,PHN2Zy8+';assert.equal((await save(version,bad)).status,400);
state.cards[0].status='disabled';assert.equal((await save()).status,200);assert.equal((await call('/n/'+token,{identity:{}})).status,404);assert.equal((await call('/api/profile/'+p.id,{identity:{}})).status,200);
state.cards[0].status='assigned';p.publicEnabled=false;assert.equal((await save()).status,200);assert.equal((await call('/api/profile/'+p.id,{identity:{}})).status,404);assert.equal((await call('/n/'+token,{identity:{}})).status,404);
p.publicEnabled=true;p.archived=true;assert.equal((await save()).status,200);assert.equal((await call('/p/'+p.id,{identity:{}})).status,404);
// A failing publication write rolls back both the workspace version and all public view changes.
const before=(await(await call('/api/workspace')).json()).version;const broken={...env,DB:{...DB,async batch(statements){const badStatement={sql:'INSERT INTO nonexistent_table VALUES (1)',args:[]};return DB.batch([...statements,badStatement]);}}};
assert.equal((await call('/api/workspace',{method:'PUT',body:{state,version},config:broken})).status,503);assert.equal((await(await call('/api/workspace')).json()).version,before);
assert.deepEqual(await(await call('/api/session',{identity:{}})).json(),{authenticated:false,isAdmin:false,access:null});
console.log('Hosted integration checks passed: owner authorization, anonymous published cards, private imports, snapshot isolation, vCards, NFC disable/unpublish, stale-save gating and transactional failure rollback.');

