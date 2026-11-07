// Compatibility projection: normalized records commit atomically with the legacy studio.
// Backfills are explicit, bounded owner operations; migrations remain schema-only.
export function projectionStatements(DB,ownerId,state,guard,args){
 const out=[];
 for(const table of ['card_profile_records','card_group_records','card_company_records'])
  out.push(DB.prepare('DELETE FROM '+table+' WHERE owner_id=? AND '+guard).bind(ownerId,...args));
 const sets=[
 ['card_company_records','owner_id,id,payload',"?,json_extract(value,'$.id'),value",state.companies],
 ['card_group_records','owner_id,id,company_id,payload',"?,json_extract(value,'$.id'),json_extract(value,'$.companyId'),value",state.groups],
 ['card_profile_records','owner_id,id,company_id,name,role,email,archived,payload',"?,json_extract(value,'$.id'),json_extract(value,'$.companyId'),json_extract(value,'$.name'),json_extract(value,'$.role'),json_extract(value,'$.email'),json_extract(value,'$.archived'),value",state.profiles]
 ];
 for(const [table,columns,select,records] of sets)
  out.push(DB.prepare('INSERT INTO '+table+' ('+columns+') SELECT '+select+' FROM json_each(?) WHERE '+guard).bind(ownerId,JSON.stringify(records),...args));
 return out;
}
export async function companyProfiles(env,context,url,json){
 if(!context)return json({error:'Studio access is required.'},403);
 const companyId=url.searchParams.get('companyId')||'';
 if(!companyId||companyId.length>80)return json({error:'Choose a company.'},400);
 if(context.role!=='owner'&&!context.companyIds.includes(companyId))return json({error:'Company unavailable.'},404);
 const company=await env.DB.prepare('SELECT id FROM card_company_records WHERE owner_id=? AND id=?').bind(context.ownerId,companyId).first();
 if(!company)return json({error:'Company unavailable. The owner may need to sync company records.'},404);
 const limit=Number(url.searchParams.get('limit')||25),offset=Number(url.searchParams.get('offset')||0),q=url.searchParams.get('q')||'';
 if(!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(offset)||offset<0||offset>10000||q.length>180)return json({error:'Invalid page or search. Use 1–50 records per page.'},400);
 const like='%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%';
 const where="owner_id=? AND company_id=? AND archived=0 AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')";
 const args=[context.ownerId,companyId,like,like];
 const row=await env.DB.prepare("SELECT (SELECT count(*) FROM card_profile_records WHERE "+where+") AS total,(SELECT json_group_array(json_object('id',id,'name',name,'role',role,'email',email)) FROM (SELECT id,name,role,email FROM card_profile_records WHERE "+where+" ORDER BY id LIMIT ? OFFSET ?)) AS items").bind(...args,...args,limit,offset).first();
 return json({items:JSON.parse(row.items),total:row.total,limit,offset});
}

