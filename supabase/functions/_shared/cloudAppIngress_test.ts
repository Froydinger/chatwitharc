import { equal, rejects } from 'node:assert/strict';
import { authorizeCloudAppSubmission } from './cloudAppIngress.ts';
const ownerId = 'owner';
const sessionId = 'session';
const projectId = '00000000-0000-4000-8000-000000000001';
const input = { enabled: true, ownerId, sessionId, request: { projectId } };
const ports = {
  session: async (id: string, user_id: string) => ({id,user_id}),
  project: async (id: string, user_id: string) => ({id,user_id}),
  boost: async () => true,
};
Deno.test('app admission requires saved owner-scoped project and current Boost', async () => {
  equal(await authorizeCloudAppSubmission(input, ports), projectId);
  await rejects(authorizeCloudAppSubmission(input, {...ports, boost: async () => false}), /requires Boost/);
  for (const field of ['project','session'] as const) {
    await rejects(authorizeCloudAppSubmission(input, {...ports,
      [field]: async (id: string) => ({id,user_id:'other'})}), /not found/);
  }
});
Deno.test('disabled or unsaved app admission performs no lookups', async () => {
  const unexpected = async () => { throw new Error('Unexpected lookup'); };
  const never = {session:unexpected,project:unexpected,boost:unexpected};
  await rejects(authorizeCloudAppSubmission({...input,enabled:false},never), /not enabled/);
  for (const request of [{}, {projectId:'invalid'}, {projectId,currentFiles:{}}]) {
    await rejects(authorizeCloudAppSubmission({...input,request},never), /Save an owned project/);
  }
});
