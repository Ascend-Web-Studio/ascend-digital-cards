import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return{bind(...args){return{sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,ADMIN_EMAIL:'owner@example.com'},origin='https://studio.example';
const identity=(id,email)=>({'oai-authenticated-user-id':id,'oai-authenticated-user-email':email});
const owner=identity('owner-id','owner@example.com'),unknown=identity('unknown-id','unknown@example.com');
async function call(path,{who=owner,method='GET',body,headers={}}={}){
 return worker.fetch(new Request(origin+path,{method,headers:{...who,...(['PUT','POST'].includes(method)?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
}
const endpoint='/api/admin/personal-customers';
assert.equal((await call(endpoint,{who:{}})).status,401);
assert.equal((await call(endpoint,{who:unknown})).status,403);
assert.equal((await call(endpoint,{method:'PUT'})).status,405);
let result=await(await call(endpoint)).json();assert.deepEqual(result.customers,[]);assert.equal(result.ownCard.hasCard,false);
const users={};
for(const name of ['alice','bob','carol','dave','eve']){
 const email=name+'@example.com',who=identity(name+'-id',email);users[name]=who;
 const r=await call('/api/access/personal',{method:'PUT',body:{email,enabled:true,revision:0}});assert.equal(r.status,200);
}
const get=async who=>{const r=await call('/api/personal',{who});assert.equal(r.status,200);return r.json();};
const put=async(who,p,action='save')=>{const r=await call('/api/personal',{who,method:'PUT',body:{version:p.version,doc:p.doc,action}});assert.equal(r.status,200);return r.json();};
await get(users.bob); // Bound identity without a saved card.
let c=await get(users.carol);c.doc.name='SECRET_CAROL_NAME';c.doc.email='secret-contact@example.net';c.doc.phone='+27825550123';c=await put(users.carol,c);
let d=await get(users.dave);d.doc.name='Public Dave';d=await put(users.dave,d,'publish');
d.doc.name='SECRET_DAVE_DRAFT';d.doc.email='secret-dave@example.net';d=await put(users.dave,d);
let e=await get(users.eve);e.doc.name='SECRET_EVE_NAME';e=await put(users.eve,e,'publish');
let list=await(await call('/api/access/personal')).json();let grant=list.members.find(m=>m.email==='eve@example.com');
assert.equal((await call('/api/access/personal',{method:'PUT',body:{email:grant.email,enabled:false,revision:grant.revision}})).status,200);
let own=await get(owner);own.doc.name='SECRET_OWNER_NAME';own=await put(owner,own);
db.prepare("INSERT INTO card_personal_access(id,studio_owner_id,email,user_id,enabled,revision,updated_at,mutation_token) VALUES ('foreign-grant','other-studio','foreign@example.com',NULL,1,1,?,'foreign-token')").run(new Date().toISOString());
let response=await call(endpoint);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
let text=await response.text();result=JSON.parse(text);
assert.deepEqual(result.counts,{total:5,enabled:4,published:1,awaitingSignIn:1,privateCards:2});
assert.equal(result.customers.some(c=>c.email==='foreign@example.com'),false);
const find=name=>result.customers.find(c=>c.email===name+'@example.com');
assert.equal(find('alice').hasSignedIn,false);assert.equal(find('alice').publication,'not_started');
assert.equal(find('bob').hasSignedIn,true);assert.equal(find('bob').hasCard,false);
assert.equal(find('carol').publication,'private');assert.equal(find('carol').publicPath,null);
assert.equal(find('dave').publication,'published');assert.equal(find('dave').publishedName,'Public Dave');assert.equal(find('dave').publicPath,'/p/'+d.id);
assert.equal(find('eve').enabled,false);assert.equal(find('eve').publicPath,null);assert.equal(find('eve').publishedName,null);
assert.equal(result.ownCard.hasCard,true);assert.equal(result.ownCard.publication,'private');assert.equal(result.ownCard.publicPath,null);
for(const secret of ['SECRET_CAROL_NAME','SECRET_DAVE_DRAFT','SECRET_EVE_NAME','SECRET_OWNER_NAME','secret-contact@example.net','secret-dave@example.net','+27825550123',c.id,e.id,'carol-id','owner-id','mutation_token','save_token','"draft"','"live"','"blocks"'])assert.equal(text.includes(secret),false,secret+' must not leak');
for(const who of Object.values(users))assert.equal((await call(endpoint,{who})).status,403);
db.prepare("INSERT INTO card_manager_access(id,owner_id,email,user_id,enabled,company_ids,permissions,revision,updated_at) VALUES ('manager','owner-id','dev@example.com','dev-id',1,'[]',?,1,?)").run(JSON.stringify({manageTeams:true,editBranding:true,publish:true}),new Date().toISOString());
assert.equal((await call(endpoint,{who:identity('dev-id','dev@example.com')})).status,403);
// Owner's card appears separately and exposes only its published name.
own.doc.name='Owner public card';own=await put(owner,own,'publish');
result=await(await call(endpoint)).json();assert.equal(result.ownCard.publishedName,'Owner public card');assert.equal(result.ownCard.publicPath,'/p/'+own.id);assert.equal(result.counts.total,5);
// Existing access action immediately updates the overview and anonymous public availability.
grant=(await(await call('/api/access/personal')).json()).members.find(m=>m.email==='dave@example.com');
assert.equal((await call('/api/access/personal',{method:'PUT',body:{email:grant.email,enabled:false,revision:grant.revision}})).status,200);
result=await(await call(endpoint)).json();assert.equal(result.counts.published,0);assert.equal(result.counts.enabled,3);assert.equal(find('dave').publicPath,null);assert.equal(find('dave').publishedName,null);
assert.equal((await call('/api/profile/'+d.id,{who:{}})).status,404);
const before=db.prepare("SELECT draft FROM card_personal_profiles WHERE owner_id='dave-id'").get().draft;
assert(before.includes('SECRET_DAVE_DRAFT'));
grant=(await(await call('/api/access/personal')).json()).members.find(m=>m.email==='dave@example.com');
assert.equal((await call('/api/access/personal',{method:'PUT',body:{email:grant.email,enabled:true,revision:grant.revision}})).status,200);
result=await(await call(endpoint)).json();assert.equal(find('dave').publication,'private');assert.equal(result.counts.published,0);
assert.equal(db.prepare("SELECT draft FROM card_personal_profiles WHERE owner_id='dave-id'").get().draft,before);
console.log('Passed: owner-only personal customer metadata, invited/bound/private/published/disabled counts, public snapshot names only, no draft/contact/identity leaks, studio scoping, separate owner card and immediate revocation status.');

