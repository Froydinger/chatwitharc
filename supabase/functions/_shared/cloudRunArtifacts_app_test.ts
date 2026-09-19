import { deepStrictEqual as assertEquals } from 'node:assert/strict';
import { cloudMessagePresentation, cloudPresentation } from './cloudRunArtifacts.ts';

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
