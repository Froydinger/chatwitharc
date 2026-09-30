// Execute the committed formulas, rather than restating their implementation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const baseline = process.argv[2];
assert.ok(baseline, 'Explicit baseline revision required');
const previous = cp.execFileSync('git', ['show', `${baseline}:src/components/ChatInput.tsx`], {encoding:'utf8'});
const formulas = [...previous.matchAll(/const (dockBottom|bottom) = rect\n([\s\S]+?);/g)];
assert.equal(formulas.length, 5, 'All five original dock formulas');
const source = fs.readFileSync('src/hooks/chat-input/useComposerViewport.ts','utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleForTest = {exports:{}};
new Function('require','module','exports',js)(require,moduleForTest,moduleForTest.exports);
const {composerDockStyle} = moduleForTest.exports;
let checks = 0;
for(const height of [400,650,915,1200]) for(const rect of [null,{top:300,left:18,width:376},{top:1100,left:150,width:760}]) {
  for(const docs of [false,true]) for(const images of [false,true]) for(const git of [false,true]) for(const imageMode of [false,true]) {
    const offsets = [
      {previewStack:docs?100:0,offset:12+(docs?100:0),fallback:110+(docs?100:0)},
      {imgStack:images?220:0,offset:12+(images?220:0),fallback:110+(images?220:0)},
      {offset:12,fallback:110},
      {previewStack:(docs?80:0)+(images?90:0),gitOffset:git?54:0,imageDockOffset:imageMode&&!images?116:0},
      {previewStack:(docs?80:0)+(images?90:0)},
    ];
    offsets[3].offset=8+offsets[3].previewStack+offsets[3].gitOffset+offsets[3].imageDockOffset;
    offsets[3].fallback=120+offsets[3].previewStack+offsets[3].gitOffset+offsets[3].imageDockOffset;
    offsets[4].offset=10+offsets[4].previewStack;offsets[4].fallback=100+offsets[4].previewStack;
    formulas.forEach((formula,index)=>{
      const vars=offsets[index];
      const bottom=new Function('rect','window','previewStack','imgStack','gitOffset','imageDockOffset',`${formula[0]}return ${formula[1]};`)(rect,{innerHeight:height},vars.previewStack,vars.imgStack,vars.gitOffset,vars.imageDockOffset);
      const expected=rect?{left:`${rect.left}px`,width:`${rect.width}px`,bottom}:{bottom};
      assert.deepEqual(composerDockStyle(rect,height,vars.offset,vars.fallback),expected);checks++;
    });
  }
}
console.log(`${checks} composer anchor comparisons matched all five committed formulas, including clamp and safe-area fallback.`);
