import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';

const read = file => readFileSync(file, 'utf8');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const css = postcss.parse(read('src/workspace/workspace.css'));
const declarations = selector => {
  const result = {};
  css.walkRules(rule => { if (rule.selector === selector) rule.walkDecls(decl => { result[decl.prop] = decl.value; }); });
  return result;
};
assert.equal(declarations('.ws-mode-switch')['border-radius'], '999px');
assert.equal(declarations('.ws-mode-switch button')['border-radius'], '999px');
assert.equal(declarations('.ws-mode-switch button[aria-pressed=true]').background, 'var(--ws-hover)');
assert.equal(declarations('.workspace-ui :focus-visible').outline, '2px solid var(--ws-text)');
assert.equal(declarations('.workspace-ui')['--ws-bg'], '#000000');
assert.ok(declarations('html[data-workspace-theme=light] .workspace-ui')['--ws-text']);
assert.equal(git('diff', '93e188034b16b32fbc43c8cfcfbf06967680e18e', '--', 'src/pages/LandingPage.tsx', 'index.html', 'scripts/prerender.mjs', 'netlify.toml', 'public/sitemap.xml').trim(), '', 'corrected lander and hidden AEO/prerender sources stay unchanged');
assert.equal(git('diff', 'dacdcb739b66ebdaa2d216976ebacbe860e7eb94', '--', 'supabase').trim(), '', 'the entire backend exactly matches reviewed deployed v108 source');
assert.equal(git('diff', '93e188034b16b32fbc43c8cfcfbf06967680e18e', '--', 'src/hooks/useVoiceMode.ts', 'src/store/useVoiceModeStore.ts', 'src/components/VoiceModeController.tsx', 'src/lib/voice', 'src/services/voice', 'src/hooks/useRealtimeVoice.ts').trim(), '', 'voice engine/model/tuning remain untouched');
const beforeOverlay = git('show', '93e188034b16b32fbc43c8cfcfbf06967680e18e:src/components/VoiceModeOverlay.tsx');
assert.equal(read('src/components/VoiceModeOverlay.tsx'), beforeOverlay.replace('import { MetalFx, PRESETS } from "metal-fx";', 'import { PRESETS } from "metal-fx";\nimport { SafeMetalFx as MetalFx } from "@/components/ui/safe-metal-fx";'), 'voice overlay change is limited to safe decorative import; PRESETS remains real');
console.log('PASS integrated pill/selected/focus/theme contracts; exact lander/AEO preservation; entire reviewed backend parity; protected voice engine and decorative-import-only overlay.');
