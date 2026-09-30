const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const file='src/components/AuthModal.tsx';
const baseline=execFileSync('git',['show',`${process.argv[2]||'ab9228c5'}:${file}`],{encoding:'utf8'});
function handlers(text){
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const declarations={},events=[];
  function visit(node){
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&/^(handle|onSubmit)/.test(node.name.text))declarations[node.name.text]=node.getText(source);
    if(ts.isJsxAttribute(node)&&/^on[A-Z]/.test(node.name.getText(source)))events.push(node.getText(source));
    ts.forEachChild(node,visit);
  }
  visit(source);return {declarations,events};
}
const before=handlers(baseline),after=handlers(readFileSync(file,'utf8'));
assert.ok(Object.keys(before.declarations).length>=4);assert.ok(before.events.length>=10);
assert.deepEqual(after,before);
console.log(`Auth modal parity passed: ${Object.keys(before.declarations).length} handler declarations and ${before.events.length} event bindings match ${process.argv[2]||'ab9228c5'}.`);
