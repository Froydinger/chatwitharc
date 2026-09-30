const assert=require('node:assert/strict');
const fs=require('node:fs');const {execFileSync}=require('node:child_process');const ts=require('typescript');
const path='src/components/support/AdminTicketList.tsx';
const old=execFileSync('git',['show',`c9b2be9c:${path}`],{encoding:'utf8'});
const current=fs.readFileSync(path,'utf8');const view=fs.readFileSync('src/components/support/AdminSupportTicketView.tsx','utf8');
const parse=s=>ts.createSourceFile('view.tsx',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const printer=ts.createPrinter({removeComments:true});
const print=(node,file)=>printer.printNode(ts.EmitHint.Unspecified,node,file).replace(/AdminSupportTicket/g,'Ticket').replace(/SupportUserInfo/g,'UserInfo');
function logic(source){const file=parse(source);const fn=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='AdminTicketList');return fn.body.statements.slice(0,-2).map(n=>print(n,file));}
assert.deepEqual(logic(current),logic(old),'Auth/admin branches, state, queries, create handler, email, and navigation guard must match');
function bindings(source){const file=parse(source),result=[];function visit(n){if(ts.isJsxAttribute(n)&&/^on[A-Z]/.test(n.name.text)&&n.initializer)result.push(n.name.text+':'+print(n.initializer,file));ts.forEachChild(n,visit);}visit(file);return result.sort();}
assert.deepEqual([...bindings(current),...bindings(view)].sort(),bindings(old),'Every event binding must retain its original expression');
const oldFile=parse(old);const oldFn=oldFile.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AdminTicketList');
const oldFilter=oldFn.body.statements.at(-2).declarationList.declarations[0].initializer;
const filterFile=parse(fs.readFileSync('src/components/support/adminTicketFilter.ts','utf8'));
const filterFn=filterFile.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='filterAdminSupportTickets');
assert.equal(print(filterFn.body.statements[0].expression,filterFile),print(oldFilter,oldFile),'Actual ticket filtering predicate must match');
console.log('Admin support controller statements, queries, email/create handlers, authorization branches and all event bindings match c9b2be9c.');
