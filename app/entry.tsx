import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Workspace from './workspace';
import PersonalEditor from './personal-editor';
import CompanyPortal from './company-portal';
import {CardView} from './card-view';
import type {CardDoc} from '../lib/model';
import {seedState,workspaceSchema} from '../lib/model';
declare global {interface Window {__ASCEND_OFFLINE__?:boolean}}
if(window.__ASCEND_OFFLINE__){
 const key='ascend-local-demo-v1';let memory:{state:ReturnType<typeof seedState>,version:number}|null=null;
 const read=()=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):memory||{state:seedState(),version:0};}catch{return memory||{state:seedState(),version:0};}};
 const original=window.fetch.bind(window);
 window.fetch=async(input,init)=>{const path=String(input);if(!path.startsWith('/api/'))return original(input,init);const current=read();
  if(path==='/api/workspace'&&init?.method==='PUT'){const body=JSON.parse(String(init.body));if(body.version!==current.version)return Response.json({error:'The demo changed in another tab. Export your draft before reloading.'},{status:409});const valid=workspaceSchema.safeParse(body.state);if(!valid.success)return Response.json({error:'The workspace contains invalid data.'},{status:400});const next={state:valid.data,version:current.version+1};try{localStorage.setItem(key,JSON.stringify(next));memory=next;}catch{return Response.json({error:'This browser blocked local saving. Export a backup to keep your work.'},{status:503});}return Response.json({version:next.version});}
  if(path==='/api/workspace')return Response.json(current);
  const p=current.state.profiles.find((p:import('../lib/model').Profile)=>p.id===path.split('/').at(-1)&&!p.archived&&p.live);return p?Response.json({doc:p.live}):Response.json({error:'Profile unavailable. Save a published revision first.'},{status:404});
 };
}
function Entry(){const offline=!!window.__ASCEND_OFFLINE__,profileId=new URLSearchParams(location.search).get('profile'),path=offline&&profileId?'/p/'+profileId:location.pathname;const [doc,setDoc]=useState<CardDoc|null>(null),[error,setError]=useState('');useEffect(()=>{if(path.startsWith('/p/'))fetch('/api/profile/'+path.split('/')[2]).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error);setDoc(j.doc);}).catch(e=>setError(e.message));},[path]);if(path.startsWith('/p/'))return <main className="standalone-card"><div className="preview-disclosure">{offline?'Local browser demo':'Published digital card'} · published revision</div>{doc?<CardView doc={doc} contactUrl={offline?undefined:path+'/contact.vcf'}/>:<div className="empty"><h2>{error||'Opening profile…'}</h2></div>}{offline&&<a className="back-studio" href={location.pathname}>Back to your studio</a>}</main>;if(path==='/company')return <CompanyPortal/>;if(path==='/personal')return <PersonalEditor/>;return <Workspace ownerName="Sevano"/>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Entry/></React.StrictMode>);
