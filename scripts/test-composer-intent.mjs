import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/chat-input/intent.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const intent = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for (const [input, expected] of [['hey','chat'],[' image/cat','image'],['/draw cat','image'],['write/poem','write'],['/canvas story','write'],['code/react button','code'],['/code button','code'],['I like this image','chat']]) {
  assert.equal(intent.inferPromptMode(input), expected);
}
for (const [fn, input, expected] of [
  ['checkForImageRequest','draw me a cat',true],['checkForImageRequest','explain this image',false],
  ['checkForCodingRequest','/code a button',true],['checkForCodingRequest','explain this code',false],
  ['checkForCanvasRequest','write/poem',true],['checkForGitRequest','git/status',true],
  ['checkForGitRequest','I use git at work',false],['checkForSearchRequest','search/weather',true],
  ['shouldForceVideoSearch','find a YouTube clip',true],['shouldForceVideoSearch','how does video encoding work',false],
  ['analyzeImageRequestIntent','find a photo of a cat','search'],['analyzeImageRequestIntent','generate an image of a cat','generate'],
  ['analyzeImageRequestIntent','what does this image mean','ask'],['analyzeImageRequestIntent','hey','none'],
  ['extractPrefixPrompt','/git status','status'],['extractPrefixPrompt','code/react button','react button'],
]) assert.equal(intent[fn](input), expected, fn);
assert.equal(intent.findRecentVisualContext([]), null);
console.log('25 composer intent cases passed (explicit commands, near misses, search/generation and empty context).');
