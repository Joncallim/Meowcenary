#!/usr/bin/env node
/** Non-mutating builder -> committed PXO member parity for Mercenary art. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../../..');
const rows=[
  ['docs/art/scripts/build-mercenary-identity-icons-atlas.lua','assets-src/characters/identity/source/mercenary-identity-icons-atlas.pxo'],
];
const members=(path)=>execFileSync('unzip',['-Z1',path],{encoding:'utf8'}).split('\n').filter(Boolean).sort();
const bytes=(path,member)=>execFileSync('unzip',['-p',path,member],{encoding:'buffer'});
const temporary=mkdtempSync(join(tmpdir(),'meow-mercenary-identity-'));
try{
  for(const [builder,source] of rows){
    const generated=join(temporary,source.split('/').at(-1)); const committed=join(root,source);
    execFileSync('lua',['docs/art/scripts/validate-builders.lua','--only',builder,'--write-to',generated],{cwd:root,stdio:'pipe'});
    const a=members(generated),b=members(committed);if(a.join('\n')!==b.join('\n'))throw new Error(`${source} member set differs from builder`);
    for(const member of b)if(!member.endsWith('/')&&!bytes(generated,member).equals(bytes(committed,member)))throw new Error(`${source} member ${member} differs from builder`);
  }
}finally{rmSync(temporary,{recursive:true,force:true});}
