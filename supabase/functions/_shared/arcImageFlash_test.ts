import { uploadPrivateImage } from "./privateImageStorage.ts";
import { ARC_IMAGE_FLASH_MODEL, callImageFlash, extractImageFlashOutput, imageFlashAspect, imageFlashInputs } from "./arcImageFlash.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value { if (!value) throw new Error(message); }
const encoded = btoa("final image bytes");
const completed = { status: "completed", steps: [
  { type: "thought", summary: [{ type: "image", mime_type: "image/png", data: btoa("private thought") }] },
  { type: "model_output", content: [{ type: "text", text: "result" }, { type: "image", mime_type: "image/jpeg", data: encoded }] },
] };
Deno.test("Image Flash excludes thought images, unfinished results and URI-only output", () => {
  assert(extractImageFlashOutput(completed) === encoded);
  for (const status of ["incomplete", "failed", "requires_action", "queued"]) assert(extractImageFlashOutput({ ...completed, status }) === null);
  assert(extractImageFlashOutput({ status: "completed", steps: [completed.steps[0]] }) === null);
  assert(extractImageFlashOutput({ status: "completed", steps: [{ type: "model_output", content: [{ type: "image", mime_type: "image/png", uri: "https://example.com/image.png" }] }] }) === null);
});
Deno.test("Image Flash uses native API, no provider storage, bounded batch, preserves successful outputs", async () => {
  let calls = 0;
  const result = await callImageFlash({ apiKey: "fixture-key", prompt: "owned prompt", aspect: "16:9", count: 3,
    images: [{ data: encoded, mime_type: "image/png" }], fetchImpl: async (url, init) => {
      assert(String(url).endsWith("/v1beta/interactions"));
      const body = JSON.parse(String(init?.body));
      assert(body.model === ARC_IMAGE_FLASH_MODEL && body.store === false && body.stream === false);
      assert(body.response_format.mime_type === "image/jpeg");
      assert(body.response_format.aspect_ratio === "16:9" && body.response_format.image_size === "1K");
      assert(body.input[1].data === encoded && body.input[1].type === "image");
      assert(new Headers(init?.headers).get("x-goog-api-key") === "fixture-key");
      return ++calls === 2 ? new Response("private provider error fixture-key", { status: 503 }) : Response.json(completed);
    } });
  assert(calls === 3 && result.ok && JSON.parse(result.rawText).data.length === 2);
  for (const item of JSON.parse(result.rawText).data) assert(item.url === `data:image/jpeg;base64,${encoded}` && !item.b64_json);
});
Deno.test("Image Flash fails closed, does not retry accepted calls or expose provider error/key", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => { calls++; throw new Error("fixture-key"); };
  assert(!(await callImageFlash({ apiKey: undefined, prompt: "p", aspect: "1:1", count: 1, fetchImpl })).ok && calls === 0);
  assert(!(await callImageFlash({ apiKey: "fixture-key", prompt: "p", aspect: "1:1", count: 4, fetchImpl })).ok && calls === 0);
  const failed = await callImageFlash({ apiKey: "fixture-key", prompt: "p", aspect: "1:1", count: 1, fetchImpl });
  assert(!failed.ok && Number(calls) === 1 && !failed.rawText.includes("fixture-key"));
  const timed = await callImageFlash({ apiKey: "fixture-key", prompt: "p", aspect: "1:1", count: 1, timeoutMs: 5,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")))) });
  assert(!timed.ok && timed.status === 408);
});
Deno.test("Image Flash keeps edit source shape and source bytes", async () => {
  assert(imageFlashAspect("source", 1920, 1080) === "16:9");
  assert(imageFlashAspect("source", 900, 1200) === "3:4");
  assert(imageFlashAspect("1:1", 1920, 1080) === "1:1");
  const sources = await imageFlashInputs([{ blob: new Blob([new Uint8Array([0, 128, 255])], { type: "image/png" }) }]);
  assert(sources[0].data === "AID/" && sources[0].mime_type === "image/png");
});

Deno.test("Image Flash JPEG survives the generation/edit adapter and private storage", async () => {
  const result = await callImageFlash({ apiKey: "fixture-key", prompt: "boat", aspect: "3:2", count: 1,
    fetchImpl: async () => Response.json(completed) });
  const item = JSON.parse(result.rawText).data[0];
  let saved = false;
  const storage = { storage: { from(bucket: string) {
    assert(bucket === "private-user-images");
    return { upload(path: string, bytes: Uint8Array, options: { contentType: string }) {
      assert(path.startsWith("owner/generated-") && path.endsWith(".jpg"));
      assert(options.contentType === "image/jpeg");
      assert(new TextDecoder().decode(bytes) === atob(encoded));
      saved = true;
      return Promise.resolve({ error: null });
    } };
  } } };
  const reference = await uploadPrivateImage(storage, item.url, { userId: "owner", kind: "generated" });
  assert(saved && reference.startsWith("private-image://private-user-images/owner/"));
  assert(extractImageFlashOutput({ status: "completed", steps: [{ type: "model_output", content: [
    { type: "image", mime_type: "image/png", data: encoded },
  ] }] }) === null);
});
