import assert from 'node:assert/strict';
import { build } from 'esbuild-wasm';

const bundled = await build({
  entryPoints: ['src/lib/liveSpeechIndicator.ts'], bundle: true,
  write: false, format: 'esm', platform: 'browser',
});
const { LiveSpeechIndicator } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const indicator = new LiveSpeechIndicator();
assert.equal(indicator.sample(0, 0), false, 'a connected silent RTP stream is not speech');
assert.equal(indicator.sample(0.08, 100), true);
assert.equal(indicator.sample(0, 400), true, 'short pauses do not flicker');
assert.equal(indicator.sample(0, 701), false, 'interrupted or finished audio clears the indicator');
assert.equal(indicator.sample(0.002, 1000), false, 'background noise does not keep speaking alive');
assert.equal(indicator.sample(0.1, 2000), true, 'speech can resume after a tool result');
assert.equal(indicator.sample(NaN, 2700), false);
assert.equal(new LiveSpeechIndicator().sample(0, 2800), false, 'a new connection has no stale speech');
console.log('Live speech indicator regression checks passed');
