import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const roots = process.argv.slice(2).length ? process.argv.slice(2) : [process.cwd()];
for (const root of roots) {
 const source=fs.readFileSync(`${root}/src/components/AuthModal.tsx`,'utf8');
 const tree=ts.createSourceFile('AuthModal.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;
 function visit(node) { if(ts.isVariableDeclaration(node)&&node.name.getText(tree)==='handleGoogleAuth') handler=node.initializer.getText(tree); ts.forEachChild(node,visit); }
 visit(tree); assert.ok(handler);
 const compiled=ts.transpileModule(`globalThis.run = ${handler}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 for(const failure of [false,true]) {
  let calls=0, closes=0, redirects=0;const loading=[], errors=[];
  const location={};Object.defineProperty(location,'href',{set(){redirects++;}});
  const context={window:{location},isNativeIOS:()=>true,onClose:()=>closes++,setLoading:value=>loading.push(value),setAuthError:value=>errors.push(value),toast:()=>{},Error,signInWithGoogle:async()=>{calls++;return {data:{url:'https://accounts.google.com/oauth'},error:failure?new Error('cancelled'):null};}};
  vm.createContext(context);vm.runInContext(compiled,context);await context.run();
  assert.equal(calls,1);assert.equal(redirects,0);assert.deepEqual(loading,[true,false]);
  assert.equal(closes,!failure&&source.includes('if (isNativeIOS()) onClose();')?1:0);
  assert.equal(errors.at(-1),failure?'cancelled':null);
 }
 console.log(`${root}: successful/cancelled Google sign-in invokes one handoff, zero replay redirects`);
}
