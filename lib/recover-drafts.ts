import {workspaceSchema,type State} from './model';
export function recoverProfileDrafts(current:State,input:unknown):{state:State,count:number}{
 const backup=workspaceSchema.parse(input);let count=0;
 const profiles=current.profiles.map(p=>{
  const imported=backup.profiles.find(x=>x.id===p.id&&x.companyId===p.companyId);if(!imported)return p;count++;
  const {live,history,publicEnabled,publishedAt,archived,companyId,groupId,...draft}=imported;
  return {...p,...draft,updatedAt:new Date().toISOString()};
 });
 if(!count)throw Error('This backup has no matching profiles. Use the full restore only if you intend to replace the workspace.');
 return {state:workspaceSchema.parse({...current,profiles}),count};
}

