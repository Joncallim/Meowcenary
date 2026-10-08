import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const source = resolve(process.argv[2]);
const output = join(dirname(source), 'brass-boar-idle-native.png');
const lua = `local s=dofile(os.getenv('BRASS_BOAR_IDLE_SOURCE')); assert(#s.frames==1, 'idle preview must contain one frame'); local p={}; for y,row in pairs(s.frames[1]) do assert(type(y)=='number' and y%1==0 and y>=0 and y<48); local rest=row:gsub('(%d+):(%d+):(%d+)', function(a,b,i) a=tonumber(a); b=tonumber(b); i=tonumber(i); assert(a<=b and a>=0 and b<48); local c=assert(s.palette[i]); assert(c:match('^#%x%x%x%x%x%x%x%x$')); for x=a,b do local k=y*48+x; assert(not p[k], 'overlapping native runs'); p[k]=c:sub(2) end; return '' end); assert(rest:match('^;*$'), 'invalid row encoding') end; for k=0,2303 do io.write(p[k] or '00000000') end`;
const raw = Buffer.from(execFileSync('lua', ['-e', lua], { env: { ...process.env, BRASS_BOAR_IDLE_SOURCE: source }, encoding:'utf8' }), 'hex');
if (raw.length !== 48*48*4) throw Error('Invalid native RGBA size');
let count=0, bounds=[48,48,-1,-1];
for(let y=0;y<48;y++) for(let x=0;x<48;x++) if(raw[(y*48+x)*4+3]) { if(x===0||y===0||x===47||y===47) throw Error('Opaque border'); count++; bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x),Math.max(bounds[3],y)]; }
const scan=Buffer.alloc(48*(1+48*4)); for(let y=0;y<48;y++) raw.copy(scan,y*(1+48*4)+1,y*48*4,(y+1)*48*4);
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function chunk(type,data){const name=Buffer.from(type);const header=Buffer.alloc(8);header.writeUInt32BE(data.length);name.copy(header,4);let c=0xffffffff;for(const b of Buffer.concat([name,data]))c=crcTable[(c^b)&255]^(c>>>8);const tail=Buffer.alloc(4);tail.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([header,data,tail]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(48);ihdr.writeUInt32BE(48,4);ihdr[8]=8;ihdr[9]=6;
writeFileSync(output, Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]));
writeFileSync(join(dirname(source),'brass-boar-idle-native.rgba'),raw);
console.log(JSON.stringify({source,output,width:48,height:48,opaquePixels:count,boundsInclusive:bounds,pngSha256:createHash('sha256').update(readFileSync(output)).digest('hex')}));
