export const MAX_IMAGE_UPLOAD=8*1024*1024;
export function rasterMime(bytes:Uint8Array):string|null{
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
export async function prepareImage(file:File,kind:'logo'|'photo'|'cover'):Promise<string>{
 if(file.size>MAX_IMAGE_UPLOAD)throw Error('Please choose an image smaller than 8 MB.');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());const mime=rasterMime(bytes);
 if(!mime||file.type!==mime)throw Error('Choose a genuine PNG, JPEG or WebP image. SVG and animated images are not supported.');
 const bitmap=await createImageBitmap(file);try{
 if(bitmap.width*bitmap.height>24_000_000)throw Error('This image is too large. Choose an image below 24 megapixels.');
 const max=kind==='photo'?400:kind==='logo'?600:1200;const ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));const context=canvas.getContext('2d');if(!context)throw Error('Image processing is unavailable in this browser.');context.drawImage(bitmap,0,0,canvas.width,canvas.height);
 // WebP preserves transparent logos while stripping original metadata.
 for(const quality of [.86,.72,.55,.38]){const data=canvas.toDataURL('image/webp',quality);if(data.length<=100000)return data;}
 const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(canvas.width*.6));smaller.height=Math.max(1,Math.round(canvas.height*.6));smaller.getContext('2d')!.drawImage(canvas,0,0,smaller.width,smaller.height);const data=smaller.toDataURL('image/webp',.5);if(data.length>100000)throw Error('This photo is too detailed to store in the local demo. Choose a smaller image.');return data;
 }finally{bitmap.close();}
}
