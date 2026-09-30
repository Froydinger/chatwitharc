// Usage: node scripts/test-attachment-tray-parity.cjs <pre-extraction-revision>
// Compare rendered preview DOM and keep all footer actions in their original owner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cp=require('node:child_process');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const base=process.argv[2];assert.ok(base,'Explicit baseline required');
const path='src/components/ChatInput.tsx';
const previous=cp.execFileSync('git',['show',`${base}:${path}`],{encoding:'utf8'});
const source=ts.createSourceFile(path,previous,99,true,4);
const cards=[];
function visit(n){if(ts.isJsxElement(n)&&n.openingElement.attributes.getText(source).includes('rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3 mx-auto max-w-[760px]'))cards.push(n);ts.forEachChild(n,visit);}
visit(source);assert.equal(cards.length,2);
const [docs,images]=cards;
const sections=images.children.filter(n=>!ts.isJsxText(n)||n.text.trim());
assert.equal(sections.length,4);
const footer=sections.slice(2).map(n=>n.getText(source)).join('\n');
const current=fs.readFileSync(path,'utf8');
assert.ok(current.includes(footer),'Mode/access/video/options callbacks must remain unchanged in the composer');
const imageMarkup=images.openingElement.getText(source)+sections.slice(0,2).map(n=>n.getText(source)).join('\n')+'{children}</div>';
function load(text){const compiled=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};new Function('require','module','exports',compiled)(require,module,module.exports);return module.exports;}
const old=load(`import {FileText,X} from 'lucide-react'; export function OldDocuments({selectedDocuments,setSelectedDocuments,removeDocument}){return (${docs.getText(source)})} export function OldImages({selectedImages,imagePreviewUrls,clearSelected,removeImage,children}){return (${imageMarkup})}`);
const {AttachmentTray}=load(fs.readFileSync('src/components/chat-input/AttachmentTray.tsx','utf8'));
const noop=()=>{};
const child=React.createElement('span',{'data-footer':'fixture'},'Existing controls');
for(const count of [0,1,3]){
 const files=Array.from({length:count},(_,i)=>new File(['x'.repeat(1200+i)],`file-${i}.pdf`,{type:'application/pdf'}));
 const before=React.createElement(old.OldDocuments,{selectedDocuments:files,setSelectedDocuments:noop,removeDocument:noop});
 const after=React.createElement(AttachmentTray,{kind:'documents',files,onClear:noop,onRemove:noop});
 assert.equal(renderToStaticMarkup(after),renderToStaticMarkup(before));
}
for(const count of [0,1,6]){
 const files=Array.from({length:count},(_,i)=>new File(['x'],`file-${i}.png`,{type:'image/png'}));
 const urls=files.map((_,i)=>`blob:local-fixture-${i}`);
 const before=React.createElement(old.OldImages,{selectedImages:files,imagePreviewUrls:urls,clearSelected:noop,removeImage:noop},child);
 const after=React.createElement(AttachmentTray,{kind:'images',files,previewUrls:urls,onClear:noop,onRemove:noop},child);
 assert.equal(renderToStaticMarkup(after),renderToStaticMarkup(before));
}
console.log('Attachment tray parity passed: exact rendered DOM for six file states, existing footer actions unchanged.');
