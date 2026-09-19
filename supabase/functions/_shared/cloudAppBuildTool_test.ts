import { strict as assert } from 'node:assert';
import { cloudAppBuildTool, CLOUD_BUILD_APP_DEFINITION } from './cloudAppBuildTool.ts';
import type { ClaimedCloudRun } from './cloudRunWorker.ts';
const run = { id:'run', user_id:'owner', session_id:'session', mode:'auto' } as ClaimedCloudRun;
const files = [
  {path:'src/App.tsx',content:'export default function App(){return null}',language:'typescript'},
  {path:'src/main.tsx',content:"import App from './App'",language:'typescript'},
];
const payload = { title:'My app', prompt:'Build an app', files };
const call = (args: unknown) => ({id:'call',name:'build_app',arguments:JSON.stringify(args)});
Deno.test('build tool saves complete files with the same receipt and returns a real artifact', async () => {
  const artifact={projectId:'11111111-1111-4111-8111-111111111111',title:'My app',url:'/build/11111111-1111-4111-8111-111111111111'};
  let calls=0;
  const tool=cloudAppBuildTool({authorize:async()=>true,build:async(r,c,key,args)=>{
    calls++; assert.equal(r,run); assert.equal(key,'receipt'); assert.equal(args.files['src/App.tsx'].content,files[0].content); return artifact;
  }});
  const result=await tool.execute(run,call(payload),'receipt');
  assert.equal(calls,1); assert.equal(typeof result,'object');
  assert.deepEqual((result as any).presentation.app_artifact,artifact);
});
Deno.test('build rejects revoked access, malformed paths, missing entry and protected SDK writes before saving', async () => {
  let saves=0;
  for (const [authorized,args] of [
    [false,payload], [true,{...payload,files:[files[0]]}],
    [true,{...payload,files:[...files,{path:'../secret',content:'x',language:'text'}]}],
    [true,{...payload,files:[...files,{path:'src/lib/netlifyDb.ts',content:'x',language:'typescript'}]}],
    [true,{...payload,files:[...files,files[0]]}],
  ] as const) {
    const tool=cloudAppBuildTool({authorize:async()=>authorized,build:async()=>{saves++;return{};}});
    const result=await tool.execute(run,call(args),'receipt'); assert.equal(typeof result,'string');
    assert.equal(JSON.parse(result as string).saved,false);
  }
  assert.equal(saves,0);
});
Deno.test('save failures never return a successful app artifact', async()=>{
  const tool=cloudAppBuildTool({authorize:async()=>true,build:async()=>{throw Error('database unavailable');}});
  await assert.rejects(tool.execute(run,call(payload),'receipt'),/database unavailable/);
});
Deno.test('strict tool schema closes every object and requires its properties',()=>{
  const visit=(node:any)=>{
    if(node.type==='object'){assert.equal(node.additionalProperties,false);assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());Object.values(node.properties).forEach(visit);}
    if(node.items)visit(node.items);
  }; visit(CLOUD_BUILD_APP_DEFINITION.parameters);
});
