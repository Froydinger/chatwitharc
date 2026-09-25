import { deepStrictEqual as assertEquals } from 'node:assert/strict';
import { cloudMessagePresentation, cloudPresentation, type CloudPresentation } from './cloudRunArtifacts.ts';

Deno.test('Work app artifact maps to an IDE message while preserving the summary', () => {
  const artifact = {
    projectId: '00000000-0000-4000-8000-000000000001', runId: '00000000-0000-4000-8000-000000000002',
    version: 1, title: 'Test App', prompt: 'Build a test app', fileCount: 3,
    url: '/build/00000000-0000-4000-8000-000000000001', published: false,
    publishedUrl: null, executed: false as const, tested: false as const, deployed: false,
  };
  const presentation = cloudPresentation({
    receipt: { state: 'done', presentation: { app_artifact: artifact } },
  });
  const message = cloudMessagePresentation(presentation) as Record<string, unknown>;
  assertEquals(message.type, 'ide');
  assertEquals(message.ideProjectId, artifact.projectId);
  assertEquals(message.ideTitle, artifact.title);
  assertEquals(message.idePrompt, artifact.prompt);
  assertEquals(message.ideUrl, artifact.url);
  assertEquals((message.appArtifact as typeof artifact).fileCount, 3);
});

Deno.test('Browserbase receipt becomes safe reconnectable metadata without exposing the live view URL', () => {
  const session = {
    sessionHandle: '44444444-4444-4444-8444-444444444444', status: 'agent_running',
    expiresAt: '2026-09-25T12:10:00.000Z', device: 'desktop', control: 'agent',
    title: 'Production site', taskKind: 'git',
  } as const;
  const unsafeSession = { ...session, liveViewUrl: 'https://private.example/session' } as unknown as NonNullable<CloudPresentation['browser_session']>;
  const message = cloudMessagePresentation(cloudPresentation({
    browser: { state: 'done', presentation: { browser_session: unsafeSession } },
  })) as Record<string, unknown>;
  assertEquals(message.browserSession, session);
  assertEquals(JSON.stringify(message).includes('private.example'), false);
});
