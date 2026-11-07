import {useRef,useState} from 'react';
import {prepareImage} from '../lib/images';
export default function PersonalPhoto({value,disabled,onChange}:{value?:string,disabled?:boolean,onChange:(preview:string,pixels?:string)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const run=useRef(0);
 async function select(file?:File){if(!file)return;const generation=++run.current;setBusy(true);setError('');
 try{const safe=await prepareImage(file,'photo');const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(safe.split(',')[1]),c=>c.charCodeAt(0))],{type:safe.slice(5,safe.indexOf(';'))}));
 try{const canvas=document.createElement('canvas');canvas.width=144;canvas.height=144;const c=canvas.getContext('2d');if(!c)throw Error('Photo editing is unavailable.');
 c.fillStyle='#ffffff';c.fillRect(0,0,144,144);const edge=Math.min(bitmap.width,bitmap.height);c.drawImage(bitmap,(bitmap.width-edge)/2,(bitmap.height-edge)/2,edge,edge,0,0,144,144);
 const rgba=c.getImageData(0,0,144,144).data;let rgb='';for(let i=0;i<rgba.length;i+=4)rgb+=String.fromCharCode(rgba[i],rgba[i+1],rgba[i+2]);if(generation===run.current)onChange(canvas.toDataURL('image/jpeg',.82),btoa(rgb));
 }finally{bitmap.close();}
 }catch(e){if(generation===run.current)setError(e instanceof Error?e.message:'Could not open photo.');}finally{if(generation===run.current)setBusy(false);}}
 return <div className="personal-photo"><span>Profile photo</span>{value&&<img src={value} alt="Profile photo preview" width={90} height={90}/>}<label className="secondary">{busy?'Preparing photo…':value?'Replace photo':'Choose photo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled||busy} onChange={e=>{void select(e.target.files?.[0]);e.currentTarget.value='';}}/></label>{value&&<button className="secondary" disabled={disabled||busy} onClick={()=>{run.current++;onChange('');}}>Remove photo</button>}<small>PNG, JPEG or WebP, up to 8 MB. Centre-cropped to a 144px profile image; original files and metadata are not stored.</small>{error&&<p role="alert">{error}</p>}</div>;
}

