// Only fixed-size RGB pixels are retained. Original files and metadata never reach storage.
const W=144,H=144,N=W*H*3;
const u32=n=>Uint8Array.of(n>>>24,(n>>>16)&255,(n>>>8)&255,n&255);
const join=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
function crc(bytes){let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^(n&1?0xedb88320:0);}return(n^0xffffffff)>>>0;}
function chunk(name,data){const body=join([new TextEncoder().encode(name),data]);return join([u32(data.length),body,u32(crc(body))]);}
function decode(s){return Uint8Array.from(atob(s),x=>x.charCodeAt(0));}
function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
async function png(rgb){
 if(rgb.length!==N)throw Error('Invalid photo dimensions.');
 const scan=new Uint8Array(N+H);for(let y=0;y<H;y++)scan.set(rgb.subarray(y*W*3,(y+1)*W*3),y*(W*3+1)+1);
 const compressed=new Uint8Array(await new Response(new Blob([scan]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 return 'data:image/png;base64,'+encode(join([Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',join([u32(W),u32(H),Uint8Array.of(8,2,0,0,0)])),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]));
}
export async function photoFromPixels(data){
 if(typeof data!=='string'||data.length!==82944||!/^[A-Za-z0-9+/]+$/.test(data))throw Error('Invalid photo pixels. Choose the photo again.');
 return png(decode(data));
}
export async function canonicalPhoto(data){
 // Accept previously generated photos for Undo/Redo, after bounded decoding and reconstruction.
 if(!data.startsWith('data:image/png;base64,')||data.length>100000)throw Error('Choose your photo using the photo upload control.');
 const bytes=decode(data.slice(22));if(![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))throw Error('Invalid photo.');
 let pos=8,idat=null;
 for(const name of ['IHDR','IDAT','IEND']){
  if(pos+12>bytes.length)throw Error('Invalid photo.');
  const view=new DataView(bytes.buffer,bytes.byteOffset+pos),len=view.getUint32(0);
  if(len>70000||pos+12+len>bytes.length)throw Error('Invalid photo.');
  const kind=String.fromCharCode(...bytes.subarray(pos+4,pos+8)),content=bytes.subarray(pos+8,pos+8+len);
  if(kind!==name||crc(bytes.subarray(pos+4,pos+8+len))!==view.getUint32(8+len))throw Error('Invalid photo.');
  if(name==='IHDR'&&(len!==13||content.some((b,i)=>b!==join([u32(W),u32(H),Uint8Array.of(8,2,0,0,0)])[i])))throw Error('Use a supported profile photo.');
  if(name==='IDAT')idat=content;
  if(name==='IEND'&&len!==0)throw Error('Invalid photo.');
  pos+=len+12;
 }
 if(pos!==bytes.length||!idat)throw Error('Invalid photo.');
 const reader=new Blob([idat]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),parts=[];let total=0;
 while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>N+H){await reader.cancel();throw Error('Photo exceeded its decoded limit.');}parts.push(value);}
 const scan=join(parts);if(scan.length!==N+H)throw Error('Invalid photo.');
 const rgb=new Uint8Array(N);for(let y=0;y<H;y++){if(scan[y*(W*3+1)]!==0)throw Error('Unsupported photo encoding.');rgb.set(scan.subarray(y*(W*3+1)+1,(y+1)*(W*3+1)),y*W*3);}
 return png(rgb);
}

