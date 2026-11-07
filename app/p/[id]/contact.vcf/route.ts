import {loadWorkspace} from '@/lib/server';
import {vcard} from '@/lib/model';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const s=await loadWorkspace(`/p/${id}/contact.vcf`);const p=s?.profiles.find(p=>p.id===id&&!p.archived);if(!p?.live)return new Response('Profile unavailable',{status:404,headers:{'Cache-Control':'no-store'}});return new Response(vcard(p.live),{headers:{'Content-Type':'text/vcard; charset=utf-8','Content-Disposition':'attachment; filename="contact.vcf"','Cache-Control':'no-store'}});}
