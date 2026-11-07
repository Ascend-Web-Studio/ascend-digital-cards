import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import worker from '../dist/server/index.js';
mkdirSync('.sites-runtime',{recursive:true});const db=new DatabaseSync('.sites-runtime/hosted-preview.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())if(!db.prepare('SELECT name FROM local_migrations WHERE name=?').get(file)){db.exec('BEGIN');try{db.exec(readFileSync('drizzle/'+file,'utf8'));db.prepare('INSERT INTO local_migrations VALUES (?)').run(file);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
const DB={prepare(sql){return {bind(...args){return {sql,args,async first(){return db.prepare(sql).get(...args)||null;}};}};},async batch(statements){db.exec('BEGIN');try{const result=statements.map(s=>({results:db.prepare(s.sql).all(...s.args)}));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
// Local preview only. Production identity is supplied by Sites dispatch.
createServer(async(req,res)=>{try{const data=[];for await(const c of req)data.push(c);const headers=new Headers(req.headers);const anonymous=headers.has('x-ascend-test-anonymous');headers.delete('x-ascend-test-anonymous');if(!anonymous){headers.set('oai-authenticated-user-id','local-owner');headers.set('oai-authenticated-user-email','admin@example.com');}const body=Buffer.concat(data),r=await worker.fetch(new Request(`http://127.0.0.1:5189${req.url}`,{method:req.method,headers,...(body.length?{body}:{}),duplex:'half'}),{DB,ADMIN_EMAIL:'admin@example.com'});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview failed');}}).listen(5189,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5189'));
