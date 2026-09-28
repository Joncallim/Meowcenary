#!/usr/bin/env node
/** Deterministically export the two Mercenary identity PXOs to named atlases. */
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const definitions = [
  {
    source: 'assets-src/characters/identity/source/mercenary-portraits-atlas.pxo',
    runtime: 'public/assets/characters/identity', name: 'mercenary-portraits-atlas', size: 96,
    frames: ['scrap-tabby','bolt-hound','volt-lynx','brass-boar','ember-cougar','scrap-weasel','rattle-raptor','piston-ram'].map((id) => `character-portrait:${id}`),
  },
  {
    source: 'assets-src/characters/identity/source/mercenary-identity-icons-atlas.pxo',
    runtime: 'public/assets/characters/identity', name: 'mercenary-identity-icons-atlas', size: 32,
    frames: [
      'ability-icon:scrap-burst','ability-icon:giga-chomp','ability-icon:adrenaline','ability-icon:shield-flicker',
      'ability-icon:heat-vent','ability-icon:scavenge-pulse','ability-icon:precision-mark','ability-icon:overclock',
      'passive-icon:scrap-hoarder','passive-icon:quick-tail','passive-icon:light-paws','passive-icon:thick-hide',
      'passive-icon:ember-aura','passive-icon:magnet-belly','passive-icon:hunter-eye','passive-icon:hydraulic-core',
    ],
  },
];
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c=n; for(let k=0;k<8;k+=1)c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
const crc32 = (bytes) => { let c=0xffffffff; for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
const chunk = (type,data) => { const h=Buffer.alloc(8); h.writeUInt32BE(data.length); h.write(type,4); const t=Buffer.alloc(4); t.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type),data]))); return Buffer.concat([h,data,t]); };
const readPxo = (source, member, encoding) => execFileSync('unzip', ['-p', source, member], encoding ? { encoding } : undefined);
function exportAtlas(definition) {
  const source=join(root,definition.source); const runtime=join(root,definition.runtime);
  const project=JSON.parse(readPxo(source,'data.json','utf8')); const width=definition.frames.length*definition.size; const height=definition.size;
  if(project.size_x!==width||project.size_y!==height||!Array.isArray(project.layers)||!Array.isArray(project.frames)||project.frames.length!==1) throw new Error(`${definition.name} source must be one ${width}x${height} frame`);
  const rgba=Buffer.alloc(width*height*4);
  for(const [index,layer] of project.layers.entries()) {
    if(layer.visible!==true) continue;
    const pixels=readPxo(source,`image_data/frames/1/layer_${index+1}`);
    if(pixels.length!==rgba.length) throw new Error(`${definition.name} layer ${index+1} has invalid RGBA size`);
    for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;if(a===0)continue;const u=rgba[i+3]/255;const oa=a+u*(1-a);for(let c=0;c<3;c+=1)rgba[i+c]=Math.round((pixels[i+c]*a+rgba[i+c]*u*(1-a))/oa);rgba[i+3]=Math.round(oa*255);}
  }
  const rows=Buffer.alloc((width*4+1)*height); for(let y=0;y<height;y+=1)rgba.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
  const frames=Object.fromEntries(definition.frames.map((id,index)=>[id,{frame:{x:index*definition.size,y:0,w:definition.size,h:definition.size}}]));
  const json=Buffer.from(`${JSON.stringify({...project,export_directory_path:'',export_file_name:definition.name,frames},null,2)}\n`);
  const pngPath=join(runtime,`${definition.name}.png`); const jsonPath=join(runtime,`${definition.name}.json`);
  if(process.argv[2]==='--check'){if(!readFileSync(pngPath).equals(png))throw new Error(`${definition.name} PNG is out of date`);if(!readFileSync(jsonPath).equals(json))throw new Error(`${definition.name} JSON is out of date`);}
  else {mkdirSync(runtime,{recursive:true});writeFileSync(pngPath,png);writeFileSync(jsonPath,json);}
}
if(process.argv.length>3||(process.argv[2]&&process.argv[2]!=='--check'))throw new Error('Usage: export-mercenary-identity-atlases.mjs [--check]');
definitions.forEach(exportAtlas);
