import { env } from 'cloudflare:workers';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import type { State } from './model';
export async function loadWorkspace(returnTo:string){const user=await requireChatGPTUser(returnTo);const row=await env.DB.prepare('SELECT payload FROM card_workspaces WHERE owner_id=?').bind(user.userId).first<{payload:string}>();return row?JSON.parse(row.payload) as State:null;}
