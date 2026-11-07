import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
mkdirSync('.sites-runtime',{recursive:true});const sqlite=new DatabaseSync('.sites-runtime/preview.sqlite');
sqlite.exec(readFileSync('drizzle/0000_workspace.sql','utf8').replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS'));
const DB={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null;}};}};}};
createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);if(!headers.has('x-ascend-test-anonymous'))headers.set('oai-authenticated-user-id','local-owner');headers.delete('x-ascend-test-anonymous');const body=Buffer.concat(chunks);const request=new Request(`http://127.0.0.1:5189${req.url}`,{method:req.method,headers,...(body.length?{body}:{}),duplex:'half'});const response=await worker.fetch(request,{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Preview request failed');}}).listen(5189,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5189'));
