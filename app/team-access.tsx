'use client';
import {useEffect,useState} from 'react';
import {ShieldCheck,Save,LoaderCircle,AlertCircle,ExternalLink} from 'lucide-react';
import type {Company} from '@/lib/model';
import {managerConfigSchema,type ManagerConfig} from '@/lib/access';
const initial:ManagerConfig={email:'',enabled:true,companyIds:[],permissions:{manageTeams:true,editBranding:true,publish:true},revision:0};
export default function TeamAccess({companies,workspaceSaved}:{companies:Company[];workspaceSaved:boolean}){
 const [config,setConfig]=useState<ManagerConfig>(initial),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[signedIn,setSignedIn]=useState(false),[ready,setReady]=useState(false);
 async function load(){
  setLoading(true);setError('');setNotice('');
  try{const r=await fetch('/api/access/manager');const j=await r.json();if(!r.ok)throw Error(j.error);
   if(j.manager){const m=j.manager;setConfig({email:m.email,enabled:m.enabled,companyIds:m.companyIds.filter((id:string)=>companies.some(c=>c.id===id)),permissions:m.permissions,revision:m.revision});setSignedIn(m.hasSignedIn);}
   else{setConfig(initial);setSignedIn(false);}setReady(true);
  }catch(e){setError(e instanceof Error?e.message:'Unable to load team access.');setReady(false);}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 async function save(){
  const valid=managerConfigSchema.safeParse(config);if(!valid.success){setError(valid.error.issues.map(i=>i.message).join(' '));return;}
  setSaving(true);setError('');setNotice('');
  try{const r=await fetch('/api/access/manager',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(valid.data)});const j=await r.json();if(!r.ok)throw Error(j.error);
   const m=j.manager;setConfig({email:m.email,enabled:m.enabled,companyIds:m.companyIds,permissions:m.permissions,revision:m.revision});setSignedIn(m.hasSignedIn);
   setNotice(m.enabled?'Manager permissions saved. Share the sign-in link with your developer.':'Manager access disabled. Future requests are blocked.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to save access settings.');}
  finally{setSaving(false);}
 }
 return <section className="panel team-access"><div className="section-title"><div><h2>Team access</h2><p className="muted">One owner. One manager. Separate sign-ins.</p></div><ShieldCheck size={22}/></div>
  <p className="access-description">You keep full control of accounts, backups and NFC assignments. Your manager sees only the companies selected here. They use their own ChatGPT account; no shared password is needed.</p>
  {loading?<p className="csv-progress"><LoaderCircle className="spin" size={16}/>Loading access settings…</p>:<form onSubmit={e=>{e.preventDefault();void save();}}>
   <fieldset disabled={saving||!ready} className="access-fields">
    <label className="field"><span>Developer / manager email</span><input type="email" required maxLength={254} autoComplete="off" placeholder="developer@example.com" value={config.email} onChange={e=>setConfig({...config,email:e.target.value})}/><small>Use the exact email on their ChatGPT account. Saving grants access; it does not send an invitation email.</small></label>
    <label className="check-field access-toggle"><input type="checkbox" checked={config.enabled} onChange={e=>setConfig({...config,enabled:e.target.checked})}/><span>Enable manager access<small>Turn this off to revoke access without deleting profiles.</small></span></label>
    <div className="access-company-heading"><h3>Assigned companies</h3><span>{config.companyIds.length} selected</span></div>
    <div className="access-companies">{companies.map(c=><label className="check-field" key={c.id}><input type="checkbox" checked={config.companyIds.includes(c.id)} onChange={e=>setConfig({...config,companyIds:e.target.checked?[...config.companyIds,c.id]:config.companyIds.filter(id=>id!==c.id)})}/><span>{c.name}</span></label>)}{!companies.length&&<p className="muted">Create and save a company first.</p>}</div>
    <h3 className="access-permissions-title">Permissions within those companies</h3>
    {([{key:'manageTeams',label:'Create and edit teams and profiles',hint:'Includes groups, profile designs, photos and team CSV import.'},{key:'editBranding',label:'Edit company and group branding',hint:'Includes logos, company cover photos, shared colours and brand locks.'},{key:'publish',label:'Publish and manage public revisions',hint:'Includes publishing groups, unpublishing, archiving and restoring revisions.'}] as const).map(p=><label className="check-field" key={p.key}><input type="checkbox" checked={config.permissions[p.key]} onChange={e=>setConfig({...config,permissions:{...config.permissions,[p.key]:e.target.checked}})}/><span>{p.label}<small>{p.hint}</small></span></label>)}
   </fieldset>
   {signedIn&&<p className="muted">The manager has signed in with their own account.</p>}
   {!workspaceSaved&&<div className="info-note"><AlertCircle size={17}/><p>Save workspace changes before changing manager permissions.</p></div>}
   {error&&<div className="csv-error" role="alert"><AlertCircle size={17}/><p>{error}</p></div>}
   {notice&&<p className="access-notice" role="status">{notice}</p>}
   <div className="access-actions"><button className="primary" disabled={saving||!ready||!workspaceSaved}>{saving?<LoaderCircle className="spin" size={16}/>:<Save size={16}/>}Save manager access</button><button className="secondary" type="button" disabled={saving} onClick={()=>void load()}>Reload settings</button><a className="text-button" href="/login" target="_blank" rel="noopener noreferrer">Open sign-in page <ExternalLink size={14}/></a></div>
  </form>}
  {loading&&error&&<p className="csv-error" role="alert">{error}</p>}
 </section>;
}

