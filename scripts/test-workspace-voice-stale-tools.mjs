import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/components/VoiceModeController.tsx',import.meta.url),'utf8');const ast=ts.createSourceFile('controller.tsx',source,99,true,4);
function callback(name,context){let target;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)target=n.initializer.arguments[0];ts.forEachChild(n,visit)}visit(ast);assert(target,name);const code=ts.transpileModule(`return (${target.getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(context),code)(...Object.values(context))}
for(const name of ['handleImageGenerate','handleWebSearch','handleGetWeather','handleSearchPastChats','handleCreateScheduledTask']){
 let current=true,release;const pending=new Promise(resolve=>release=resolve);const updates=[];const update=key=>value=>updates.push([key,value]);
 const context={conversation:{isCurrent:()=>current,sessionId:'original'},useVoiceModeStore:{getState:()=>({isActive:true})},
 latestImageRunRef:{current:null},latestWebSearchRunRef:{current:null},latestPastChatSearchRunRef:{current:null},abortControllerRef:{current:null},
 setIsGeneratingImage:update('imageBusy'),setGeneratedImage:update('image'),setLastGeneratedImageUrl:update('lastImage'),setIsSearching:update('searchBusy'),setSearchSummary:update('search'),setIsFetchingWeather:update('weatherBusy'),setWeatherData:update('weather'),setIsSearchingPastChats:update('pastBusy'),setIsSchedulingTask:update('taskBusy'),
 getResolvedImageModel:()=> 'unchanged-model',flushTurnsBeforeCard:async()=>{},addMessage:async()=> 'owned-placeholder',replaceMessage:async()=>{},
 aiService:{generateImage:()=>pending,sendMessage:()=>pending},supabase:{functions:{invoke:()=>pending}},withTimeout:p=>p,searchAllPastChats:()=>pending,
 detectsLocationIntent:()=>false,isCurrentLocationRequest:()=>false,getCachedLocation:()=>null,getUserLocation:()=>{throw Error('No location allowed')},locationLabel:()=>'',formatLocationForContext:()=>'',profile:{},useArcStore:{getState:()=>({currentSessionId:'other'})}};
 const work=callback(name,context)('explicit request');await Promise.resolve();const before=updates.length;current=false;release({imageUrls:['private-image://old/image'],data:{content:'old result',location:'Old city'},content:'old reminder'});await work;
 assert.equal(updates.length,before,`${name}: stale call must not update new call's panels or busy state`);
}
console.log('PASS actual controller callback fixtures: late image, web search, weather, past-chat search and reminder completions cannot update a restarted call. Provider methods mocked; zero network or device calls.');
