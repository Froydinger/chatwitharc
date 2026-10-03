import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=fs.readFileSync('src/hooks/useWideNativeLayout.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
for (const [ios, standalone] of [[true,true],[true,false],[false,true]]) {
 const native = ios && standalone;
 const media=new EventTarget();media.matches=false;let state,cleanup;
 const context={exports:{},window:{matchMedia:()=>media},require:id=>id==='react'?{useState:()=>[false,value=>state=value],useEffect:fn=>cleanup=fn()}:{isIOSDevice:()=>ios,isStandaloneRuntime:()=>standalone}};
 vm.createContext(context);vm.runInContext(compiled,context);context.exports.useWideNativeLayout();assert.equal(state,false);
 media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(state,native);
 media.matches=false;media.dispatchEvent(new Event('change'));assert.equal(state,false);
 cleanup();media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(state,false);
}
console.log('Wide native layout responds to open/closed viewport changes, excludes ordinary web, and removes its listener.');
