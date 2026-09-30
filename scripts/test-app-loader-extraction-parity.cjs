const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const baseline=process.argv[2]||'22b2b6ce';
const file='src/App.tsx';
function statements(text){
  const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  return source.statements.filter(node=>!ts.isImportDeclaration(node)&&!(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>['FullscreenLoader','FastLoader'].includes(d.name.getText(source))))).map(node=>node.getText(source));
}
const before=statements(execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}));
const after=statements(readFileSync(file,'utf8'));assert.ok(before.length>4);assert.deepEqual(after,before);
console.log(`App extraction parity passed: all ${before.length} non-loader statements match ${baseline}, including routes, auth and providers.`);
