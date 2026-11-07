import {loadWorkspace} from '@/lib/server';
import {notFound,redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function NfcPage({params}:{params:Promise<{token:string}>}){const {token}=await params;const s=await loadWorkspace(`/n/${token}`);const c=s?.cards.find(c=>c.token===token&&c.status==='assigned');const p=s?.profiles.find(p=>p.id===c?.profileId&&!p.archived&&p.live);if(!p)notFound();redirect(`/p/${p.id}`);}
