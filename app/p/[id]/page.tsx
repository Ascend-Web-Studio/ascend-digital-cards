import {loadWorkspace} from '@/lib/server';
import {notFound} from 'next/navigation';
import {CardView} from '@/app/card-view';
export const dynamic='force-dynamic';
export const revalidate=0;
export default async function ProfilePage({params}:{params:Promise<{id:string}>}){const {id}=await params;const s=await loadWorkspace(`/p/${id}`);const p=s?.profiles.find(p=>p.id===id&&!p.archived);if(!p?.live)notFound();return <main className="standalone-card"><div className="preview-disclosure">Private workspace preview · published revision</div><CardView doc={p.live} contactUrl={`/p/${p.id}/contact.vcf`}/><a className="back-studio" href="/">← Back to your studio</a></main>;}
