const assert=require('node:assert/strict');
const fs=require('node:fs');const {execFileSync}=require('node:child_process');const ts=require('typescript');
const path='src/components/PWAInstallPrompt.tsx';
const old=execFileSync('git',['show',`862d2520:${path}`],{encoding:'utf8'});
const current=fs.readFileSync(path,'utf8');const view=fs.readFileSync('src/components/NotificationPromptView.tsx','utf8');
const parse=s=>ts.createSourceFile('view.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const printer=ts.createPrinter({removeComments:true});
const print=(node,file)=>printer.printNode(ts.EmitHint.Unspecified,node,file).replace(/SupportTicket/g,'Ticket');
function logic(source){const file=parse(source);const fn=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='PWAInstallPrompt');return fn.body.statements.slice(0,-1).filter(n=>!(ts.isIfStatement(n)&&print(n.expression,file)==='!show')).map(n=>print(n,file));}
assert.deepEqual(logic(current),logic(old),'Auth/admin branches, state, queries, create handler, email, and navigation guard must match');
function bindings(source){const file=parse(source),result=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.text)&&n.initializer)result.push(n.name.text+':'+print(n.initializer,file));ts.forEachChild(n,visit);}visit(file);return result.sort();}
assert.deepEqual([...bindings(current),...bindings(view)].sort(),bindings(old),'Every event binding must retain its original expression');
console.log('Notification auth/permission gates, cooldown timer, storage and enable/dismiss handlers match 862d2520. Only the !show early return is removed to retain native inert exit.');
