import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const load=(file,aliases={})=>{const exports={};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('exports','require',code)(exports,name=>aliases[name]??require(name));return exports;};
const boost=load('src/components/BoostIcon.tsx');
const {WorkspaceChatWorkToggle}=load('src/components/chat-input/WorkspaceChatWorkToggle.tsx',{'@/components/BoostIcon':boost});
for(const mode of ['ask','auto'])for(const hasBoost of [false,true]){
  let calls=0;
  const element=WorkspaceChatWorkToggle({mode,hasBoost,onToggle:()=>calls++});
  const buttons=React.Children.toArray(element.props.children);
  assert.equal(element.props['aria-label'],'Chat or Work');
  assert.equal(buttons[0].props['aria-pressed'],mode==='ask');
  assert.equal(buttons[1].props['aria-pressed'],mode==='auto');
  assert.equal(buttons[1].props['aria-label'],'Work (Boost)');
  buttons[mode==='ask'?0:1].props.onClick();assert.equal(calls,0,'selected segment is a no-op');
  buttons[mode==='ask'?1:0].props.onClick();assert.equal(calls,1,'changing segment invokes the original owner once');
  const html=renderToStaticMarkup(element);
  assert.ok(html.includes(`aria-label="${hasBoost?'Boost active':'Get Boost'}"`));
}
const input=readFileSync('src/components/ChatInput.tsx','utf8');
assert.ok(input.includes('onWorkModeToggle && <WorkspaceChatWorkToggle mode={cloudExecutionMode} onToggle={onWorkModeToggle} hasBoost={hasBoost || isAdmin} />'));
console.log('PASS real Chat/Work pill: exact selected state, no-op repeat, original toggle callback, unchanged caller entitlement/admin state and Boost icon labels.');
