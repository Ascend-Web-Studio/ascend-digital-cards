import {profileSchema,newProfile,uid,workspaceSchema,type State,type Profile} from './model';

export const CSV_MAX_BYTES=256*1024;
export const CSV_MAX_ROWS=100;
export const PROFILE_CSV_TEMPLATE='name,role,email,phone,website\r\nExample Person,Team member,person@example.com,+27210000000,https://example.com\r\n';
const fields=['name','role','email','phone','website'] as const;
type Field=typeof fields[number];
export type ImportDetails=Pick<Profile,Field>;
export type ImportOptions={companyId:string;groupId:string;template:Profile['template']};
export type ImportRow={line:number;details:ImportDetails;errors:string[]};
export type ImportPreview={rows:ImportRow[];errors:string[];ready:boolean};
const detailsSchema=profileSchema.pick({name:true,role:true,email:true,phone:true,website:true});
const aliases:Record<string,Field>={name:'name',fullname:'name',role:'role',jobtitle:'role',email:'email',emailaddress:'email',phone:'phone',phonenumber:'phone',mobile:'phone',website:'website'};
const normal=(s:string)=>s.trim().toLocaleLowerCase('en-ZA');
const phoneKey=(s:string)=>s.replace(/\D/g,'');

// Comma-separated CSV with quoted commas, escaped quotes, embedded newlines and BOM.
export function parseProfileCsv(input:string):{line:number;cells:string[]}[]{
 if(new TextEncoder().encode(input).length>CSV_MAX_BYTES)throw Error('CSV files must be 256 KB or smaller.');
 const source=input.replace(/^\uFEFF/,'');
 const rows:{line:number;cells:string[]}[]=[];
 let cell='',cells:string[]=[],quoted=false,afterQuote=false,line=1,startLine=1;
 const endCell=()=>{cells.push(cell);cell='';afterQuote=false;};
 const endRow=()=>{endCell();if(cells.some(c=>c.trim()))rows.push({line:startLine,cells});cells=[];if(rows.length>CSV_MAX_ROWS+1)throw Error('Import at most 100 profiles per file.');};
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){
   if(c==='"'){if(source[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}
   else if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;cell+='\n';line++;}
   else cell+=c;
   continue;
  }
  if(c===','){endCell();continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&source[i+1]==='\n')i++;endRow();line++;startLine=line;continue;}
  if(afterQuote){if(c===' '||c==='\t')continue;throw Error('Unexpected text after a closing quote on line '+line+'.');}
  if(c==='"'){if(cell)throw Error('Unexpected quote on line '+line+'. Put the entire value inside quotes.');quoted=true;}
  else cell+=c;
 }
 if(quoted)throw Error('An opening quote has no closing quote near line '+startLine+'.');
 if(cell||cells.length||afterQuote)endRow();
 return rows;
}

export function previewProfileImport(text:string,state:State,options:ImportOptions):ImportPreview{
 const errors:string[]=[],rows:ImportRow[]=[];
 const company=state.companies.find(c=>c.id===options.companyId);
 if(!company)errors.push('Choose an existing company.');
 if(options.groupId&&!state.groups.some(g=>g.id===options.groupId&&g.companyId===options.companyId))errors.push('Choose a group belonging to the selected company.');
 if(!['professional','visual','minimal'].includes(options.template))errors.push('Choose a supported starting template.');
 let parsed:ReturnType<typeof parseProfileCsv>;
 try{parsed=parseProfileCsv(text);}catch(e){return {rows,errors:[...errors,e instanceof Error?e.message:'Unable to read this CSV.'],ready:false};}
 if(!parsed.length)return {rows,errors:[...errors,'Choose a CSV containing a header row and at least one person.'],ready:false};
 const headers=parsed[0].cells.map(h=>aliases[h.trim().toLowerCase().replace(/[\s_-]+/g,'')]);
 if(headers.some(h=>!h))errors.push('Supported columns: name, role, email, phone, website. Download the template for an example.');
 if(!headers.includes('name'))errors.push('The CSV needs a name column.');
 if(new Set(headers).size!==headers.length)errors.push('Each column may appear only once.');
 if(parsed.length===1)errors.push('Add at least one person below the header row.');
 if(state.profiles.length+parsed.length-1>100)errors.push('This workspace has room for '+Math.max(0,100-state.profiles.length)+' more profiles, including archived profiles.');
 if(errors.some(e=>e.includes('column')))return {rows,errors,ready:false};
 const existing=state.profiles.filter(p=>p.companyId===options.companyId);
 const seenEmails=new Set<string>(),seenPeople=new Set<string>();
 for(const record of parsed.slice(1)){
  const details:ImportDetails={name:'',role:'',email:'',phone:'',website:''},rowErrors:string[]=[];
  if(record.cells.length!==headers.length)rowErrors.push('Expected '+headers.length+' columns; found '+record.cells.length+'.');
  headers.forEach((header,i)=>{if(header)details[header]=(record.cells[i]||'').trim();});
  details.name=details.name.replace(/\s+/g,' ');
  const valid=detailsSchema.safeParse(details);
  if(!valid.success)for(const issue of valid.error.issues)rowErrors.push(String(issue.path[0])+': '+(issue.path[0]==='name'&&!details.name?'Enter a full name.':issue.message));
  const email=normal(details.email),person=normal(details.name)+'|'+phoneKey(details.phone);
  if(email&&existing.some(p=>normal(p.email)===email)||!email&&existing.some(p=>normal(p.name)+'|'+phoneKey(p.phone)===person))rowErrors.push('Matches an existing profile in this company. Edit or restore that profile instead.');
  if(email&&seenEmails.has(email)||!email&&seenPeople.has(person))rowErrors.push('This person appears more than once in the file.');
  if(email)seenEmails.add(email);
  seenPeople.add(person);
  rows.push({line:record.line,details,errors:rowErrors});
 }
 return {rows,errors,ready:rows.length>0&&errors.length===0&&rows.every(r=>!r.errors.length)};
}

export function importProfileDrafts(text:string,state:State,options:ImportOptions):{state:State;count:number}{
 const preview=previewProfileImport(text,state,options);
 if(!preview.ready)throw Error(preview.errors[0]||preview.rows.find(r=>r.errors.length)?.errors[0]||'Correct the import errors first.');
 const next=structuredClone(state),company=next.companies.find(c=>c.id===options.companyId)!;
 for(const row of preview.rows){
  const profile={...newProfile(company.id),...row.details,groupId:options.groupId,template:options.template,accent:company.color,publicEnabled:false};
  next.profiles.push(profile);
 }
 next.activity=[{id:uid(),action:'Imported '+preview.rows.length+' private profile drafts for '+company.name,at:new Date().toISOString()},...next.activity].slice(0,60);
 return {state:workspaceSchema.parse(next),count:preview.rows.length};
}

