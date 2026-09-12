import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import JSZip from 'jszip';
const root = new URL('../../', import.meta.url);
async function load(path, imports = {}) {
  const source = await readFile(new URL(path, root), 'utf8');
  const code = ts.transpileModule(source, { fileName: 'module.ts', compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => {
    if (!(name in imports)) throw Error(`Unexpected dependency: ${name}`);
    return imports[name];
  });
  return exports;
}
const core = await load('supabase/functions/_shared/cloudMedia.ts');
const documents = await load('supabase/functions/_shared/cloudMediaDocuments.ts', { './cloudMedia.ts': core, 'npm:jszip@3.10.1': { default: JSZip } });
const input = await load('supabase/functions/_shared/cloudMediaInput.ts', { './cloudMedia.ts': core, './cloudMediaDocuments.ts': documents });
const capture = await load('src/services/cloudMediaCapture.ts', { '../../supabase/functions/_shared/cloudMedia.ts': core });
const scope = { ownerId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
const file = (name = 'photo.png', bytes = png, type = 'image/png') => new File([bytes], name, { type });
const text = value => new TextEncoder().encode(value);
function fixture() {
  const objects = new Map(), calls = []; let owner = scope.ownerId;
  const ports = {
    currentOwnerId: async () => owner,
    upload: async (ref, body, options) => { assert.equal(options.upsert, false); calls.push(['upload', ref.path]); objects.set(ref.path, { ref, bytes: new Uint8Array(await body.arrayBuffer()) }); },
    verify: async ref => { calls.push(['verify', ref.path]); const object = objects.get(ref.path); return !!object && await core.cloudMediaDigest(object.bytes) === ref.sha256; },
    ownsSession: async s => s.ownerId === owner && s.sessionId === scope.sessionId,
    read: async ref => { calls.push(['read', ref.path]); const o = objects.get(ref.path); if (!o) throw new core.CloudMediaError('integrity', 'Object missing');
      return { bucket: ref.bucket, path: ref.path, ownerId: o.ref.ownerId, mimeType: o.ref.mimeType,
        size: o.bytes.length, privateBucket: true, body: new Blob([o.bytes]).stream() }; },
  };
  return { objects, ports, calls, owner: value => { owner = value; } };
}
const transcript = [{ role: 'user', content: 'Analyze the attachments' }];
test('browser capture uploads immutable private objects; fresh worker reconstructs vision without saved base64', async () => {
  const f = fixture(); const originalScope = { ...scope };
  const prepared = await capture.prepareCloudMediaCapture([file()], originalScope);
  originalScope.sessionId = 'changed';
  const refs = await prepared.upload(f.ports);
  assert.equal(f.calls.length, 1); assert.equal(refs[0].sessionId, scope.sessionId);
  assert.equal(JSON.stringify(refs).includes('data:'), false);
  // JSON round-trip is all that remains after browser loss. No local File/Blob.
  const restored = JSON.parse(JSON.stringify(refs));
  const engine = structuredClone(transcript), before = JSON.stringify(engine);
  const result = await input.withCloudMediaInput({ scope, references: restored, messageIndex: 0, transcript: engine, ports: f.ports }, async expanded => {
    assert.equal(expanded[0].content[2].type, 'input_image');
    assert.ok(expanded[0].content[2].image_url.startsWith('data:image/png;base64,'));
    return { responseId: 'resp_fixture' };
  });
  assert.deepEqual(result, { responseId: 'resp_fixture' }); assert.equal(JSON.stringify(engine), before);
  assert.equal(JSON.stringify({ request: refs, checkpoint: engine, result }).includes('base64'), false);
});
test('closed references reject arbitrary URLs, tokens, foreign owners/sessions and traversal before read', async () => {
  const prepared = await capture.prepareCloudMediaCapture([file()], scope); const [ref] = prepared.references();
  for (const change of [{ url: 'https://private.invalid' }, { bearer: 'secret' }, { path: '../other' },
    { bucket: 'avatars' }, { ownerId: '00000000-0000-4000-8000-000000000003' }, { sessionId: 'wrong' }, { sha256: 'bad' }]) {
    assert.throws(() => core.validateCloudMediaReferences([{ ...ref, ...change }], scope));
  }
  assert.throws(() => core.validateCloudMediaReferences([ref, ref], scope));
});
test('lost upload acknowledgement is verified by the same identity, never reuploaded', async () => {
  const f = fixture(), prepared = await capture.prepareCloudMediaCapture([file()], scope);
  const upload = f.ports.upload; f.ports.upload = async (...args) => { await upload(...args); throw Error('timeout with secret-provider-body'); };
  await assert.rejects(prepared.upload(f.ports), error => error.code === 'uncertain' && !error.message.includes('secret'));
  await assert.rejects(prepared.upload(f.ports), { code: 'uncertain' });
  assert.equal(f.calls.filter(c => c[0] === 'upload').length, 1);
  await prepared.verify(f.ports); await prepared.upload(f.ports);
  assert.equal(f.calls.filter(c => c[0] === 'upload').length, 1);
});
test('account switch and abort prevent upload; concurrent upload cannot duplicate writes', async () => {
  const f = fixture(), prepared = await capture.prepareCloudMediaCapture([file()], scope);
  f.owner('other'); await assert.rejects(prepared.upload(f.ports), { code: 'owner' }); assert.equal(f.calls.length, 0);
  f.owner(scope.ownerId); const controller = new AbortController(); controller.abort();
  await assert.rejects(prepared.upload(f.ports, controller.signal)); assert.equal(f.calls.length, 0);
  let release; const original = f.ports.upload;
  f.ports.upload = async (...args) => { await new Promise(r => { release = r; }); await original(...args); };
  const sending = prepared.upload(f.ports); await Promise.resolve(); await Promise.resolve();
  await assert.rejects(prepared.upload(f.ports), { code: 'uncertain' }); release(); await sending;
  assert.equal(f.calls.length, 1);
});
test('missing, changed or foreign actual object never reaches provider', async () => {
  const f = fixture(), prepared = await capture.prepareCloudMediaCapture([file()], scope), refs = await prepared.upload(f.ports);
  let models = 0;
  const run = ports => input.withCloudMediaInput({ scope, references: refs, messageIndex: 0, transcript, ports }, async () => { models++; });
  await assert.rejects(run({ ...f.ports, ownsSession: async () => false }), { code: 'owner' });
  await assert.rejects(run({ ...f.ports, read: async ref => ({ ...await f.ports.read(ref), ownerId: 'other' }) }), { code: 'owner' });
  f.objects.get(refs[0].path).bytes[30] ^= 1;
  await assert.rejects(run(f.ports), { code: 'integrity' });
  f.objects.clear(); await assert.rejects(run(f.ports)); assert.equal(models, 0);
});
test('mixed PDF and CSV use proper file input and complete text including row 1001', async () => {
  const f = fixture(), csv = 'name,value\n' + Array.from({ length: 1002 }, (_, i) => `row${i},${i}`).join('\n');
  const prepared = await capture.prepareCloudMediaCapture([
    file('paper.pdf', text('%PDF-1.4\nfixture\n%%EOF'), 'application/pdf'), file('table.csv', text(csv), 'text/csv'),
  ], scope);
  const refs = await prepared.upload(f.ports);
  await input.withCloudMediaInput({ scope, references: refs, messageIndex: 0, transcript, ports: f.ports }, async expanded => {
    const content = expanded[0].content;
    assert.equal(content[2].type, 'input_file'); assert.equal(content[2].filename, 'paper.pdf');
    assert.ok(content[2].file_data.startsWith('data:application/pdf;base64,'));
    assert.ok(content.at(-1).text.includes('row1001,1001'));
    assert.equal(content.filter(p => p.type === 'input_file').length, 1);
  });
});
async function office(kind, extra = {}) {
  const zip = new JSZip(); zip.file('[Content_Types].xml', '<Types/>');
  const path = kind === 'docx' ? 'word/document.xml' : kind === 'pptx' ? 'ppt/presentation.xml' : 'xl/workbook.xml';
  zip.file(path, '<document>COMPLETE TEXT</document>');
  for (const [name, content] of Object.entries(extra)) zip.file(name, content);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
for (const [kind, mime] of [['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]) {
  test(`${kind} performs real server extraction after browser loss with all XML retained`, async () => {
    const extra = kind === 'xlsx' ? { 'xl/worksheets/sheet1.xml': '<sheet>' + '<row>cell</row>'.repeat(1001) + '<row>LAST ROW</row></sheet>', 'xl/sharedStrings.xml': '<t>shared value</t>' } : {};
    const f = fixture(), prepared = await capture.prepareCloudMediaCapture([file(`document.${kind}`, await office(kind, extra), mime)], scope);
    const refs = await prepared.upload(f.ports);
    await input.withCloudMediaInput({ scope, references: JSON.parse(JSON.stringify(refs)), messageIndex: 0, transcript, ports: f.ports }, async expanded => {
      const serialized = JSON.stringify(expanded);
      assert.ok(serialized.includes('COMPLETE TEXT')); assert.equal(serialized.includes('base64'), false);
      if (kind === 'xlsx') { assert.ok(serialized.includes('LAST ROW')); assert.ok(serialized.includes('shared value')); }
    });
  });
}
test('Office visuals, entities and expansion bombs fail explicitly instead of stripping content', async () => {
  const mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  for (const extra of [{ 'word/media/image1.png': png }, { 'word/header1.xml': '<!DOCTYPE x [<!ENTITY a "boom">]><x>&a;</x>' },
    { 'word/large.xml': 'x'.repeat(core.CLOUD_MEDIA_LIMITS.extractedBytes + 1) }]) {
    await assert.rejects(documents.extractCloudDocument(await office('docx', extra), mime));
  }
  const bad = await office('docx'); const view = new DataView(bad.buffer, bad.byteOffset, bad.byteLength);
  for (let i = 0; i < bad.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 1, true); break; }
  await assert.rejects(documents.extractCloudDocument(bad, mime));
});
test('no silently stripped unsupported, oversized, malformed or excessive media', async () => {
  await assert.rejects(capture.prepareCloudMediaCapture([file('file.svg', text('<svg/>'), 'image/svg+xml')], scope), { code: 'unsupported' });
  await assert.rejects(capture.prepareCloudMediaCapture([file('fake.png', text('not an image'))], scope), { code: 'integrity' });
  await assert.rejects(capture.prepareCloudMediaCapture(Array.from({ length: 7 }, () => file()), scope), { code: 'limit' });
  await assert.rejects(capture.prepareCloudMediaCapture([file('huge.txt', new Uint8Array(core.CLOUD_MEDIA_LIMITS.fileBytes + 1), 'text/plain')], scope), { code: 'limit' });
  await assert.rejects(documents.extractCloudDocument(new Uint8Array([255, 0]), 'text/plain'), { code: 'unsupported' });
  await assert.rejects(documents.extractCloudDocument(text('x'.repeat(core.CLOUD_MEDIA_LIMITS.textChars + 1)), 'text/plain'), { code: 'limit' });
});
test('animated GIF/PNG are rejected instead of silently analyzing a single frame', async () => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  await capture.prepareCloudMediaCapture([file('still.gif', gif, 'image/gif')], scope);
  const frame = gif.indexOf(44);
  const animatedGif = Buffer.concat([gif.subarray(0, -1), gif.subarray(frame)]);
  await assert.rejects(capture.prepareCloudMediaCapture([file('moving.gif', animatedGif, 'image/gif')], scope), { code: 'unsupported' });
  const animation = Buffer.alloc(20); animation.writeUInt32BE(8, 0); animation.write('acTL', 4);
  const animatedPng = Buffer.concat([png.subarray(0, -12), animation, png.subarray(-12)]);
  await assert.rejects(capture.prepareCloudMediaCapture([file('moving.png', animatedPng)], scope), { code: 'unsupported' });
});
test('stream size and abort checked before provider and anchor stays at original user turn', async () => {
  const f = fixture(), prepared = await capture.prepareCloudMediaCapture([file()], scope), refs = await prepared.upload(f.ports);
  const prior = [...transcript, { role: 'assistant', content: 'Tool round' }, { role: 'user', content: 'Later approval' }];
  await input.withCloudMediaInput({ scope, references: refs, messageIndex: 0, transcript: prior, ports: f.ports }, async expanded => {
    assert.equal(expanded[2].content, 'Later approval'); assert.ok(Array.isArray(expanded[0].content));
  });
  let models = 0;
  await assert.rejects(input.withCloudMediaInput({ scope, references: refs, messageIndex: 1, transcript: prior, ports: f.ports }, async () => { models++; }));
  const tooLong = { ...f.ports, read: async ref => ({ ...await f.ports.read(ref), body: new Blob([png, png]).stream() }) };
  await assert.rejects(input.withCloudMediaInput({ scope, references: refs, messageIndex: 0, transcript, ports: tooLong }, async () => { models++; }), { code: 'limit' });
  const controller = new AbortController();
  const waiting = { ...f.ports, read: async ref => ({ ...await f.ports.read(ref), body: new ReadableStream({ start() { controller.abort(); } }) }) };
  await assert.rejects(input.withCloudMediaInput({ scope, references: refs, messageIndex: 0, transcript, ports: waiting, signal: controller.signal }, async () => { models++; }));
  assert.equal(models, 0);
});
