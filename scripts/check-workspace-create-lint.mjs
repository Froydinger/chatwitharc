import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
const files=['MobileChatApp.tsx','ChatInput.tsx','GitModeDock.tsx','ImageOptionsDock.tsx','PromptEnhancer.tsx','PromptLibrary.tsx','CanvasPanel.tsx','CanvasVersionHistory.tsx','SearchCanvas.tsx','PublishModal.tsx','SiteManageModal.tsx','ImageModal.tsx','chat-input/AttachmentTray.tsx','chat-input/WorkspaceCreateDock.tsx'].map(name=>`src/components/${name}`).concat(['src/workspace/WorkspaceModeDialog.tsx','src/workspace/createDockLayout.ts','scripts/fixtures/workspace-create-modes/entry.tsx','scripts/fixtures/workspace-create-modes/mocks.tsx']);
const lint=new ESLint();
let newErrors=0,newWarnings=0,existingErrors=0,existingWarnings=0;
for(const file of files){
 const [current]=await lint.lintFiles([file]);
 let before='';try{before=execFileSync('git',['show',`251d889af61653983b82688fc1c310a0b2d62ebf:${file}`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{}
 const old=before?(await lint.lintText(before,{filePath:file}))[0].messages:[];
 const key=item=>`${item.severity}|${item.ruleId}|${item.message}`;
 const counts=new Map();for(const item of old)counts.set(key(item),(counts.get(key(item))||0)+1);
 for(const item of current.messages){const id=key(item);if(counts.get(id)>0){counts.set(id,counts.get(id)-1);if(item.severity===2)existingErrors++;else existingWarnings++;}else{console.log(`${file}:${item.line}:${item.column} NEW ${item.severity===2?'error':'warning'} ${item.ruleId}: ${item.message}`);if(item.severity===2)newErrors++;else newWarnings++;}}
}
console.log(JSON.stringify({newErrors,newWarnings,existingErrors,existingWarnings}));
process.exitCode=newErrors?1:0;
