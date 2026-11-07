import {z} from 'zod';
import {cardDocSchema,defaultBlocks,type CardDoc} from './model';
export const PERSONAL_BLOCKS=['header','contact','about','social','services','button','location','custom','divider'] as const;
export const personalSaveSchema=z.object({
 version:z.number().int().min(0),
 action:z.enum(['save','publish','unpublish']),
 pixels:z.string().length(82944).regex(/^[A-Za-z0-9+/]+$/).optional(),
 doc:cardDocSchema
}).strict().superRefine((v,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 if(v.doc.companyName||v.doc.companyLogo)fail('Personal cards do not belong to a company.');
 if(v.doc.blocks.length>20)fail('The personal pilot supports up to 20 blocks.');
 if(new Set(v.doc.blocks.map(b=>b.id)).size!==v.doc.blocks.length)fail('Block IDs must be unique.');
 if(v.doc.blocks.some(b=>!PERSONAL_BLOCKS.includes(b.type as typeof PERSONAL_BLOCKS[number])))fail('Image blocks are unavailable until upload screening is ready.');
 if([v.doc.coverImage,v.doc.backgroundImage].some(Boolean))fail('Uploads are unavailable until screening is ready.');
 if(!v.doc.name.trim())fail('Enter your name before saving.');
 if(v.action==='publish'&&!v.doc.blocks.some(b=>b.type==='header'))fail('Add a profile header before publishing.');
});
export function newPersonalDoc():CardDoc{
 return {name:'',role:'',email:'',phone:'',website:'',companyName:'',accent:'#087f8c',template:'professional',fontFamily:'system',textSize:16,blocks:defaultBlocks()};
}

