import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';

const db=new DatabaseSync(':memory:');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
let beforeBatch=null,failTransaction=false;
const DB={prepare(sql){return{bind(...args){return{sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){
 if(beforeBatch){const run=beforeBatch;beforeBatch=null;await run();}
 db.exec('BEGIN');try{const rows=statements.map((s,i)=>{const result={results:db.prepare(s.sql).all(...s.args)};if(failTransaction&&i===statements.length-1)throw Error('deliberate deletion rollback');return result;});db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}
}};
const env={DB,ADMIN_EMAIL:'owner@example.com'},origin='https://studio.example';
const identity=(id,email)=>({'oai-authenticated-user-id':id,'oai-authenticated-user-email':email});
const owner=identity('owner-id','owner@example.com'),employee=identity('employee-id','employee@example.com'),manager=identity('manager-id','manager@example.com'),stranger=identity('stranger-id','stranger@example.com');
async function call(path,{who=owner,method='GET',body,headers={}}={}){return worker.fetch(new Request(origin+path,{method,headers:{...who,...(['PUT','POST','DELETE'].includes(method)?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);}
async function ok(path,options){const r=await call(path,options);assert.equal(r.status,200,await r.clone().text());return r.json();}
let ws=await ok('/api/workspace');
const target=structuredClone(ws.state.profiles[0]);target.id='delete-me';target.name='Archived Pilot';target.archived=false;target.history=[];
target.photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const survivor=structuredClone(target);survivor.id='keep-me';survivor.name='Survivor';survivor.photo='';survivor.publicEnabled=false;survivor.live=null;
const separate=structuredClone(survivor);separate.id='other-client';separate.companyId='other-company';separate.groupId='';
ws.state.companies.push({id:'other-company',name:'Other Client',industry:'Test',color:'#123456'});
target.live={...target,companyName:'Test Company',companyLogo:target.photo};delete target.live.live;delete target.live.history;delete target.live.archived;delete target.live.publicEnabled;delete target.live.updatedAt;delete target.live.publishedAt;delete target.live.companyId;delete target.live.groupId;delete target.live.id;
target.history=[{at:new Date().toISOString(),doc:structuredClone(target.live)}];target.publicEnabled=true;
const token='deletion-token-01234567890123456789';
ws.state.profiles=[target,survivor,separate];ws.state.cards=[{id:'tag',token,profileId:target.id,status:'assigned',qa:true,createdAt:new Date().toISOString()}];
ws.version=(await ok('/api/workspace',{method:'PUT',body:ws})).version;
const companyId=target.companyId,path='/api/admin/profiles/'+target.id+'/deletion',accessPath='/api/company/access?companyId='+companyId;
await ok(accessPath,{method:'PUT',body:{email:'employee@example.com',companyId,role:'employee',profileId:target.id,groupIds:[],editableFields:['name'],permissions:{manageTeams:false,editBranding:false,publish:false},enabled:true,revision:0}});
await ok('/api/access/manager',{method:'PUT',body:{email:'manager@example.com',companyIds:[companyId],permissions:{manageTeams:true,editBranding:true,publish:true},enabled:true,revision:0}});
await ok('/api/access/personal',{method:'PUT',body:{email:'employee@example.com',enabled:true,revision:0}});
const personal=await ok('/api/personal',{who:employee});
assert.equal((await call(path)).status,409,'active profiles must be archived');
assert.equal((await call(path,{who:{}})).status,401);
for(const who of [employee,manager,stranger])for(const method of ['GET','DELETE'])assert.equal((await call(path,{who,method,body:method==='DELETE'?{}:undefined})).status,403);
target.archived=true;
// Keep the portrait shared with another retained profile; one private image should be cleaned.
survivor.photo=target.photo;
const unique='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+a4WQAAAAASUVORK5CYII=';
target.backgroundImage=unique;
ws.version=(await ok('/api/workspace',{method:'PUT',body:ws})).version;
const oldWorkspace=structuredClone(ws),oldCompany=await ok('/api/company/workspace?companyId='+companyId,{who:employee});
const preview=await ok(path),confirm={confirmationName:preview.profile.name,version:preview.version,accessFingerprint:preview.accessFingerprint};
assert.equal(preview.impact.employeeAccessRecords,1);assert.equal(preview.impact.nfcAssignments,1);assert.equal(preview.impact.unusedImages,1);assert.equal(preview.impact.savedRevisions,2);
assert.equal((await call(path,{method:'DELETE',body:confirm,headers:{Origin:'https://attacker.example'}})).status,403);
assert.equal((await call(path,{method:'DELETE',body:{...confirm,confirmationName:'Wrong'}})).status,400);
assert.equal((await call(path,{method:'DELETE',body:{...confirm,ownerId:'foreign'}})).status,400);
assert.equal((await call(path,{method:'DELETE',body:{...confirm,version:0}})).status,409);
const unchanged=()=>JSON.stringify(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t=>[t.name,db.prepare('SELECT * FROM '+t.name+' ORDER BY rowid').all()]));
let before=unchanged();failTransaction=true;assert.equal((await call(path,{method:'DELETE',body:confirm})).status,503);failTransaction=false;assert.equal(unchanged(),before,'failure rolls back every table');
// A concurrent grant edit must invalidate a previously reviewed preview, even inside the transaction.
beforeBatch=()=>db.prepare('UPDATE card_company_access SET revision=revision+1 WHERE profile_id=?').run(target.id);
assert.equal((await call(path,{method:'DELETE',body:confirm})).status,409);assert.equal(db.prepare('SELECT count(*) n FROM card_deleted_profiles').get().n,0);
const reviewed=await ok(path),current={...confirm,accessFingerprint:reviewed.accessFingerprint};
assert.equal((await call(path,{method:'DELETE',body:confirm})).status,409,'old membership preview is stale');
const result=await ok(path,{method:'DELETE',body:current});
assert.equal(result.version,ws.version+1);assert(!result.state.profiles.some(p=>p.id===target.id));
assert.deepEqual(result.state.profiles.find(p=>p.id===survivor.id),survivor);assert.deepEqual(result.state.profiles.find(p=>p.id===separate.id),separate);
assert.deepEqual(result.state.cards[0],{...ws.state.cards[0],profileId:'',status:'disabled',qa:false});
assert.equal(db.prepare('SELECT count(*) n FROM card_company_access WHERE profile_id=?').get(target.id).n,0);
assert.equal(db.prepare('SELECT count(*) n FROM card_profile_records WHERE id=?').get(target.id).n,0);
assert.equal(db.prepare('SELECT count(*) n FROM card_workspace_images').get().n,1,'shared image retained and private image removed');
assert.equal((await call('/api/company/workspace?companyId='+companyId,{who:employee})).status,403);
assert.equal((await call('/api/company/workspace?companyId='+companyId,{who:employee,method:'PUT',body:oldCompany})).status,403);
assert.equal((await ok('/api/personal',{who:employee})).id,personal.id,'personal account remains separate');
for(const url of ['/p/'+target.id,'/p/'+target.id+'/contact.vcf','/api/profile/'+target.id,'/n/'+token])assert.equal((await call(url,{who:{}})).status,404);
assert.equal((await call(path,{method:'DELETE',body:current})).status,404,'repeat delete is safe');
assert.equal((await call('/api/workspace',{method:'PUT',body:oldWorkspace})).status,409,'stale tab blocked');
oldWorkspace.version=result.version;
before=unchanged();assert.equal((await call('/api/workspace',{method:'PUT',body:oldWorkspace})).status,409,'old backup blocked even with fresh workspace version');assert.equal(unchanged(),before);
const payload=db.prepare('SELECT payload FROM card_workspaces WHERE owner_id=?').get('owner-id').payload;
assert(!payload.includes('Archived Pilot'));assert(!payload.includes('delete-me'));
assert.equal(db.prepare('SELECT count(*) n FROM card_deleted_profiles WHERE owner_id=? AND profile_id=?').get('owner-id',target.id).n,1);
// A grant request that validated an active profile before deletion must not re-add access afterward.
beforeBatch=async()=>{
 const current=await ok('/api/workspace');current.state.profiles.find(p=>p.id===survivor.id).archived=true;
 await ok('/api/workspace',{method:'PUT',body:current});
 const nextPath='/api/admin/profiles/'+survivor.id+'/deletion',review=await ok(nextPath);
 await ok(nextPath,{method:'DELETE',body:{version:review.version,confirmationName:review.profile.name,accessFingerprint:review.accessFingerprint}});
};
assert.equal((await call(accessPath,{method:'PUT',body:{email:'late@example.com',companyId,role:'employee',profileId:survivor.id,groupIds:[],editableFields:['name'],permissions:{manageTeams:false,editBranding:false,publish:false},enabled:true,revision:0}})).status,409);
assert.equal(db.prepare('SELECT count(*) n FROM card_company_access WHERE email=?').get('late@example.com').n,0);
console.log('Passed: owner-only archived-profile deletion, typed confirmation, strict origin/body checks, reviewed impact, membership race guards, atomic rollback, employee revocation, link removal, shared-image retention, client/personal isolation and stale-tab/backup protection.');
