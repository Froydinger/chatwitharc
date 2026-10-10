import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild-wasm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
const compiled = await build({ entryPoints: ['src/store/useModelStore.ts'], bundle: true, write: false, format: 'esm', define: { 'import.meta.env': '{}' } });
const models = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const selections = ['auto', 'gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'];
const names = ['Auto', 'GPT 6 Luna', 'GPT 6.1 Sol', 'GPT 6 Astra'];
for (const old of [undefined, null, {}, 'flynn', 'think', 'Arc Think', 'none', 'low', 'medium', 'high', 'gemini-3.8-flash', 'gpt-5.6-sol']) {
  assert.equal(models.migrateModelPreferences({ reasoningEffort: old, chatModel: 'gpt-6-luna' }).modelSelection, 'auto');
}
for (const [index, selection] of selections.entries()) {
  assert.equal(models.migrateModelPreferences({ modelSelection: selection }).modelSelection, selection);
  assert.equal(models.migrateModelPreferences({ reasoningEffort: selection }).modelSelection, selection);
  models.useModelStore.getState().setModelSelection(selection);
  assert.equal(models.useModelStore.getState().modelSelection, selection);
  assert.equal(JSON.parse(memory.get('arc-model-family')).state.modelSelection, selection);
  assert.equal(models.getModelDisplayName(selection), names[index]);
}
assert.equal(models.getRecordedModelDisplayName('gemini-3.8-flash'), 'Gemini Flash');
assert.equal(models.getRecordedModelDisplayName('gpt-6-sol'), 'GPT 6 Sol');
assert.equal(models.getRecordedModelDisplayName(undefined), 'Arc');
assert.equal(models.canSelectAstra(false, false, false), false);
assert.equal(models.canSelectAstra(true, true, true), false);
assert.equal(models.canSelectAstra(true, false, false), true);
models.useModelStore.getState().setIsAdmin(false);
for (const task of ['write', 'code', 'search', 'file-gen']) assert.equal(models.getModelRoute('auto', task, 2).model, 'gpt-6.1-sol');
assert.equal(models.getModelRoute('auto', 'chat', 3).model, 'gpt-6-luna');
assert.equal(models.getModelRoute('gpt-6.1-sol', 'chat', 3).effort, 'low');
assert.throws(() => models.getModelRoute('gpt-6-astra', 'code', 3), /Boost/);
models.useModelStore.getState().setIsAdmin(true);
assert.equal(models.getModelRoute('gpt-6-astra', 'code', 3).effort, 'medium');

// Render the actual dropdown with isolated account hooks and no network.
const pickerSource = read('src/components/ChatModelPicker.tsx').replace(/^import .*;\n/gm, '');
const icons = Object.fromEntries(['RefreshCcwDot', 'MoonStar', 'Sun', 'Galaxy', 'Lock', 'Check', 'ChevronDown', 'Crown'].map(name => [name, () => React.createElement('svg', { 'data-icon': name })]));
const iconModule = {};
new Function('exports', ...Object.keys(icons), transpile(read('src/lib/chatModelIcons.ts').replace(/^import .*;\n/gm, '')))(iconModule, ...Object.values(icons));
assert.deepEqual(selections.map(selection => iconModule.CHAT_MODEL_ICONS[selection]), [icons.RefreshCcwDot, icons.MoonStar, icons.Sun, icons.Galaxy]);
for (const selection of selections.slice(1)) assert.equal(iconModule.getRecordedChatModelIcon(selection), iconModule.CHAT_MODEL_ICONS[selection]);
assert.equal(iconModule.getRecordedChatModelIcon('gemini-3.8-flash'), undefined);
assert.equal(iconModule.getRecordedChatModelIcon(undefined), undefined);
function picker(account) {
  let stateIndex = 0, checkoutCalls = 0;
  const deps = { ...models, ...icons, ...iconModule, BoostIcon: () => React.createElement('svg', { 'data-icon': 'Boost' }), useModelStore: selector => selector(models.useModelStore.getState()), useEffect() {}, useRef: () => ({ current: null }),
    useState: initial => [stateIndex++ === 0 ? true : { top: 40, left: 20 }, () => {}],
    useAuth: () => ({ user: Object.hasOwn(account, 'user') ? account.user : { id: 'fixture' }, loading: account.authLoading ?? false }),
    useSubscription: () => ({ hasBoost: false, hasVerifiedBoost: false, isAdmin: false, loading: false, ...account, isVerifiedModelAdmin: account.isVerifiedModelAdmin ?? account.isAdmin ?? false, openCheckout: () => checkoutCalls++ }),
    createPortal: child => child, ConditionalTransition: ({ children }) => children, document: { body: {} }, cn: (...v) => v.filter(Boolean).join(' '),
  };
  const mod = {};
  new Function('exports', 'require', ...Object.keys(deps), transpile(pickerSource))(mod, require, ...Object.values(deps));
  assert.deepEqual(mod.PRESETS.map(value => value.selection), selections);
  assert.deepEqual(mod.PRESETS.map(value => value.title), names);
  assert.deepEqual(mod.PRESETS.map(value => value.icon), [icons.RefreshCcwDot, icons.MoonStar, icons.Sun, icons.Galaxy]);
  const html = renderToStaticMarkup(React.createElement(mod.ChatModelPicker));
  const astra = html.match(/<button[^>]*>[\s\S]*?<span class="text-xs font-semibold">GPT 6 Astra<\/span>[\s\S]*?<\/button>/g)?.at(-1);
  // Match the row directly; the menu's first button is the picker trigger.
  const rows = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(value => value[0]);
  const astraRow = rows.find(value => value.includes('GPT 6 Astra'));
  assert.ok(astra && astraRow);
  const allowed = ((account.isVerifiedModelAdmin ?? account.isAdmin) === true || account.hasVerifiedBoost === true) && !account.loading && !account.authLoading && account.user !== null && !account.user?.is_anonymous;
  assert.equal(/ disabled=""/.test(astraRow), !!account.loading || !!account.authLoading);
  assert.equal(astraRow.includes('Coming soon'), false);
  assert.equal(html.includes('$30/month'), false);
  assert.ok(html.includes('Unlimited'));
  assert.ok(html.includes('Allowance'));
  assert.ok(html.includes('Boost'));
  assert.ok(html.includes('Auto can use Sol allowance'));
  assert.ok(html.includes('Usage details'));
  assert.equal(html.includes('workspace-open-usage'), false, 'internal usage event name is not exposed as copy');
  assert.equal(html.includes('Arc Matrix™'), false);
  assert.equal(html.includes('Choose how Arc responds.'), false);
  assert.equal(html.includes('Auto can use your Sol allowance'), false);
  assert.equal(html.includes('Free and unlimited for everyone'), false);
  assert.equal(html.includes('shared Sol allowance'), false);
  assert.equal(html.includes('separate Astra allowance'), false);
  stateIndex = 0;
  const tree = mod.ChatModelPicker({});
  let astraElement;
  function walk(value) {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    if (value.props?.title === 'GPT 6 Astra') astraElement = value;
    walk(value.props?.children);
  }
  walk(tree); assert.ok(astraElement); astraElement.props.onClick();
  assert.equal(models.useModelStore.getState().modelSelection, allowed ? 'gpt-6-astra' : 'auto');
  assert.equal(checkoutCalls, !allowed && !account.loading && !account.authLoading ? 1 : 0);
  models.useModelStore.getState().setModelSelection('auto');
  for (const label of ['GPT 6 Luna', 'GPT 6.1 Sol']) assert.equal(/ disabled=""/.test(rows.find(value => value.includes(`<span class="text-xs font-semibold">${label}</span>`))), false);
  assert.equal(html.includes('Arc Flash'), false);
  assert.equal(html.includes('Arc Think'), false);
  return { mod, html };
}
models.useModelStore.getState().setModelSelection('auto');
for (const account of [{}, { hasBoost: true }, { hasVerifiedBoost: true }, { isAdmin: true }, { isAdmin: true, isVerifiedModelAdmin: false }, { isAdmin: true, loading: true }, { isAdmin: true, authLoading: true }, { isAdmin: true, user: null }, { isAdmin: true, user: { id: 'guest', is_anonymous: true } }]) picker(account);
const control = read('src/components/ArcControlPicker.tsx');
assert.ok(control.includes('disabled={disabled}') && control.includes("badge = locked ? 'Boost'"));
assert.ok(control.includes("openCheckout(undefined, 'astra_boost_required')") && !control.includes('flynn'));
const subscription = read('src/hooks/useSubscription.tsx');
assert.ok(subscription.includes('modelEntitlements?.ownerId === user?.id'));
assert.ok(subscription.includes('adminOwnerAtStart === user.id && adminOwnerAtEnd === user.id'));

// Both reply metadata surfaces use recorded GPT icons; voice/local/images keep their icons.
const Box = ({ children }) => React.createElement('div', null, children);
const metadataDeps = { ...iconModule, getRecordedModelDisplayName: models.getRecordedModelDisplayName,
  useState: () => [true, () => {}], useBugReport: () => () => {},
  imageModelName: () => 'Image', Bug: () => React.createElement('svg', { 'data-icon': 'Bug' }),
  ThemedLogo: props => React.createElement('img', { ...props, 'data-icon': 'Arc' }), SourcesAccordion: Box,
  Dialog: Box, DialogContent: Box, DialogDescription: Box, DialogHeader: Box, DialogTitle: Box, DialogTrigger: Box };
const metadataApi = {};
new Function('exports', 'require', ...Object.keys(metadataDeps), transpile(read('src/components/MessageMetadata.tsx').replace(/^import .*;\n/gm, '')))(metadataApi, require, ...Object.values(metadataDeps));
const badgeDeps = { ...iconModule, Transition: Box, Tooltip: Box, TooltipContent: Box, TooltipProvider: Box, TooltipTrigger: Box,
  Cpu: () => React.createElement('svg', { 'data-icon': 'Cpu' }), Cloud: () => React.createElement('svg', { 'data-icon': 'Cloud' }),
  getRouteLabel: source => ({ label: 'Recorded model', tooltip: 'Fixture', icon: source === 'local' ? 'local' : 'cloud' }) };
const badgeApi = {};
new Function('exports', 'require', ...Object.keys(badgeDeps), transpile(read('src/components/ModelSourceBadge.tsx').replace(/^import .*;\n/gm, '')))(badgeApi, require, ...Object.values(badgeDeps));
for (const [modelUsed, name] of [['gpt-6-luna', 'MoonStar'], ['gpt-6.1-sol', 'Sun'], ['gpt-6-astra', 'Galaxy']]) {
  const html = renderToStaticMarkup(React.createElement(metadataApi.MessageMetadata, { message: { modelUsed, sourceModel: 'cloud-chat' } }));
  assert.ok(html.includes(`data-icon="${name}"`));
  const badge = renderToStaticMarkup(React.createElement(badgeApi.ModelSourceBadge, { modelUsed, source: 'cloud-chat' }));
  assert.ok(badge.includes(`data-icon="${name}"`));
}
for (const source of ['local', 'cloud-image', 'cloud-voice']) {
  const html = renderToStaticMarkup(React.createElement(metadataApi.MessageMetadata, { message: { modelUsed: 'gpt-6-luna', sourceModel: source } }));
  assert.equal(html.includes('data-icon="MoonStar"'), false);
  const badge = renderToStaticMarkup(React.createElement(badgeApi.ModelSourceBadge, { modelUsed: 'gpt-6-luna', source }));
  assert.equal(badge.includes('data-icon="MoonStar"'), false);
  assert.ok(badge.includes(`data-icon="${source === 'local' ? 'Cpu' : 'Cloud'}"`));
}
const galaxyApi = {};
new Function('exports', 'createLucideIcon', transpile(read('src/components/icons/Galaxy.tsx').replace(/^import .*;\n/gm, '')))(galaxyApi, require('lucide-react').createLucideIcon);
const galaxySvg = renderToStaticMarkup(React.createElement(galaxyApi.Galaxy));
assert.ok(galaxySvg.includes('lucide-galaxy'));
assert.ok(galaxySvg.includes('M16.005 15.108a5.041 6.52 28.25 00-8.008-6.217'));
assert.ok(galaxySvg.includes('M7.997 8.891a11.885 7.288-60.756 0111.977 8.107'));
assert.ok(galaxySvg.includes('cx="12" cy="12" r="1" fill="currentColor"'));

// Routing notices are preserved and shown exactly once for the logical response.
const notices = [], noticeMemory = new Map(), noticeApi = {};
new Function('exports', 'toast', 'sessionStorage', transpile(read('src/services/modelSwitchNotice.ts').replace(/^import .*;\n/gm, '')))(noticeApi,
  value => notices.push(value), { getItem: key => noticeMemory.get(key), setItem: (key, value) => noticeMemory.set(key, value) });
assert.equal(noticeApi.showModelSwitchNotice(undefined, 'none'), undefined);
assert.equal(noticeApi.showModelSwitchNotice(' Sol allowance used. Continuing with Luna. ', 'same'), 'Sol allowance used. Continuing with Luna.');
noticeApi.showModelSwitchNotice('Sol allowance used. Continuing with Luna.', 'same');
assert.equal(notices.length, 1);
assert.equal(notices[0].title, 'Switched to GPT 6 Luna');

// Execute the real AIService class against an in-memory provider transport.
const source = read('src/services/ai.ts');
const ast = ts.createSourceFile('ai.ts', source, ts.ScriptTarget.Latest, true);
const declarations = ast.statements.filter(node => (ts.isClassDeclaration(node) && node.name?.text === 'AIService')
  || (ts.isFunctionDeclaration(node) && ['detectComplexQuery', 'getQueryComplexity', 'readRecordedReasoningEffort'].includes(node.name?.text))).map(node => node.getText(ast)).join('\n');
const routingSource = read('supabase/functions/_shared/arcModelRouting.ts');
const routing = {}; new Function('exports', transpile(routingSource))(routing);
const requests = [], invocations = [];
let voiceActive = false, usageRefreshes = 0;
const serverReply = { choices: [{ message: { content: 'Actual reply' } }], content: 'Analysis reply', model_used: 'gpt-6-astra', reasoning_effort_used: 'medium', success: true, fileUrl: 'https://example.invalid/file', fileName: 'result.txt', mimeType: 'text/plain' };
const session = { user: { id: 'fixture' }, access_token: 'fixture-token' };
const supabase = { auth: { getSession: async () => ({ data: { session } }), getUser: async () => ({ data: { user: null } }) },
  from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null }) }),
  functions: { invoke: async (name, options) => { invocations.push({ name, ...structuredClone(options) }); return { data: structuredClone(serverReply), error: null }; } },
};
let fetchHandler = async (_url, options) => { requests.push(JSON.parse(options.body)); return Response.json(serverReply); };
let ordinaryEnabled = false;
const chatState = { syncedUserId: 'fixture', chatSessions: [] }, registeredTurns = [];
const deps = { ...models, notifyTextUsageChanged() { usageRefreshes++; },
  useVoiceModeStore: { getState: () => ({ isActive: voiceActive }) }, showModelSwitchNotice: noticeApi.showModelSwitchNotice, arcRequestTask: routing.arcRequestTask, supabase, isSupabaseConfigured: true,
  useArcStore: { getState: () => chatState }, useBrowserbaseSessionStore: { getState: () => ({ getSession: () => null }) },
  ordinaryChatEnabled: () => ordinaryEnabled, registerOrdinaryChat(...args) { registeredTurns.push(args); }, unregisterOrdinaryChat() {},
  useLiveAnswerStore: { getState: () => ({ clear() {}, show() {} }) },
  getCachedLocation: () => null, detectsLocationIntent: () => false, requestsCurrentLocation: () => false,
  UI_CONTEXT_PROMPT: { role: 'system', content: 'Fixture' }, ARC_MODE_CONTEXT: { chat: { role: 'system', content: 'Fixture' } },
  window: { dispatchEvent() {} }, CustomEvent: class {}, fetch: (...args) => fetchHandler(...args),
  incrementDailyBalancedCount() {}, incrementDailyDeepCount() {}, console: { log() {}, warn() {}, error() {} },
};
const api = {};
new Function('exports', ...Object.keys(deps), transpile(declarations.replaceAll('import.meta.env', JSON.stringify({ VITE_SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture-public' }))))(api, ...Object.values(deps));
const messages = [{ role: 'user', content: 'Hello' }];
models.useModelStore.getState().setModelSelection('gpt-6.1-sol');
const captured = new api.AIService();
models.useModelStore.getState().setModelSelection('gpt-6-luna');
const answer = await captured.sendMessage(messages);
assert.equal(requests.at(-1).modelSelection, 'gpt-6.1-sol');
assert.equal(answer.modelUsed, 'gpt-6-astra');
assert.equal(answer.reasoningEffortUsed, 'medium');
assert.ok(requests.at(-1).submissionId);
serverReply.model_switch_notice = 'Sol allowance used. Continuing with Luna.';
serverReply.model_used = 'gpt-6-luna';
const fallback = await captured.sendMessage(messages);
assert.equal(fallback.modelUsed, 'gpt-6-luna');
assert.equal(fallback.modelSwitchNotice, serverReply.model_switch_notice);
assert.equal(fallback.content, 'Actual reply', 'Switch notices never alter generated content');
for (const method of ['document', 'image', 'file', 'guest']) {
  const ai = new api.AIService('gpt-6.1-sol');
  if (method === 'document') await ai.sendMessageWithDocument(messages, 'fixture', 'file.txt', 'text/plain');
  if (method === 'image') await ai.sendMessageWithImage(messages, ['fixture']);
  if (method === 'file') await ai.generateFile('txt', 'Fixture');
  if (method === 'guest') await ai.sendGuestMessage(messages);
  assert.equal(invocations.at(-1).body.modelSelection, 'gpt-6.1-sol');
  assert.ok(invocations.at(-1).body.submissionId);
}
assert.equal(new Set(invocations.map(value => value.body.submissionId)).size, 4);
for (const selection of ['gpt-6.1-sol', 'gpt-6-astra', 'auto']) for (const kind of ['code', 'canvas', 'text']) {
  if (selection === 'auto' && kind === 'text') continue;
  const ai = new api.AIService(selection), calls = [], events = [];
  ai.sendMessage = async (...args) => { calls.push(args); return { content: 'Answer', modelUsed: selection === 'auto' ? 'gpt-6.1-sol' : selection, reasoningEffortUsed: 'low',
    ...(kind === 'code' ? { codeUpdate: { code: 'const answer = 42;', language: 'js', label: 'Owned code' } } : {}),
    ...(kind === 'canvas' ? { canvasUpdate: { content: 'Owned prose', label: 'Draft' } } : {}) }; };
  const signal = new AbortController().signal;
  await ai.sendMessageStreaming(messages, {}, kind === 'canvas', kind === 'code',
    mode => events.push(['start', mode]), text => events.push(['delta', text]), result => events.push(['done', result]),
    error => { throw Error(error); }, 'original-chat', false, signal);
  assert.equal(calls.length, 1, 'Sol/Astra and Auto artifacts must use event-based sendMessage');
  assert.equal(calls[0][3], 'original-chat'); assert.equal(calls[0][11], signal);
  assert.equal(events.at(-1)[1].mode, kind);
  assert.equal(events.at(-1)[1].modelUsed, selection === 'auto' ? 'gpt-6.1-sol' : selection);
}
fetchHandler = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  return new Response(`data: ${JSON.stringify({ type: 'start', mode: 'text' })}\n\ndata: ${JSON.stringify({ type: 'done', mode: 'text', content: 'Actual stream', model_used: 'gpt-6-luna', reasoning_effort_used: 'medium' })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
};
let streamResult;
await new api.AIService('gpt-6-luna').sendMessageStreaming(messages, {}, false, false, undefined, undefined, value => { streamResult = value; });
assert.equal(requests.at(-1).modelSelection, 'gpt-6-luna');
assert.ok(requests.at(-1).submissionId);
assert.equal(streamResult.reasoningEffortUsed, 'medium', 'Server metadata must override client estimate of none');

// Preserve the existing unparameterized reminder client without exempting typed chat.
voiceActive = true;
fetchHandler = async (_url, options) => { requests.push(JSON.parse(options.body)); return Response.json(serverReply); };
models.useModelStore.getState().setModelSelection('gpt-6.1-sol');
const refreshesBeforeVoice = usageRefreshes, noticesBeforeVoice = notices.length;
await new api.AIService().sendMessage([{role:'user',content:'Create a reminder'}]);
assert.equal(requests.at(-1).compatibilityMode, 'voice');
assert.equal(requests.at(-1).modelSelection, 'gpt-6-luna');
assert.equal(requests.at(-1).reasoningEffort, 'low');
assert.equal(usageRefreshes, refreshesBeforeVoice);
assert.equal(notices.length, noticesBeforeVoice);
await new api.AIService('gpt-6.1-sol').sendMessage(messages);
assert.equal(requests.at(-1).compatibilityMode, undefined);
assert.equal(requests.at(-1).modelSelection, 'gpt-6.1-sol');
assert.equal(usageRefreshes, refreshesBeforeVoice + 1);
voiceActive = false;

// A failed A followed by B then an explicit retry of A keeps A's persistence identity.
ordinaryEnabled = true;
chatState.chatSessions = [{ id: 'retry-chat', messages: [
  { id: 'message-a', role: 'user', type: 'text', content: 'Question A' },
  { id: 'message-b', role: 'user', type: 'text', content: 'Question B' },
] }];
await new api.AIService('auto').sendMessage([{ role: 'user', content: 'Question A' }], {}, undefined, 'retry-chat',
  false, false, false, false, false, undefined, undefined, undefined, 'chat', false, 'message-a');
assert.deepEqual(requests.at(-1).userMessage, { id: 'message-a', content: 'Question A' });
assert.equal(registeredTurns.at(-1)[2], 'message-a', 'Cancellation and edit invalidation bind to A, not the newer B');
await new api.AIService('auto').sendMessage([{ role: 'user', content: 'Question B' }], {}, undefined, 'retry-chat');
assert.deepEqual(requests.at(-1).userMessage, { id: 'message-b', content: 'Question B' }, 'Existing callers retain latest-turn behavior');
chatState.chatSessions[0].messages.shift();
const beforeMissingTurn = requests.length;
await assert.rejects(new api.AIService('auto').sendMessage([{ role: 'user', content: 'Question A' }], {}, undefined, 'retry-chat',
  false, false, false, false, false, undefined, undefined, undefined, 'chat', false, 'message-a'), /no longer available/);
assert.equal(requests.length, beforeMissingTurn, 'Deleted submitted ID never falls back to a newer turn');
ordinaryEnabled = false; chatState.chatSessions = [];

// Exercise the actual pre-await Work snapshot and request-builder expressions.
const mobile = read('src/components/MobileChatApp.tsx');
const mobileAst = ts.createSourceFile('mobile.tsx', mobile, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function variable(name, root = mobileAst) {
  let found; const walk = node => { if (ts.isVariableDeclaration(node) && node.name.getText(mobileAst) === name) found = node.initializer; ts.forEachChild(node, walk); }; walk(root);
  assert.ok(found, name); return found;
}
const submit = variable('submitCloudText');
const expression = name => transpile(`return (${variable(name, submit).getText(mobileAst)});`);
for (const selection of selections) {
  const intent = { sessionId: 'original-chat', modelSelection: selection, messages, forceGit: true };
  const capture = new Function('intent', 'useModelStore', 'normalizeModelSelection', expression('captured'))(intent, models.useModelStore, models.normalizeModelSelection);
  intent.modelSelection = 'auto'; models.useModelStore.getState().setModelSelection('gpt-6-luna');
  const request = new Function('captured', 'workspaceContext', 'useBrowserbaseSessionStore', 'useArcStore', 'locationContext', expression('buildRequest'))(
    capture, undefined, { getState: () => ({ getSession: () => null }) }, { getState: () => ({ chatSessions: [] }) }, undefined)();
  assert.equal(request.modelSelection, selection); assert.equal(request.reasoningSelection, selection);
  assert.equal(request.model, undefined); assert.equal(request.browserbaseDevice, 'desktop');
}
console.log('PASS GPT frontend: four choices/icons, migration/persistence, Free/verified-Boost/admin/loading gates, historical labels, captured chat/stream/analysis/file/Work routes, unique submission IDs, event artifacts, and authoritative metadata.');
