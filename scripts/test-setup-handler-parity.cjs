const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const baseline=process.argv[2]||'287f0345';
for(const file of ['src/components/OnboardingScreen.tsx','src/components/MacInstallPrompt.tsx']) {
  function extract(text){
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const handlers={},effects=[];
    function visit(node){
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&/^(handle|rememberDecision|DECISION_)/.test(node.name.text))handlers[node.name.text]=node.getText(source);
      if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect')effects.push(node.getText(source));
      ts.forEachChild(node,visit);
    }
    visit(source);return {handlers,effects};
  }
  const before=extract(execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}));
  const after=extract(readFileSync(file,'utf8'));assert.ok(Object.keys(before.handlers).length>=2);assert.deepEqual(after,before);
  console.log(`${file}: handlers, cooldown constants and effects match ${baseline}.`);
}
