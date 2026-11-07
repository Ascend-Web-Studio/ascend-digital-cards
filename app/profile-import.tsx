'use client';
import {useMemo,useState} from 'react';
import {Download,Upload,CheckCircle2,AlertCircle,LoaderCircle} from 'lucide-react';
import type {State,Profile} from '@/lib/model';
import {CSV_MAX_BYTES,PROFILE_CSV_TEMPLATE,previewProfileImport,type ImportOptions} from '@/lib/profile-import';

export default function ProfileImport({state,saving,onCancel,onImport}:{state:State;saving:boolean;onCancel:()=>void;onImport:(text:string,options:ImportOptions)=>Promise<boolean>}){
 const [companyId,setCompanyId]=useState(state.companies.find(c=>c.id!=='demo-company')?.id||state.companies[0]?.id||'');
 const [groupId,setGroupId]=useState(''),[template,setTemplate]=useState<Profile['template']>('professional');
 const [text,setText]=useState(''),[fileName,setFileName]=useState(''),[error,setError]=useState(''),[reading,setReading]=useState(false);
 const options={companyId,groupId,template};
 const preview=useMemo(()=>text?previewProfileImport(text,state,{companyId,groupId,template}):null,[text,state,companyId,groupId,template]);
 const validCount=preview?.rows.filter(r=>!r.errors.length).length||0;
 function downloadTemplate(){
  const url=URL.createObjectURL(new Blob(['\uFEFF'+PROFILE_CSV_TEMPLATE],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='Ascend-Team-Import-Template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function readFile(file?:File){
  setError('');setText('');setFileName('');
  if(!file)return;
  if(!/\.csv$/i.test(file.name)){setError('Choose a .csv file. Export Excel files as CSV UTF-8 first.');return;}
  if(file.size>CSV_MAX_BYTES){setError('Choose a CSV of 256 KB or smaller.');return;}
  setReading(true);
  try{const content=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());setText(content);setFileName(file.name);}
  catch{setError('Unable to read this file as UTF-8. Export it as CSV UTF-8 and choose it again.');}
  finally{setReading(false);}
 }
 async function submit(){
  if(!preview?.ready||saving||reading)return;
  setError('');
  try{if(!await onImport(text,options))setError('The import was not saved. Close this window to review the workspace error before trying again.');}
  catch(e){setError(e instanceof Error?e.message:'Import failed. No profiles were added.');}
 }
 return <div className="csv-import">
  <div className="csv-intro"><Upload size={22}/><p>Create a team together. Review every row, then save all profiles as <strong>private drafts</strong>. Publish them only when you are ready.</p></div>
  <div className="csv-destination">
   <label className="field"><span>Company</span><select value={companyId} disabled={saving} onChange={e=>{setCompanyId(e.target.value);setGroupId('');}}>{!state.companies.length&&<option value="">Create a company first</option>}{state.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label className="field"><span>Group</span><select value={groupId} disabled={saving} onChange={e=>setGroupId(e.target.value)}><option value="">No group</option>{state.groups.filter(g=>g.companyId===companyId).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   <label className="field"><span>Starting template</span><select value={template} disabled={saving} onChange={e=>setTemplate(e.target.value as Profile['template'])}><option value="professional">Professional</option><option value="visual">Visual</option><option value="minimal">Minimal</option></select></label>
  </div>
  <div className="csv-file-row"><label className="field csv-file"><span>Team CSV file</span><input type="file" accept=".csv,text/csv" disabled={saving||reading} onChange={e=>{void readFile(e.target.files?.[0]);e.target.value='';}}/><small>CSV UTF-8, up to 100 people and 256 KB. Keep phone numbers as text, including the country code.</small></label><button className="secondary" type="button" onClick={downloadTemplate}><Download size={15}/>Download template</button></div>
  {reading&&<p className="csv-progress" role="status"><LoaderCircle className="spin" size={16}/>Reading your file…</p>}
  <details className="csv-paste"><summary>Paste CSV instead, or correct the uploaded text</summary><label className="field"><span>CSV contents</span><textarea rows={5} maxLength={CSV_MAX_BYTES} disabled={saving||reading} value={text} spellCheck={false} placeholder="name,role,email,phone,website" onChange={e=>{setText(e.target.value);setFileName('');setError('');}}/></label></details>
  {error&&<div className="csv-error" role="alert"><AlertCircle size={17}/><p>{error}</p></div>}
  {preview&&<section className="csv-preview" aria-label="Import preview">
   <div className="csv-preview-title"><div><h3>Review your import</h3><p>{fileName||'Pasted CSV'} · {preview.rows.length} people · {validCount} valid rows</p></div><span className={'badge '+(preview.ready?'green':'muted')}>{preview.ready?<CheckCircle2 size={13}/>:<AlertCircle size={13}/>} {preview.ready?'Ready for review':'Needs attention'}</span></div>
   {preview.errors.length>0&&<div className="csv-error" role="alert"><AlertCircle size={17}/><ul>{preview.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
   {preview.rows.length>0&&<div className="csv-preview-table" tabIndex={0} aria-label="Scrollable profile preview"><table><caption className="sr-only">New profiles and validation results. No profiles are changed until you import.</caption><thead><tr><th>CSV line</th><th>Name</th><th>Title</th><th>Email</th><th>Phone</th><th>Website</th><th>Validation</th></tr></thead><tbody>{preview.rows.map((row,i)=><tr key={i} className={row.errors.length?'csv-invalid':''}><td>{row.line}</td><td>{row.details.name||'—'}</td><td>{row.details.role||'—'}</td><td>{row.details.email||'—'}</td><td>{row.details.phone||'—'}</td><td>{row.details.website||'—'}</td><td>{row.errors.length?<span className="csv-row-error">{row.errors.join(' ')}</span>:<span className="csv-row-valid">Valid · private draft</span>}</td></tr>)}</tbody></table></div>}
   <p className="csv-note">Existing profiles are never overwritten. Duplicate people in this company and invalid rows must be corrected before the import can be saved. The file itself is not retained.</p>
  </section>}
  <div className="dialog-actions"><button type="button" className="secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!preview?.ready||saving||reading} onClick={()=>void submit()}>{saving?<><LoaderCircle size={16} className="spin"/>Saving drafts…</>:<><Upload size={16}/>Import &amp; save {preview?.rows.length||0} drafts</>}</button></div>
 </div>;
}

