import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
const DB={prepare(sql){return{bind(...args){return{sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,ADMIN_EMAIL:'owner@example.com'},origin='https://studio.example';
const owner={'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.com'},stranger={'oai-authenticated-user-id':'other-user','oai-authenticated-user-email':'other@example.com'};
async function call(path,{identity=owner,method='GET',body,headers={},config=env}={}){
 return worker.fetch(new Request(origin+path,{method,headers:{...identity,...(['PUT','POST'].includes(method)?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),config);
}
assert.equal((await call('/api/personal',{identity:{}})).status,401);
assert.equal((await call('/personal',{identity:{}})).headers.get('location'),'/signin-with-chatgpt?return_to=%2Fpersonal');
assert.equal((await call('/api/personal',{identity:stranger})).status,403);
assert.equal((await call('/personal',{identity:stranger})).status,403);
assert.equal((await call('/personal')).status,200);
let personal=await(await call('/api/personal')).json();assert.equal(personal.version,0);assert.equal(personal.id,null);
assert.equal(db.prepare('SELECT count(*) n FROM card_personal_profiles').get().n,0);
assert.equal((await call('/api/personal',{identity:{...owner,'oai-authenticated-user-id':'different-user-id'}})).status,403);
personal.doc.name='Personal owner';personal.doc.email='person@example.com';
const put=async(body,extra={})=>call('/api/personal',{method:'PUT',body,...extra});
assert.equal((await put({version:0,doc:personal.doc,action:'save',ownerId:'other-user'})).status,400);
assert.equal((await put({version:0,doc:personal.doc,action:'save'},{headers:{Origin:'https://attacker.example'}})).status,403);
let response=await put({version:0,doc:personal.doc,action:'save'});assert.equal(response.status,200);personal=await response.json();
assert.equal((await call('/api/profile/'+personal.id,{identity:{}})).status,404);
assert.equal((await call('/api/personal?ownerId=owner-id',{identity:stranger})).status,403);
assert.equal((await put({version:0,doc:{...personal.doc,name:'stale'},action:'publish'})).status,409);
let bad=structuredClone(personal.doc);bad.photo='data:image/png;base64,YQ==';
assert.equal((await put({version:personal.version,doc:bad,action:'save'})).status,400);
bad=structuredClone(personal.doc);bad.blocks[1].id=bad.blocks[0].id;
assert.equal((await put({version:personal.version,doc:bad,action:'save'})).status,400);
bad={...personal.doc,companyName:'Injected company'};
assert.equal((await put({version:personal.version,doc:bad,action:'save'})).status,400);
response=await put({version:personal.version,doc:personal.doc,action:'publish'});assert.equal(response.status,200);personal=await response.json();
const id=personal.id;assert.equal(personal.published,true);
const otherDoc={...personal.doc,name:'Other account private draft'};
db.prepare('INSERT INTO card_personal_profiles(owner_id,id,draft,live,version,updated_at,published_at,save_token) VALUES (?,?,?,NULL,1,?,NULL,?)').run('other-user','other-private-profile',JSON.stringify(otherDoc),new Date().toISOString(),'other-token');
assert.equal((await(await call('/api/personal?ownerId=other-user')).json()).id,personal.id);
assert.equal((await call('/api/profile/other-private-profile',{identity:{}})).status,404);
db.prepare('DELETE FROM card_personal_profiles WHERE owner_id=?').run('other-user');

assert.equal((await(await call('/api/profile/'+id,{identity:{}})).json()).doc.name,'Personal owner');
personal.doc.name='Private changed draft';response=await put({version:personal.version,doc:personal.doc,action:'save'});personal=await response.json();
assert.equal((await(await call('/api/profile/'+id,{identity:{}})).json()).doc.name,'Personal owner');
assert.equal((await(await call('/api/personal')).json()).doc.name,'Private changed draft');
const broken={...env,DB:{...DB,async batch(statements){return DB.batch([...statements,{sql:'INSERT INTO missing_table VALUES (1)',args:[]}]);}}};
assert.equal((await put({version:personal.version,doc:personal.doc,action:'unpublish'},{config:broken})).status,503);
assert.equal((await call('/api/profile/'+id,{identity:{}})).status,200);
assert.equal((await(await call('/api/personal')).json()).version,personal.version);
response=await put({version:personal.version,doc:personal.doc,action:'unpublish'});personal=await response.json();assert.equal(personal.published,false);assert.equal(personal.id,id);
assert.equal((await call('/api/profile/'+id,{identity:{}})).status,404);
assert.equal(db.prepare('SELECT count(*) n FROM card_personal_profiles').get().n,1);
// Body-size protection applies when Content-Length is missing.
response=await call('/api/personal',{method:'PUT',body:{version:personal.version,action:'save',doc:{...personal.doc,name:'x'.repeat(300000)}}});
assert.equal(response.status,413);
// Legacy backfill is explicit, repeatable and does not mutate the workspace or public views.
let studio=await(await call('/api/workspace')).json();
studio.state.profiles[0].name='Search Person';
response=await call('/api/workspace',{method:'PUT',body:studio});assert.equal(response.status,200);studio.version=(await response.json()).version;
assert.equal(db.prepare('SELECT count(*) n FROM card_profile_records').get().n,4);
assert.equal(db.prepare('SELECT version FROM card_projection_versions WHERE owner_id=?').get('owner-id').version,studio.version);
const before=db.prepare('SELECT * FROM card_workspaces').get();
response=await call('/api/data/sync',{method:'POST'});assert.equal(response.status,200);
assert.deepEqual(db.prepare('SELECT * FROM card_workspaces').get(),before);
assert.equal((await call('/api/data/sync',{method:'POST',identity:stranger})).status,403);
assert.equal((await call('/api/data/sync',{method:'POST',headers:{Origin:'https://bad.example'}})).status,403);
assert.equal((await call('/api/company/profiles?companyId=demo-company',{identity:{}})).status,401);
assert.equal((await call('/api/company/profiles?companyId=demo-company',{identity:stranger})).status,403);
let page=await(await call('/api/company/profiles?companyId=demo-company&limit=1&q=Search')).json();
assert.equal(page.total,1);assert.equal(page.items.length,1);assert.equal(page.items[0].name,'Search Person');assert.equal('payload' in page.items[0],false);
assert.equal((await call('/api/company/profiles?companyId=demo-company&limit=10000')).status,400);
assert.equal((await call('/api/company/profiles?companyId=demo-company&offset=-1')).status,400);
assert.equal((await(await call('/api/company/profiles?companyId=demo-company&q=%25')).json()).total,0);
studio.state.profiles[0].name='Rejected concurrent name';
assert.equal((await call('/api/workspace',{method:'PUT',body:{...studio,version:0}})).status,409);
assert.equal(db.prepare('SELECT name FROM card_profile_records WHERE id=?').get(studio.state.profiles[0].id).name,'Search Person');
// Manager scoping also applies to paginated reads and backfill operations.
db.prepare("INSERT INTO card_manager_access(id,owner_id,email,user_id,enabled,company_ids,permissions,revision,updated_at) VALUES ('manager','owner-id','manager@example.com','manager-id',1,?,?,1,?)").run(JSON.stringify(['demo-company']),JSON.stringify({manageTeams:true,editBranding:false,publish:true}),new Date().toISOString());
const manager={'oai-authenticated-user-id':'manager-id','oai-authenticated-user-email':'manager@example.com'};
assert.equal((await call('/api/company/profiles?companyId=demo-company',{identity:manager})).status,200);
assert.equal((await call('/api/company/profiles?companyId=hidden-company',{identity:manager})).status,404);
assert.equal((await call('/api/data/sync',{method:'POST',identity:manager})).status,403);
assert.equal((await call('/api/personal',{identity:manager})).status,403);
// A synthetic 10,000-record company checks bounded pagination, not concurrent production capacity.
db.prepare('INSERT INTO card_company_records(owner_id,id,payload) VALUES (?,?,?)').run('owner-id','large-company','{}');
const insert=db.prepare('INSERT INTO card_profile_records(owner_id,id,company_id,name,role,email,archived,payload) VALUES (?,?,?,?,?,?,0,?)');
db.exec('BEGIN');for(let i=0;i<10000;i++)insert.run('owner-id','large-'+String(i).padStart(5,'0'),'large-company','Employee '+i,'Role','employee'+i+'@example.com','{}');db.exec('COMMIT');
page=await(await call('/api/company/profiles?companyId=large-company&limit=50&offset=9950')).json();
assert.equal(page.total,10000);assert.equal(page.items.length,50);assert.equal(page.items[49].id,'large-09999');
// Per-account saves are bounded, while reads remain available.
db.prepare('UPDATE card_personal_limits SET requests=30,window=? WHERE owner_id=?').run(Math.floor(Date.now()/60000),'owner-id');
assert.equal((await put({version:personal.version,doc:personal.doc,action:'save'})).status,429);
assert.equal((await call('/api/personal')).status,200);
console.log('Passed: closed pilot, private drafts, stable profile IDs, published snapshot isolation, forbidden uploads, origin checks, stale-save and transaction rollback, owner-only repeatable sync, normalized save projection, manager isolation, literal search, 10,000-record pagination and save rate limits.');

