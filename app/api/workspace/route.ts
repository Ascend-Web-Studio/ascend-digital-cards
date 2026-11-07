import { env } from 'cloudflare:workers';
import { seedState,workspaceSchema } from '@/lib/model';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(){
  const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to access this workspace.'},{status:401,headers});
  try{const row=await env.DB.prepare('SELECT payload,version FROM card_workspaces WHERE owner_id=?').bind(user.userId).first<{payload:string,version:number}>();return Response.json({state:row?JSON.parse(row.payload):seedState(),version:row?.version??0},{headers});}
  catch(e){console.error('workspace_read_failed',e instanceof Error?e.message:'unknown');return Response.json({error:'Workspace could not be loaded. Please retry.'},{status:503,headers});}
}
export async function PUT(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to save.'},{status:401,headers});
  const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)return Response.json({error:'Unexpected request origin.'},{status:403,headers});
  try{
    const text=await request.text();if(text.length>1_500_000)return Response.json({error:'Workspace exceeds the pilot size limit.'},{status:413,headers});
    const body=JSON.parse(text);if(!Number.isSafeInteger(body.version)||body.version<0)return Response.json({error:'Invalid save version.'},{status:400,headers});
    const parsed=workspaceSchema.safeParse(body.state);if(!parsed.success)return Response.json({error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).slice(0,3).join(' ')},{status:400,headers});
    const row=await env.DB.prepare('INSERT INTO card_workspaces (owner_id,payload,version,updated_at) VALUES (?,?,1,?) ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload,version=card_workspaces.version+1,updated_at=excluded.updated_at WHERE card_workspaces.version=? RETURNING version').bind(user.userId,JSON.stringify(parsed.data),new Date().toISOString(),body.version).first<{version:number}>();
    if(!row)return Response.json({error:'This workspace changed in another tab. Export your draft before reloading.'},{status:409,headers});return Response.json({version:row.version},{headers});
  }catch(e){console.error('workspace_save_failed',e instanceof Error?e.message:'unknown');return Response.json({error:'Save failed. Your unsaved work is still on screen.'},{status:500,headers});}
}
