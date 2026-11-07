import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import worker from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return{bind(...args){return{sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const rows=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
const env={DB,ADMIN_EMAIL:'owner@example.com'},origin='https://studio.example';
const owner={'oai-authenticated-user-id':'owner-id','oai-authenticated-user-email':'owner@example.com'};
async function call(path,{who=owner,method='GET',body,config=env}={}){
 return worker.fetch(new Request(origin+path,{method,headers:{...who,...(method==='PUT'?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),config);
}
let p=await(await call('/api/personal')).json();p.doc.name='Photo owner';
const rgb=randomBytes(144*144*3),pixels=rgb.toString('base64');
let r=await call('/api/personal',{method:'PUT',body:{version:p.version,action:'save',doc:p.doc,pixels}});assert.equal(r.status,200);p=await r.json();
const photo=p.doc.photo;assert(photo.startsWith('data:image/png;base64,'));assert(photo.length<100000);
const png=Buffer.from(photo.split(',')[1],'base64');let offset=8,idat;const types=[];
while(offset<png.length){const len=png.readUInt32BE(offset),kind=png.toString('ascii',offset+4,offset+8);types.push(kind);if(kind==='IDAT')idat=png.subarray(offset+8,offset+8+len);if(kind==='IHDR'){assert.equal(png.readUInt32BE(offset+8),144);assert.equal(png.readUInt32BE(offset+12),144);assert.equal(png[offset+17],2);}offset+=12+len;}
assert.deepEqual(types,['IHDR','IDAT','IEND']);
const scan=inflateSync(idat);assert.equal(scan.length,144*144*3+144);
for(let y=0;y<144;y++){assert.equal(scan[y*433],0);assert.deepEqual(scan.subarray(y*433+1,(y+1)*433),rgb.subarray(y*432,(y+1)*432));}
r=await call('/api/personal',{method:'PUT',body:{version:p.version,action:'publish',doc:p.doc}});assert.equal(r.status,200);p=await r.json();
assert.equal((await(await call('/api/profile/'+p.id,{who:{}})).json()).doc.photo,photo);
const photoBody={version:p.version,action:'save',doc:{...p.doc,photo:photo+'evil'}};
assert.equal((await call('/api/personal',{method:'PUT',body:photoBody})).status,400);
assert.equal((await call('/api/personal',{method:'PUT',body:{version:p.version,action:'save',doc:p.doc,pixels:'AAAA'}})).status,400);
r=await call('/api/personal',{method:'PUT',body:{version:p.version,action:'save',doc:{...p.doc,photo:''}}});assert.equal(r.status,200);p=await r.json();
assert.equal((await(await call('/api/profile/'+p.id,{who:{}})).json()).doc.photo,photo); // removal stays a private draft
r=await call('/api/personal',{method:'PUT',body:{version:p.version,action:'save',doc:{...p.doc,photo}}});assert.equal(r.status,200); // Undo of canonical photo is safe.
let studio=await(await call('/api/workspace')).json();
studio.state.companies[0].logo=photo;studio.state.companies[0].coverImage=photo;
for(const person of studio.state.profiles.slice(0,2)){
 person.photo=photo;person.coverImage=photo;person.backgroundImage=photo;person.publicEnabled=true;
 const doc={name:person.name,role:person.role,email:person.email,phone:person.phone,website:person.website,companyName:studio.state.companies[0].name,accent:person.accent,template:person.template,blocks:person.blocks,photo,coverImage:photo,backgroundImage:photo,companyLogo:photo};
 person.live=structuredClone(doc);person.publishedAt=new Date().toISOString();person.history=Array.from({length:8},()=>({at:new Date().toISOString(),doc:structuredClone(doc)}));
}
assert(JSON.stringify(studio.state).length>1500000);assert(JSON.stringify(studio.state).length<8000000);
// Old inline clients remain accepted; the server migrates on a successful save.
r=await call('/api/workspace',{method:'PUT',body:studio});assert.equal(r.status,200,await r.clone().text());studio.version=(await r.json()).version;
const stored=db.prepare('SELECT payload FROM card_workspaces WHERE owner_id=?').get('owner-id').payload;
assert(stored.length<150000);assert(stored.includes('__ascendImage'));assert(!stored.includes(photo));
assert.equal(db.prepare('SELECT count(*) n FROM card_workspace_images').get().n,1);
const reloaded=await(await call('/api/workspace')).json();assert.deepEqual(reloaded.state,studio.state);
assert.equal((await(await call('/api/profile/'+studio.state.profiles[0].id,{who:{}})).json()).doc.photo,photo);
assert(db.prepare('SELECT max(length(payload)) n FROM card_profile_records').get().n<150000);
const hash=createHash('sha256').update(photo).digest('hex');
const packed=JSON.parse(JSON.stringify(studio.state,(_key,value)=>value===photo?{__ascendImage:hash}:value));
packed.profiles[0].name='Changed after large save';
const body={version:studio.version,state:packed,assets:[{id:hash,data:photo}]};
r=await call('/api/workspace',{method:'PUT',body});assert.equal(r.status,200);studio.version=(await r.json()).version;
assert.equal((await(await call('/api/workspace')).json()).state.profiles[0].name,'Changed after large save');
assert.equal((await call('/api/workspace',{method:'PUT',body:{...body,version:0}})).status,409);
assert.equal((await call('/api/workspace',{method:'PUT',body:{...body,version:studio.version,assets:[{id:hash,data:photo.slice(0,-4)+'AAAA'}]}})).status,400);
assert.equal((await call('/api/workspace',{method:'PUT',body:{...body,version:studio.version,assets:[]}})).status,400);
const broken={...env,DB:{...DB,async batch(statements){return DB.batch([...statements,{sql:'INSERT INTO failed_media_transaction VALUES (1)',args:[]}]);}}};
assert.equal((await call('/api/workspace',{method:'PUT',body:{...body,version:studio.version},config:broken})).status,503);
assert.equal((await(await call('/api/workspace')).json()).version,studio.version);
assert.equal(db.prepare('SELECT count(*) n FROM card_workspace_images').get().n,1);
assert.equal((await call('/api/profile/'+studio.state.profiles[0].id,{who:{}})).status,200);
assert.equal((await call('/api/workspace',{who:{}})).status,401);
console.log('Passed: original large-image save reproduced and resolved, legacy/compact transport, unique image storage, full history/photo reload, public rendering, stale/tampered/missing asset rejection, transactional rollback, raw-pixel photo reconstruction, metadata-free PNG, photo removal/Undo and draft/public separation.');


// Media hydration must respect manager company scope, including previously hidden images.
let scoped=await(await call('/api/workspace')).json();
const hiddenPhoto='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const hidden={...structuredClone(scoped.state.profiles[0]),id:'hidden-profile',companyId:'hidden-company',groupId:'',photo:'',coverImage:'',backgroundImage:'',live:null,history:[],publicEnabled:false,name:'Hidden person'};
scoped.state.companies.push({id:'hidden-company',name:'Hidden company',industry:'Private',color:'#223344',logo:hiddenPhoto});
scoped.state.profiles.push(hidden);
r=await call('/api/workspace',{method:'PUT',body:scoped});assert.equal(r.status,200);
db.prepare("INSERT INTO card_manager_access(id,owner_id,email,user_id,enabled,company_ids,permissions,revision,updated_at) VALUES ('manager','owner-id','manager@example.com','manager-id',1,?,?,1,?)").run(JSON.stringify(['demo-company']),JSON.stringify({manageTeams:true,editBranding:false,publish:true}),new Date().toISOString());
const manager={'oai-authenticated-user-id':'manager-id','oai-authenticated-user-email':'manager@example.com'};
const view=await(await call('/api/workspace',{who:manager})).json();
assert.equal(view.state.companies.some(c=>c.id==='hidden-company'),false);assert.equal(JSON.stringify(view).includes(hiddenPhoto),false);
assert.equal(view.state.profiles.some(p=>p.id==='hidden-profile'),false);
view.state.profiles[0].role='Updated with media present';
r=await call('/api/workspace',{who:manager,method:'PUT',body:view});assert.equal(r.status,200);
assert.equal((await(await call('/api/workspace')).json()).state.companies.find(c=>c.id==='hidden-company').logo,hiddenPhoto);
console.log('Passed: manager media hydration and saves preserve inaccessible company records.');
