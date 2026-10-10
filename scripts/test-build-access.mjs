import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/components/MobileChatApp.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('MobileChatApp.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
function visit(n){if(ts.isJsxAttribute(n)&&n.name.text==='onBuild')callback=n.initializer.expression;ts.forEachChild(n,visit);}visit(ast);assert(callback);
const code=ts.transpileModule('return '+callback.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const [authLoading,subscriptionLoading,hasBoost,isAdmin,expected] of [[true,false,false,false,'wait'],[false,true,false,false,'wait'],[false,false,false,false,'modal'],[false,false,true,false,'build'],[false,false,false,true,'build']]){
 const calls=[];const cb=new Function('authLoading','subscriptionLoading','hasBoost','isAdmin','openCheckout','navigate','isAppBuilderDesktopAvailable',code)(authLoading,subscriptionLoading,hasBoost,isAdmin,(...args)=>calls.push(['modal',...args]),(...args)=>calls.push(['build',...args]),()=>true);cb();cb();
 assert.equal(calls.length,expected==='wait'?0:2);if(calls.length){assert.equal(calls[0][0],expected);assert.equal(calls[0][1],expected==='build'?'/build':undefined);if(expected==='modal')assert.equal(calls[0][2],'app_builder');}
}
const mobileCalls=[];
const mobile=new Function('authLoading','subscriptionLoading','hasBoost','isAdmin','openCheckout','navigate','isAppBuilderDesktopAvailable',code)(false,false,false,false,(...args)=>mobileCalls.push(['checkout',...args]),(...args)=>mobileCalls.push(['notice',...args]),()=>false);
mobile();
assert.deepEqual(mobileCalls,[['notice','/build',{state:{returnTo:'/'}}]],'mobile opens the guarded desktop notice without starting checkout/build');
console.log('Actual Build callback checks passed: desktop auth/entitlement loading, repeated free/Boost/admin actions, and mobile guarded notice without checkout.');
