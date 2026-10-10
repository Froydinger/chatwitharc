import assert from 'node:assert/strict';import{readFileSync,existsSync,readdirSync}from'node:fs';import{createHash}from'node:crypto';import ts from'typescript';import postcss from'postcss';
const root=new URL('../',import.meta.url);const read=p=>readFileSync(new URL(p,root),'utf8');const base=process.env.WORKSPACE_BASELINE_DIR;
const protectedFiles=['src/hooks/useOpenAIRealtime.tsx','src/hooks/useAudioCapture.tsx','src/hooks/useAudioPlayback.tsx','src/hooks/useCameraCapture.tsx','src/store/useVoiceModeStore.ts','src/lib/realtimeBrowserTransport.ts','src/lib/voiceToolCue.ts','src/constants/voices.ts','src/pages/VoiceLabPage.tsx','src/components/LiveVoiceTranscript.tsx','src/hooks/useSubscription.tsx','src/store/useModelStore.ts','src/store/useImageGenStore.ts','src/utils/platform.ts','src/services/ai.ts'];
function declarations(source,names){const ast=ts.createSourceFile('source.tsx',source,99,true,4);const found={};function visit(n){if((ts.isVariableDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name&&names.includes(n.name.getText(ast)))found[n.name.getText(ast)]=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);return found}
if(base){for(const file of protectedFiles){assert(existsSync(new URL(file,root)),file);assert.equal(read(file),readFileSync(`${base}/${file}`,'utf8'),`protected ${file}`)}
 const names=['FREE_VOICE_SESSION_DURATION_MS','DEFAULT_CORE_SYSTEM_PROMPT','ARC_VOICE_IDENTITY_CONTEXT','ARC_VOICE_STYLE_CONTEXT','ARC_VOICE_PRODUCT_CONTEXT','buildVoiceSystemPrompt','summarizeRecentChats','summarizeVoiceTurns','startPushToTalk','endPushToTalk','handleCameraFrame','MIN_FRAME_INTERVAL_MS'];
 const original=declarations(readFileSync(`${base}/src/components/VoiceModeController.tsx`,'utf8'),names);assert(Object.keys(original).length>=10);assert.deepEqual(declarations(read('src/components/VoiceModeController.tsx'),names),original,'prompts, audio timing, session limit, interruption and camera parameters remain exact');
 const controls=['handleMuteToggle','handleCameraToggle','handleCameraSwitch','handleReconnect','handleAttachClick','handleFileChange','handleConfirmVoiceSwitch'];
 assert.deepEqual(declarations(read('src/components/VoiceModeOverlay.tsx'),controls),declarations(readFileSync(`${base}/src/components/VoiceModeOverlay.tsx`,'utf8'),controls),'existing overlay handlers reused exactly');
 console.log(`PASS ${protectedFiles.length} protected voice/model/entitlement files and controller prompt/tuning/control declarations match baseline byte-for-byte.`);
}
const overlay=read('src/components/VoiceModeOverlay.tsx'),host=read('src/workspace/WorkspaceVoiceHost.tsx'),rollout=read('src/workspace/voiceRollout.ts');
assert(host.includes('<VoiceModeController conversation={conversation || undefined} requireConversation />'));
assert(read('src/components/VoiceModeController.tsx').includes('if (isActive && requireConversation && (!conversation || !conversation.isCurrent())) return;'));
assert(rollout.includes('VITE_WORKSPACE_VOICE_UI_ENABLED'));assert(!rollout.includes('hasBoost'));
assert(overlay.includes('WorkspaceVoiceTranscript'));assert(!overlay.includes('SimulatedVoice'));
assert(read('src/workspace/WorkspaceVoiceVisual.tsx').includes('data-amplitude={level}'));assert(!read('src/workspace/WorkspaceVoiceVisual.tsx').includes('setInterval'));
postcss.parse(read('src/workspace/workspace-voice.css'));
for(const name of readdirSync(new URL('src/workspace/',root)).filter(n=>/\.tsx?$/.test(n))){const source=read(`src/workspace/${name}`);assert.deepEqual(ts.createSourceFile(name,source,99,true,name.endsWith('.tsx')?4:3).parseDiagnostics,[],name)}
console.log('PASS exclusive authenticated host, activation-owner barrier, independent design rollback, actual-amplitude rendering and Workspace syntax/CSS.');
