import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return{bind(...args){return{sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,ADMIN_EMAIL:'owner@example.com'},origin='https://studio.example';
const identity=(id,email)=>({'oai-authenticated-user-id':id,'oai-authenticated-user-email':email});
const owner=identity('studio-owner','owner@example.com'),co=identity('company-owner','company@example.com'),manager=identity('manager','manager@example.com'),employee=identity('employee','employee@example.com');
async function call(path,{who=owner,method='GET',body,config=env,headers={}}={}){return worker.fetch(new Request(origin+path,{method,headers:{...who,...(method==='PUT'?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),config);}
async function ok(path,options){const r=await call(path,options);assert.equal(r.status,200,await r.clone().text());return r.json();}
let studio=await ok('/api/workspace');const first=studio.state.companies[0],cid=first.id;
studio.state.companies.push({id:'private-company',name:'Other company',industry:'Private',color:'#123456'});
const base=structuredClone(studio.state.profiles[0]);
const mk=(id,companyId,groupId)=>({...structuredClone(base),id,companyId,groupId,name:id,live:null,history:[],publishedAt:'',publicEnabled:false,archived:false});
studio.state.groups.push({id:'assigned-team',companyId:cid,name:'Assigned',color:first.color,lockBrand:true},{id:'hidden-team',companyId:cid,name:'Hidden',color:first.color,lockBrand:true});
studio.state.profiles=[mk('assigned-profile',cid,'assigned-team'),mk('hidden-profile',cid,'hidden-team'),mk('private-profile','private-company','')];
studio.version=(await ok('/api/workspace',{method:'PUT',body:studio})).version;
const accessPath='/api/company/access?companyId='+cid,workspacePath='/api/company/workspace?companyId='+cid;
const full={manageTeams:true,editBranding:true,publish:true};
function grant(email,role='employee',more={}){return{companyId:cid,email,role,profileId:role==='employee'?'assigned-profile':null,groupIds:[],editableFields:role==='employee'?['name','phone','photo']:[],permissions:role==='owner'?full:{manageTeams:false,editBranding:false,publish:false},enabled:true,revision:0,...more};}
const ownerGrant=grant('company@example.com','owner');
await ok(accessPath,{method:'PUT',body:ownerGrant});
assert.equal((await call('/company',{who:{}})).status,302);
assert.equal((await call('/company',{who:identity('stranger','stranger@example.com')})).status,403);
assert.equal((await call('/company',{who:co})).status,200);
let view=await ok(workspacePath,{who:co});assert.equal(view.access.role,'owner');assert.equal(view.state.companies.length,1);assert(!JSON.stringify(view).includes('private-profile'));assert.equal(view.state.cards.length,0);assert.equal(view.state.activity.length,0);
assert.equal((await call('/api/workspace',{who:co})).status,403);
assert.equal((await call('/api/admin/personal-customers',{who:co})).status,403);
assert.equal((await call('/api/company/workspace?companyId=private-company',{who:co})).status,403);
const own=await ok(accessPath,{who:co});assert.equal(own.members.length,1);assert(!JSON.stringify(own).includes('user_id'));assert.equal(own.members[0].hasSignedIn,true);
assert.equal((await call(accessPath,{who:co,method:'PUT',body:{...ownerGrant,revision:1,enabled:false}})).status,403);
assert.equal((await call(accessPath,{who:co,method:'PUT',body:grant('employee@example.com','employee',{companyId:'private-company'})})).status,403);
await ok(accessPath,{who:co,method:'PUT',body:grant('employee@example.com')});
await ok(accessPath,{who:co,method:'PUT',body:grant('manager@example.com','manager',{groupIds:['assigned-team'],permissions:{manageTeams:true,editBranding:true,publish:false}})});
assert.equal((await call(accessPath,{method:'PUT',body:grant('duplicate@example.com')})).status,409);
assert.equal((await call(accessPath,{who:manager})).status,403);
assert.equal((await call(accessPath,{who:employee})).status,403);
assert.equal((await call(workspacePath,{who:identity('forged-user','company@example.com')})).status,403);
let mv=await ok(workspacePath,{who:manager});assert.deepEqual(mv.state.profiles.map(p=>p.id),['assigned-profile']);assert.deepEqual(mv.state.groups.map(g=>g.id),['assigned-team']);
let evil=structuredClone(mv);evil.state.profiles.push(mk('hidden-profile',cid,'assigned-team'));assert.equal((await call(workspacePath,{who:manager,method:'PUT',body:evil})).status,403);
evil=structuredClone(mv);evil.state.companies[0].name='Stolen branding';assert.equal((await call(workspacePath,{who:manager,method:'PUT',body:evil})).status,403);
evil=structuredClone(mv);evil.state.groups.push({id:'new-team',companyId:cid,name:'New',color:first.color,lockBrand:true});assert.equal((await call(workspacePath,{who:manager,method:'PUT',body:evil})).status,403);
evil=structuredClone(mv);evil.state.profiles[0].groupId='hidden-team';assert.equal((await call(workspacePath,{who:manager,method:'PUT',body:evil})).status,400);
assert.equal((await call(workspacePath,{who:manager,method:'PUT',body:{...mv,operation:{action:'publish',profileId:'assigned-profile'}}})).status,403);
mv.state.profiles[0].name='Manager changed';mv=await ok(workspacePath,{who:manager,method:'PUT',body:mv});
let ev=await ok(workspacePath,{who:employee});assert.deepEqual(ev.state.profiles.map(p=>p.id),['assigned-profile']);assert.deepEqual(ev.state.profiles[0].history,[]);
evil=structuredClone(ev);evil.state.profiles[0].accent='#112233';assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:evil})).status,403);
evil=structuredClone(ev);evil.state.profiles[0].email='forged@example.com';assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:evil})).status,403);
evil=structuredClone(ev);evil.state.profiles[0].blocks=[];assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:evil})).status,403);
evil=structuredClone(ev);evil.state.profiles[0].coverImage='data:image/png;base64,AAAA';assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:evil})).status,403);
ev.state.profiles[0].name='Employee changed';ev.state.profiles[0].phone='+27123456789';ev=await ok(workspacePath,{who:employee,method:'PUT',body:ev});
assert.equal((await call('/api/profile/assigned-profile',{who:{}})).status,404);
assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:{...ev,operation:{action:'publish',profileId:'assigned-profile'}}})).status,403);
await ok(accessPath,{who:co,method:'PUT',body:grant('employee@example.com','employee',{revision:1,permissions:{manageTeams:false,editBranding:false,publish:true}})});
ev=await ok(workspacePath,{who:employee});
// Forged public text is ignored: the server builds the public card from the allowed draft.
ev.state.profiles[0].live={name:'FORGED',role:'',email:'',phone:'',website:'',companyName:first.name,accent:first.color,template:'professional',blocks:ev.state.profiles[0].blocks};ev=await ok(workspacePath,{who:employee,method:'PUT',body:{...ev,operation:{action:'publish',profileId:'assigned-profile'}}});
let publicDoc=await ok('/api/profile/assigned-profile',{who:{}});assert.equal(publicDoc.doc.name,'Employee changed');
// History remains server-owned, while a normal employee draft save still succeeds after publication.
ev.state.profiles[0].name='Private next draft';ev=await ok(workspacePath,{who:employee,method:'PUT',body:ev});assert.equal((await ok('/api/profile/assigned-profile',{who:{}})).doc.name,'Employee changed');
// Canonical photo pixels become a fresh PNG; arbitrary bytes never enter storage.
ev=await ok(workspacePath,{who:employee,method:'PUT',body:{...ev,operation:{action:'save',profileId:'assigned-profile',pixels:Buffer.alloc(144*144*3,120).toString('base64')}}});assert(ev.state.profiles[0].photo.startsWith('data:image/png;base64,'));
assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:{...ev,operation:{action:'save',profileId:'assigned-profile',pixels:'AAAA'}}})).status,400);
// Deleting a locked optional field must be rejected too, not just replacing it.
await ok(accessPath,{method:'PUT',body:grant('employee@example.com','employee',{revision:2,editableFields:['name'],permissions:{manageTeams:false,editBranding:false,publish:true}})});
const missing=structuredClone(ev);delete missing.state.profiles[0].photo;assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:missing})).status,403);
const stale=structuredClone(ev);ev=await ok(workspacePath,{who:employee,method:'PUT',body:{...ev,operation:{action:'publish',profileId:'assigned-profile'}}});assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:stale})).status,409);assert.equal(ev.state.profiles[0].history.length,0);
let all=await ok('/api/workspace');assert.equal(all.state.profiles.find(p=>p.id==='assigned-profile').history.length,1);assert.equal(all.state.profiles.find(p=>p.id==='private-profile').name,'private-profile');assert.equal(all.state.profiles.find(p=>p.id==='hidden-profile').name,'hidden-profile');
// Revocation between read and write must cancel the entire workspace/media/public transaction.
const before=all.version,priorPublic=await ok('/api/profile/assigned-profile',{who:{}});
const race={...env,DB:{...DB,async batch(statements){db.prepare("UPDATE card_company_access SET enabled=0,revision=revision+1 WHERE email='employee@example.com'").run();return DB.batch(statements);}}};
ev.state.profiles[0].name='RACE LEAK';assert.equal((await call(workspacePath,{who:employee,method:'PUT',body:{...ev,operation:{action:'publish',profileId:'assigned-profile'}},config:race})).status,409);
assert.equal((await ok('/api/workspace')).version,before);assert.deepEqual(await ok('/api/profile/assigned-profile',{who:{}}),priorPublic);assert.equal((await call(workspacePath,{who:employee})).status,403);
// Disabled login keeps the company-owned card.
assert.equal((await call('/api/profile/assigned-profile',{who:{}})).status,200);
// A revoked owner also cannot commit member invitations already in flight.
const ownerRace={...env,DB:{...DB,async batch(statements){db.prepare("UPDATE card_company_access SET enabled=0,revision=revision+1 WHERE email='company@example.com'").run();return DB.batch(statements);}}};
assert.equal((await call(accessPath,{who:co,method:'PUT',body:grant('race@example.com','manager'),config:ownerRace})).status,409);assert.equal(db.prepare("SELECT count(*) n FROM card_company_access WHERE email='race@example.com'").get().n,0);
// Origin protection and the studio owner's recovery controls.
assert.equal((await call(accessPath,{method:'PUT',body:grant('more@example.com','manager'),headers:{Origin:'https://evil.example'}})).status,403);
await ok(accessPath,{method:'PUT',body:grant('company@example.com','owner',{revision:2})});
view=await ok(workspacePath,{who:co});view.state.profiles.find(p=>p.id==='assigned-profile').archived=true;view=await ok(workspacePath,{who:co,method:'PUT',body:view});assert.equal((await call('/api/profile/assigned-profile',{who:{}})).status,404);
const broken={...env,DB:{...DB,async batch(statements){return DB.batch([...statements,{sql:'INSERT INTO company_failed_transaction VALUES (1)',args:[]}]);}}};
view.state.companies[0].name='Rollback';const oldVersion=view.version;assert.equal((await call(workspacePath,{who:co,method:'PUT',body:view,config:broken})).status,503);assert.equal((await ok(workspacePath,{who:co})).version,oldVersion);
db.prepare("UPDATE card_personal_limits SET requests=60 WHERE owner_id='company:company-owner'").run();
assert.equal((await call(workspacePath,{who:co,method:'PUT',body:view})).status,429);
console.log('Passed: company isolation, roles, team scope, field locks, safe photos, server publications, history privacy, identity binding, member controls, optimistic versions, in-flight revocation, archive and transaction rollback.');
