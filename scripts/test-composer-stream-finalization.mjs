import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/hooks/useStreamingWithContinuation.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('hook.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'useStreamingWithContinuation');
assert.ok(declaration);
const code = ts.transpileModule(`${declaration.getText(ast).replace('export ', '')}; return useStreamingWithContinuation;`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const selections = [];
class Provider {
  constructor(selection) { selections.push(selection); }
  async sendMessageStreaming(_messages, _profile, _canvas, _code, start, delta, done) {
    start('code'); delta('const answer = 42;');
    void done({ mode: 'code', content: 'const answer = 42;', language: 'js', modelUsed: 'gpt-6-luna', reasoningEffortUsed: 'medium' });
  }
}
const hook = new Function('useRef','useCallback','AIService','isCodeComplete','mergeCodeContinuation','createContinuationPrompt','console',code)(
  value=>({current:value}), fn=>fn, Provider, ()=>true, (a,b)=>a+b, ()=>'', {log(){},warn(){}},
)();
let release, completed = false, result;
const pending = hook.streamWithContinuation({messages:[{role:'user',content:'code fixture'}],forceCanvas:false,forceCode:true,modelSelection:'gpt-6.1-sol',
  onDone: value=>{result=value;return new Promise(resolve=>{release=resolve})},
}).then(()=>{completed=true});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(completed,false,'Queue admission waits for async result/persistence completion');
assert.equal(result.reasoningEffortUsed,'medium');
assert.equal(selections[0],'gpt-6.1-sol');
release(); await pending; assert.equal(completed,true);
const errors=[];
await hook.streamWithContinuation({messages:[{role:'user',content:'code fixture'}],forceCanvas:false,forceCode:true,
  onDone:async()=>{throw new Error('Synthetic persistence failure')},onError:error=>errors.push(error),
});
assert.deepEqual(errors,['Synthetic persistence failure']);
console.log('Streaming finalization checks passed: wait for asynchronous result persistence, captured reasoning metadata and terminal error recovery.');

const savedSend = Provider.prototype.sendMessageStreaming;
Provider.prototype.sendMessageStreaming = async () => { throw new Error('Synthetic transport rejection'); };
const transportErrors = [];
await hook.streamWithContinuation({ messages: [{role:'user',content:'fixture'}], forceCanvas:false, forceCode:true,
  onError: value => transportErrors.push(value) });
assert.deepEqual(transportErrors, ['Synthetic transport rejection']);
const aborted = new AbortController(); aborted.abort();
await hook.streamWithContinuation({ messages:[{role:'user',content:'fixture'}],forceCanvas:false,forceCode:true,
  abortSignal:aborted.signal,onError:()=>{throw Error('Cancelled requests must stay quiet');} });
Provider.prototype.sendMessageStreaming = savedSend;
console.log('Streaming transport rejection and cancellation settle without stranding the composer.');
