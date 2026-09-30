const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const baseline=process.argv[2]||'7b3f51db';
const printer=ts.createPrinter({removeComments:true});
function parse(file,text){return ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function events(source){const result=[];function visit(node){if(ts.isJsxAttribute(node)&&/^on[A-Z]/.test(node.name.getText(source)))result.push(printer.printNode(ts.EmitHint.Unspecified,node,source));ts.forEachChild(node,visit);}visit(source);return result;}
for(const file of ['src/components/MobileChatApp.tsx','src/components/app-builder/AppBuilderWorkspace.tsx']){
  const before=parse(file,execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}));const after=parse(file,readFileSync(file,'utf8'));assert.deepEqual(events(after),events(before));console.log(`${file}: all ${events(before).length} event bindings match ${baseline}.`);
}
const file='src/components/CanvasPanel.tsx';
const before=parse(file,execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}));const after=parse(file,readFileSync(file,'utf8'));
assert.deepEqual(events(after).filter(e=>!e.startsWith('onRestore=')),events(before).filter(e=>!e.includes('restoreVersion(index)')));
function history(source){let result;function visit(node){if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(source)==='className'&&p.initializer&&ts.isStringLiteral(p.initializer)&&p.initializer.text==='w-[200px] h-full flex flex-col'))result=printer.printNode(ts.EmitHint.Unspecified,node,source);ts.forEachChild(node,visit);}visit(source);return result;}
const view=parse('history.tsx',readFileSync('src/components/CanvasVersionHistory.tsx','utf8'));assert.ok(history(before));assert.equal(history(view).replace('onRestore(index)','restoreVersion(index)'),history(before));
console.log('Canvas editor event bindings and extracted history contents match the previous release; only the restore callback port changes its name.');
