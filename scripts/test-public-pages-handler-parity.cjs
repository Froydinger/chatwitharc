const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
const baseline=process.argv[2]||'315c82d8';
for(const file of ['src/pages/BlogIndexPage.tsx','src/pages/DocsPage.tsx','src/pages/DownloadPage.tsx']) {
  function extract(text){
    const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const declarations={},events=[];
    function visit(node){
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&/^(handle|categories$|articles$|filtered|CATEGORIES$|categoryList$|featuredPost$|trendingPosts$|currentInfo$)/.test(node.name.text))declarations[node.name.text]=node.getText(source);
      if(ts.isFunctionDeclaration(node)&&node.name&&/^(getCategory|getReadTime|formatDate)/.test(node.name.text))declarations[node.name.text]=node.getText(source);
      if(ts.isJsxAttribute(node)&&/^on[A-Z]/.test(node.name.getText(source)))events.push(node.getText(source));
      ts.forEachChild(node,visit);
    }
    visit(source);return {declarations,events};
  }
  const before=extract(execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}));
  const after=extract(readFileSync(file,'utf8'));assert.ok(before.events.length>=3);assert.ok(Object.keys(before.declarations).length>=1);assert.deepEqual(after,before);
  console.log(`${file}: filter/content/handler declarations and ${before.events.length} event bindings match ${baseline}.`);
}
