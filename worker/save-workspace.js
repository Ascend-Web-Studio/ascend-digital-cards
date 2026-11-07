import {packWorkspace,MediaError} from '../lib/workspace-media.ts';
import {imageStatements} from './workspace-media.js';
import {projectionStatements} from './customer-foundation.js';
export async function saveWorkspace(env,{ownerId,state,version,guard='1=1',guardArgs=[],additionalStatements=()=>[]}){
 // Every writer (studio, manager and company portal) respects deleted profile IDs.
 const incomingIds=[...new Set([...state.profiles.map(p=>p.id),...state.cards.map(c=>c.profileId).filter(Boolean)])];
 const deleted=await env.DB.prepare('SELECT profile_id FROM card_deleted_profiles WHERE owner_id=? AND profile_id IN (SELECT value FROM json_each(?)) LIMIT 1').bind(ownerId,JSON.stringify(incomingIds)).first();
 if(deleted)throw new MediaError('This save includes a permanently deleted profile. Remove deleted profiles and their NFC assignments from the backup before restoring it.',409);
 guard='('+guard+') AND NOT EXISTS (SELECT 1 FROM card_deleted_profiles WHERE owner_id=? AND profile_id IN (SELECT value FROM json_each(?)))';
 guardArgs=[...guardArgs,ownerId,JSON.stringify(incomingIds)];
 const packed=await packWorkspace(state),saveToken=crypto.randomUUID(),now=new Date().toISOString();
   const commands=[env.DB.prepare('INSERT INTO card_workspaces (owner_id,payload,version,updated_at,save_token) SELECT ?,?,1,?,? WHERE (?=0 OR EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=?)) AND '+guard+' ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload,version=card_workspaces.version+1,updated_at=excluded.updated_at,save_token=excluded.save_token WHERE card_workspaces.version=? AND '+guard+' RETURNING version').bind(ownerId,JSON.stringify(packed.state),now,saveToken,version,ownerId,...guardArgs,version,...guardArgs)];
   commands.push(...imageStatements(env.DB,ownerId,packed.assets,saveToken));
   commands.push(env.DB.prepare('DELETE FROM card_public_views WHERE owner_id=? AND EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=? AND save_token=?)').bind(ownerId,ownerId,saveToken));
   const publicProfiles=state.profiles.filter(p=>p.publicEnabled===true&&!p.archived&&p.live);
   const views=publicProfiles.map(p=>({key:'p/'+p.id,payload:JSON.stringify(p.live)}));
   for(const c of state.cards)if(c.status==='assigned'&&publicProfiles.some(p=>p.id===c.profileId))views.push({key:'n/'+c.token,payload:JSON.stringify({profileId:c.profileId})});
   let group=[],groupSize=0;const flush=()=>{if(group.length){commands.push(env.DB.prepare("INSERT INTO card_public_views (view_key,owner_id,payload) SELECT json_extract(value,'$.key'),?,json_extract(value,'$.payload') FROM json_each(?) WHERE EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=? AND save_token=?)").bind(ownerId,JSON.stringify(group),ownerId,saveToken));group=[];groupSize=0;}};
   for(const view of views){const size=new TextEncoder().encode(JSON.stringify(view)).length;if(groupSize+size>1000000)flush();group.push(view);groupSize+=size;}flush();
   const recordGuard='EXISTS (SELECT 1 FROM card_workspaces WHERE owner_id=? AND save_token=?)';
   commands.push(...projectionStatements(env.DB,ownerId,packed.state,recordGuard,[ownerId,saveToken]));
   commands.push(env.DB.prepare('INSERT INTO card_projection_versions(owner_id,version) SELECT owner_id,version FROM card_workspaces WHERE owner_id=? AND save_token=? ON CONFLICT(owner_id) DO UPDATE SET version=excluded.version').bind(ownerId,saveToken));
   commands.push(...additionalStatements(env.DB,recordGuard,[ownerId,saveToken]));
   const results=await env.DB.batch(commands),saved=results[0]?.results?.[0];
 return saved?.version||null;
}
