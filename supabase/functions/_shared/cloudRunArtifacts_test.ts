import { deepStrictEqual, equal } from 'node:assert/strict';
import { cloudMessagePresentation, cloudPresentation } from './cloudRunArtifacts.ts';

Deno.test('confirmed file receipts become downloadable messages after reconstruction', () => {
  const file = {success:true as const,id:'artifact',fileUrl:'https://example.com/file.pdf',
    fileName:'Report.pdf',fileType:'pdf',mimeType:'application/pdf',fileSize:1234};
  const receipts = JSON.parse(JSON.stringify({call:{state:'done',presentation:{generated_file:file}}}));
  deepStrictEqual(cloudMessagePresentation(cloudPresentation(receipts)), {
    type:'file',fileUrl:file.fileUrl,fileName:file.fileName,fileType:'pdf',fileSize:1234,
    generatedFiles:[{id:file.id,fileUrl:file.fileUrl,fileName:file.fileName,fileType:'pdf',fileSize:1234}],
  });
  equal(cloudMessagePresentation(cloudPresentation({call:{state:'started',presentation:{generated_file:file}}})).type,'text');
});

Deno.test('all confirmed downloads survive alongside a code artifact without duplicate receipts', () => {
  const file = {success:true as const,id:'one',fileUrl:'https://example.com/one.txt',fileName:'one.txt',fileType:'txt',mimeType:'text/plain',fileSize:12};
  const value=cloudPresentation({
    a:{state:'done',presentation:{generated_file:file}},
    b:{state:'done',presentation:{generated_file:{...file,id:'two',fileName:'two.txt'}}},
    replay:{state:'done',presentation:{generated_file:file}},
    code:{state:'done',presentation:{code_update:{code:'hello',language:'text'}}},
  });
  const message=cloudMessagePresentation(value);
  equal(message.type,'code');
  deepStrictEqual(message.generatedFiles?.map(file=>file.id),['one','two']);
});

Deno.test('confirmed cloud image receipts become reconnectable image messages', () => {
  const image = { success: true, jobId: 'job', imageUrl: 'https://cdn.invalid/a.png',
    imageUrls: ['https://cdn.invalid/a.png'], prompt: 'sunrise', model: 'quick', jobType: 'generate' as const, quota: {} };
  const message = cloudMessagePresentation(cloudPresentation({ image: { state: 'done', presentation: { generated_image: image } } }));
  deepStrictEqual(message.type, 'image');
  deepStrictEqual(message.imageUrls, image.imageUrls);
  deepStrictEqual(message.imagePrompt, image.prompt);
});
