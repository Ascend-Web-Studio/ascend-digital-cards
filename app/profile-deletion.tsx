import React,{useEffect,useState} from 'react';
import type {State} from '../lib/model';

type Preview={profile:{id:string,name:string,companyName:string},version:number,accessFingerprint:string,impact:{savedRevisions:number,employeeAccessRecords:number,nfcAssignments:number,unusedImages:number}};
export function ProfileDeletion({profileId,version,onDeleted,onClose,onBusyChange}:{profileId:string,version:number,onDeleted:(state:State,version:number)=>void,onClose:()=>void,onBusyChange:(busy:boolean)=>void}){
 const [preview,setPreview]=useState<Preview|null>(null),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reviewAgain,setReviewAgain]=useState(false);
 const path='/api/admin/profiles/'+encodeURIComponent(profileId)+'/deletion';
 useEffect(()=>{let active=true;fetch(path).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error||'Unable to load deletion preview.');if(body.version!==version)throw Error('The workspace changed. Close this dialog and reload before deleting.');if(active)setPreview(body);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[path,version]);
 async function remove(){
  if(!preview||busy||reviewAgain||name!==preview.profile.name)return;
  setBusy(true);onBusyChange(true);setError('');
  try{const r=await fetch(path,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:preview.version,accessFingerprint:preview.accessFingerprint,confirmationName:name})});const body=await r.json();if(!r.ok){if(r.status===409||r.status===404)setReviewAgain(true);throw Error(body.error||'Deletion failed.');}onDeleted(body.state,body.version);}
  catch(e){setError(e instanceof Error?e.message:'Unable to delete. Check the workspace before trying again.');}
  finally{setBusy(false);onBusyChange(false);}
 }
 return <section aria-busy={busy}>
  {error&&<p className="error" role="alert">{error}</p>}
  {!preview&&!error&&<p role="status">Loading deletion preview…</p>}
  {preview&&<><p>Permanently delete <strong>{preview.profile.name}</strong> from <strong>{preview.profile.companyName}</strong>?</p>
   <ul><li>Remove the draft and {preview.impact.savedRevisions} saved revisions.</li><li>Remove {preview.impact.employeeAccessRecords} employee access records assigned to this profile.</li><li>Disable and clear {preview.impact.nfcAssignments} NFC assignments; their existing links will stop working.</li><li>Remove {preview.impact.unusedImages} images no longer used by the workspace.</li></ul>
   <p>The public card, QR destination and contact download will be unavailable. Shared images and other profiles will remain. Personal accounts are managed separately.</p>
   <p>This cannot be undone here. Previously downloaded backups and contacts may still contain these details. Old backups cannot restore this profile ID.</p>
   <label className="field"><span>Type {preview.profile.name} to confirm</span><input autoComplete="off" maxLength={180} disabled={busy||reviewAgain} value={name} onChange={e=>setName(e.target.value)}/></label></>}
  <div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary danger-fill" disabled={!preview||busy||reviewAgain||name!==preview.profile.name} onClick={()=>void remove()}>{busy?'Deleting…':'Permanently delete profile'}</button></div>
 </section>;
}
