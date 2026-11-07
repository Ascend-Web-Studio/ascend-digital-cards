import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');
for(const f of ['0000_workspace.sql','0001_public_views.sql','0002_team_access.sql','0003_customer_foundation.sql','0004_personal_access.sql','0005_workspace_images.sql','0006_company_memberships.sql','0007_deleted_profiles.sql'])db.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return{bind(...args){return{sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,ADMIN_EMAIL:'owner@example.com'},origin='https://studio.example';
const owner={'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.com'};
const manager={'oai-authenticated-user-id':'manager-id','oai-authenticated-user-email':'dev@example.com'};
const outsider={'oai-authenticated-user-id':'outsider-id','oai-authenticated-user-email':'unknown@example.com'};
async function call(path,{identity=owner,method='GET',body,headers={},config=env}={}){
 return worker.fetch(new Request(origin+path,{method,headers:{...identity,...(method==='PUT'?{'Origin':origin,'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),config);
}
const get=async identity=>{const r=await call('/api/workspace',{identity});assert.equal(r.status,200);return r.json();};
const put=async(snapshot,identity=owner,config=env)=>call('/api/workspace',{identity,method:'PUT',body:{state:snapshot.state,version:snapshot.version},config});
assert.equal((await call('/login',{identity:{}})).status,200);
assert.match(await(await call('/login',{identity:{}})).text(),/Sign in with ChatGPT/);
assert.equal((await call('/',{identity:{}})).headers.get('location'),'/login');
assert.equal((await call('/api/workspace',{identity:manager})).status,403);
assert.equal((await call('/api/access/manager',{identity:{}})).status,401);
assert.equal((await call('/api/access/manager',{identity:outsider})).status,403);
let snapshot=await get(owner);
const hiddenCompany={id:'private-company',name:'Private Client',industry:'Private',color:'#223344'};
snapshot.state.companies.push(hiddenCompany);
snapshot.state.groups.push({id:'private-group',companyId:hiddenCompany.id,name:'Private Team',color:'#223344',lockBrand:true});
const privateProfile=structuredClone(snapshot.state.profiles[0]);Object.assign(privateProfile,{id:'private-person',companyId:hiddenCompany.id,groupId:'private-group',name:'Hidden Employee',email:'hidden@example.com'});
privateProfile.blocks=privateProfile.blocks.map(b=>({...b,id:'private-'+b.id}));snapshot.state.profiles.push(privateProfile);
snapshot.state.sections.push({id:'private-library',name:'Owner-only library',block:structuredClone(privateProfile.blocks[0])});
snapshot.state.activity.push({id:'private-event',action:'Private Client draft prepared',at:new Date().toISOString()});
assert.equal((await put(snapshot)).status,200);
let config={email:'dev@example.com',enabled:true,companyIds:['demo-company'],permissions:{manageTeams:true,editBranding:true,publish:true},revision:0};
async function grant(overrides={}){
 const latest=await(await call('/api/access/manager')).json();
 config={...config,revision:latest.manager?.revision??0,...overrides};
 const r=await call('/api/access/manager',{method:'PUT',body:config});assert.equal(r.status,200,await r.clone().text());config=(await r.json()).manager;delete config.hasSignedIn;delete config.updatedAt;
}
assert.equal((await call('/api/access/manager',{method:'PUT',body:{...config,email:'owner@example.com'}})).status,400);
assert.equal((await call('/api/access/manager',{method:'PUT',body:{...config,companyIds:[]}})).status,400);
assert.equal((await call('/api/access/manager',{method:'PUT',body:{...config,companyIds:['missing']}})).status,400);
assert.equal((await call('/api/access/manager',{method:'PUT',body:config,headers:{Origin:'https://evil.example'}})).status,403);
await grant();
assert.equal((await call('/api/access/manager',{identity:manager})).status,403);
assert.equal((await call('/api/access/manager',{identity:manager,method:'PUT',body:config})).status,403);
let scoped=await get(manager);
assert.equal(scoped.access.role,'manager');assert.deepEqual(scoped.state.companies.map(c=>c.id),['demo-company']);
assert(!JSON.stringify(scoped).includes('Hidden Employee'));assert(!JSON.stringify(scoped).includes('Private Client'));
assert.equal(scoped.state.cards.length,0);assert.equal(scoped.state.sections.length,0);assert.equal(scoped.state.activity.length,0);
const forgedIdentity={...manager,'oai-authenticated-user-id':'different-account'};
assert.equal((await call('/api/workspace',{identity:forgedIdentity})).status,403);
scoped.state.profiles[0].name='Manager Updated';scoped.state.activity=[{id:'forged',action:'Owner approved all access',at:new Date().toISOString()}];
assert.equal((await put(scoped,manager)).status,200);
snapshot=await get(owner);
assert.equal(snapshot.state.profiles.find(p=>p.id==='private-person').name,'Hidden Employee');
assert.equal(snapshot.state.profiles[0].name,'Manager Updated');
assert(!snapshot.state.activity.some(a=>a.id==='forged'));
assert(snapshot.state.activity[0].action.includes('dev@example.com'));
assert(snapshot.state.sections.some(s=>s.id==='private-library'));

// Direct API attempts cannot escape the assigned scope or alter protected data.
for(const tamper of [
 s=>{s.companies.push(hiddenCompany);},
 s=>{s.profiles=s.profiles.slice(1);},
 s=>{s.groups=[];s.profiles.forEach(p=>p.groupId='');},
 s=>{s.profiles[0].id='private-person';},
 s=>{s.sections.push({id:'attack',name:'Library',block:structuredClone(s.profiles[0].blocks[0])});},
 s=>{s.cards.push({id:'attack-card',token:'12345678901234567890123',profileId:s.profiles[0].id,status:'assigned',qa:false,createdAt:new Date().toISOString()});}
]){
 const attempt=await get(manager);tamper(attempt.state);assert.equal((await put(attempt,manager)).status,403);
}
scoped=await get(manager);
const created=structuredClone(scoped.state.profiles[0]);Object.assign(created,{id:'manager-new',name:'New Team Member',email:'new@example.com',publicEnabled:false,live:null,history:[],publishedAt:'',archived:false});
created.blocks=created.blocks.map(b=>({...b,id:'new-'+b.id}));
scoped.state.groups.push({id:'manager-team',companyId:'demo-company',name:'Developer team',color:'#06b6d4',lockBrand:true});
created.groupId='manager-team';scoped.state.profiles.push(created);
assert.equal((await put(scoped,manager)).status,200);
scoped=await get(manager);
let publish=scoped.state.profiles.find(p=>p.id==='manager-new');
publish.live={name:publish.name,role:publish.role,email:publish.email,phone:publish.phone,website:publish.website,companyName:'Coastline Property Co.',accent:publish.accent,template:publish.template,blocks:structuredClone(publish.blocks)};
publish.publicEnabled=true;publish.publishedAt=new Date().toISOString();
assert.equal((await put(scoped,manager)).status,200);
assert.equal((await call('/p/manager-new',{identity:{}})).status,200);

// Permission changes are effective on the next request.
await grant({permissions:{manageTeams:true,editBranding:false,publish:false}});
scoped=await get(manager);scoped.state.profiles.find(p=>p.id==='manager-new').publicEnabled=false;
assert.equal((await put(scoped,manager)).status,403);
scoped=await get(manager);scoped.state.companies[0].color='#112233';assert.equal((await put(scoped,manager)).status,403);
scoped=await get(manager);scoped.state.groups[0].color='#112233';assert.equal((await put(scoped,manager)).status,403);
scoped=await get(manager);scoped.state.profiles[0].role='Edited draft only';assert.equal((await put(scoped,manager)).status,200);
assert.equal((await call('/p/manager-new',{identity:{}})).status,200);
await grant({permissions:{manageTeams:false,editBranding:false,publish:false}});
scoped=await get(manager);scoped.state.profiles[0].name='Forbidden edit';assert.equal((await put(scoped,manager)).status,403);

// An owner's intervening change prevents a stale manager overwrite.
await grant({permissions:{manageTeams:true,editBranding:true,publish:true}});
scoped=await get(manager);snapshot=await get(owner);snapshot.state.profiles.find(p=>p.id==='private-person').role='Owner changed hidden draft';
assert.equal((await put(snapshot)).status,200);assert.equal((await put(scoped,manager)).status,409);

// Revocation during a save must gate both the workspace and public-view transaction.
scoped=await get(manager);scoped.state.profiles.find(p=>p.id==='manager-new').publicEnabled=false;
const racingDB={...DB,async batch(statements){db.exec("UPDATE card_manager_access SET enabled=0,revision=revision+1 WHERE id='manager'");return DB.batch(statements);}};
assert.equal((await put(scoped,manager,{...env,DB:racingDB})).status,409);
assert.equal((await call('/p/manager-new',{identity:{}})).status,200);
assert.equal((await call('/api/workspace',{identity:manager})).status,403);
assert.equal((await call('/',{identity:manager})).status,403);
assert.equal((await call('/api/workspace',{identity:owner})).status,200);

// Replacing the manager account clears the old binding and excludes the old manager.
await grant({email:'newdev@example.com',enabled:true});
assert.equal((await call('/api/workspace',{identity:manager})).status,403);
const replacement={'oai-authenticated-user-id':'new-manager-id','oai-authenticated-user-email':'newdev@example.com'};
assert.equal((await call('/api/workspace',{identity:replacement})).status,200);
const currentConfig=await(await call('/api/access/manager')).json();assert.equal(currentConfig.manager.hasSignedIn,true);
assert.equal((await call('/api/access/manager',{method:'PUT',body:{...config,revision:0}})).status,409);

// Applying the new schema to an existing workspace preserves its owner and payload.
const legacy=new DatabaseSync(':memory:');
legacy.exec(readFileSync('drizzle/0000_workspace.sql','utf8'));legacy.exec(readFileSync('drizzle/0001_public_views.sql','utf8'));
legacy.prepare('INSERT INTO card_workspaces (owner_id,payload,version,updated_at) VALUES (?,?,?,?)').run('existing-owner','{"kept":true}',12,'2026-10-23');
legacy.exec(readFileSync('drizzle/0002_team_access.sql','utf8'));
assert.equal(legacy.prepare('SELECT owner_id FROM card_studio_owner').get().owner_id,'existing-owner');
assert.equal(legacy.prepare('SELECT version FROM card_workspaces').get().version,12);
assert.equal(legacy.prepare('SELECT payload FROM card_workspaces').get().payload,'{"kept":true}');
db.close();legacy.close();
console.log('Passed: separate sign-in, manager identity binding, company isolation, scoped team editing/publishing, server permission denials, protected access settings, optimistic concurrency, in-flight revocation and legacy migration preservation.');

