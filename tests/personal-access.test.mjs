import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return{bind(...args){return{sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,ADMIN_EMAIL:'owner@example.com'},origin='https://studio.example';
const identity=(id,email)=>({'oai-authenticated-user-id':id,'oai-authenticated-user-email':email});
const owner=identity('studio-owner','owner@example.com'),a=identity('alice-id','alice@example.com'),b=identity('bob-id','bob@example.com'),outsider=identity('outsider','unknown@example.com');
async function call(path,{who=owner,method='GET',body,headers={},config=env}={}){
 return worker.fetch(new Request(origin+path,{method,headers:{...who,...(['PUT','POST'].includes(method)?{Origin:origin,'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),config);
}
const get=async who=>{const r=await call('/api/personal',{who});assert.equal(r.status,200);return r.json();};
async function grant(email,enabled=true,revision=0,extra={}){
 const r=await call('/api/access/personal',{method:'PUT',body:{email,enabled,revision},...extra});return r;
}
assert.equal((await call('/api/access/personal',{who:{}})).status,401);
assert.equal((await call('/api/access/personal',{who:outsider})).status,403);
assert.equal((await call('/api/personal',{who:outsider})).status,403);
assert.equal((await grant('alice@example.com',true,0,{who:outsider})).status,403);
assert.equal((await grant('alice@example.com',true,0,{headers:{Origin:'https://evil.example'}})).status,403);
assert.equal((await grant('owner@example.com')).status,400);
assert.equal((await grant('invalid-email')).status,400);
let response=await grant(' Alice@Example.com ');assert.equal(response.status,200);let aliceGrant=(await response.json()).member;assert.equal(aliceGrant.email,'alice@example.com');assert.equal(aliceGrant.hasSignedIn,false);
response=await grant('bob@example.com');assert.equal(response.status,200);
assert.equal(db.prepare('SELECT count(*) n FROM card_personal_profiles').get().n,0);
let alice=await get(a),bob=await get(b);
assert.equal(alice.account.role,'personal');assert.equal(alice.account.email,'alice@example.com');
assert.equal(alice.id,null);assert.equal(bob.id,null);
assert.equal((await call('/',{who:a})).headers.get('location'),'/personal');
assert.equal((await call('/personal',{who:a})).status,200);
assert.equal((await call('/api/workspace',{who:a})).status,403);
assert.equal((await call('/api/company/profiles?companyId=demo-company',{who:a})).status,403);
assert.equal((await call('/api/access/manager',{who:a})).status,403);
assert.equal((await call('/api/access/personal',{who:a})).status,403);
assert.equal((await call('/api/personal',{who:identity('impostor','alice@example.com')})).status,403);
const save=async(who,snapshot,action='save',extra={})=>call('/api/personal',{who,method:'PUT',body:{version:snapshot.version,doc:snapshot.doc,action},...extra});
alice.doc.name='Alice private draft';bob.doc.name='Bob private draft';
response=await save(a,alice);assert.equal(response.status,200);alice=await response.json();
response=await save(b,bob);assert.equal(response.status,200);bob=await response.json();
assert.notEqual(alice.id,bob.id);
assert.equal((await get(a)).doc.name,'Alice private draft');assert.equal((await get(b)).doc.name,'Bob private draft');
assert.equal((await call('/api/profile/'+alice.id,{who:{}})).status,404);
assert.equal((await call('/api/profile/'+bob.id,{who:{}})).status,404);
assert.equal((await(await call('/api/personal?ownerId=bob-id&id='+bob.id,{who:a})).json()).id,alice.id);
assert.equal((await call('/api/personal',{who:a,method:'PUT',body:{version:alice.version,doc:alice.doc,action:'save',ownerId:'bob-id'}})).status,400);
response=await save(a,alice,'publish');assert.equal(response.status,200);alice=await response.json();
assert.equal((await(await call('/api/profile/'+alice.id,{who:{}})).json()).doc.name,'Alice private draft');
assert.equal((await call('/api/profile/'+bob.id,{who:{}})).status,404);
bob.doc.name='Bob changed draft';response=await save(b,bob);bob=await response.json();
assert.equal((await get(a)).doc.name,'Alice private draft');
// An agency save cannot erase independently owned personal publication.
const studio=await(await call('/api/workspace')).json();
assert.equal((await call('/api/workspace',{method:'PUT',body:studio})).status,200);
assert.equal((await call('/api/profile/'+alice.id,{who:{}})).status,200);
let listing=await(await call('/api/access/personal')).json();
aliceGrant=listing.members.find(m=>m.email==='alice@example.com');assert.equal(aliceGrant.hasSignedIn,true);
// Stale owner settings must not revoke access or modify a profile.
assert.equal((await grant('alice@example.com',false,99)).status,409);
assert.equal((await call('/api/profile/'+alice.id,{who:{}})).status,200);
// Atomic rollback preserves the grant, draft and published view together.
const broken={...env,DB:{...DB,async batch(statements){return DB.batch([...statements,{sql:'INSERT INTO missing_access_table VALUES (1)',args:[]}]);}}};
assert.equal((await grant('alice@example.com',false,aliceGrant.revision,{config:broken})).status,503);
assert.equal((await call('/api/personal',{who:a})).status,200);
assert.equal((await call('/api/profile/'+alice.id,{who:{}})).status,200);
// Revoke after a save has read its membership but before its transaction executes.
let intercepted=false;
const raced={...env,DB:{...DB,async batch(statements){
 if(!intercepted){intercepted=true;const r=await grant('alice@example.com',false,aliceGrant.revision);assert.equal(r.status,200);}
 return DB.batch(statements);
}}};
alice.doc.name='Revoked in-flight publish';
assert.equal((await save(a,alice,'publish',{config:raced})).status,409);
assert.equal((await call('/api/profile/'+alice.id,{who:{}})).status,404);
assert.equal((await call('/api/personal',{who:a})).status,403);
assert.equal((await call('/personal',{who:a})).status,403);
assert.equal((await save(a,alice)).status,403);
assert.equal((await get(b)).doc.name,'Bob changed draft');
listing=await(await call('/api/access/personal')).json();aliceGrant=listing.members.find(m=>m.email==='alice@example.com');
assert.equal(aliceGrant.enabled,false);
response=await grant('alice@example.com',true,aliceGrant.revision);assert.equal(response.status,200);
const restored=await get(a);assert.equal(restored.id,alice.id);assert.equal(restored.doc.name,'Alice private draft');assert.equal(restored.published,false);
assert.equal((await call('/api/profile/'+alice.id,{who:{}})).status,404);
assert.equal((await save(a,alice,'publish')).status,409);
response=await save(a,restored,'publish');assert.equal(response.status,200);
assert.equal((await call('/api/profile/'+alice.id,{who:{}})).status,200);
assert.equal((await call('/api/personal',{who:identity('different-id','alice@example.com')})).status,403);
// A bounded pilot does not silently become public registration.
const insert=db.prepare('INSERT INTO card_personal_access(id,studio_owner_id,email,enabled,revision,updated_at,mutation_token) VALUES (?,?,?,1,1,?,?)');
for(let i=0;i<98;i++)insert.run('extra-'+i,'studio-owner','extra'+i+'@example.com',new Date().toISOString(),'token-'+i);
assert.equal((await grant('overflow@example.com')).status,409);
listing=await(await call('/api/access/personal')).json();assert.equal(listing.members.length,100);
assert.equal((await call('/api/personal',{who:outsider})).status,403);
console.log('Passed: two-account private draft isolation, one card per identity, bound sign-in, company/studio denials, owner-only tester grants, stale-setting protection, atomic revocation and rollback, in-flight publish denial, retained drafts/stable links, explicit republishing and bounded pilot capacity.');

