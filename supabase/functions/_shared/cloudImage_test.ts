import {
  cloudImageArguments,
  CloudImagePending,
  type CloudImageProvider,
  type CloudImageReceipt,
  CloudImageRecoveryRequired,
  CloudImageRejected,
  type CloudImageStore,
  cloudImageTool,
} from "./cloudImageTool.ts";
import {
  cloudImageBase64,
  cloudImageDigest,
  cloudImageProvider,
  cloudImageSourceUrl,
} from "./cloudImageProvider.ts";
import { cloudImageMedia } from "./cloudImageMedia.ts";
import { cloudImageRequest } from "./cloudImageHttp.ts";
import { cloudImageStore } from "./cloudImageStore.ts";
import { recoverCloudImage } from "./cloudImageRecovery.ts";
import type { ClaimedCloudRun } from "./cloudRunWorker.ts";
const assert = (v: unknown, m = "assertion failed") => {
  if (!v) throw new Error(m);
};
async function rejects(f: () => unknown, type?: new (...args: any[]) => Error) {
  try {
    await f();
  } catch (e) {
    if (type) assert(e instanceof type);
    return;
  }
  throw new Error("expected failure");
}
const owner = "11111111-1111-4111-a111-111111111111",
  job = "22222222-2222-4222-a222-222222222222";
const run = {
  id: "run",
  user_id: owner,
  lease_token: "lease",
  checkpoint: { engine: { turns: 1 } },
} as ClaimedCloudRun;
const call = {
  id: "call",
  name: "generate_image",
  arguments: JSON.stringify({
    prompt: "A tree",
    model: "quick",
    aspectRatio: "1:1",
    count: 1,
    sourceUrls: [],
    transparent: false,
  }),
};
const key = "run:turn:1:tool:call";
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
function fixture(count = 1) {
  const args = { ...cloudImageArguments(call), count };
  const c = {
    ...call,
    arguments: JSON.stringify({
      prompt: args.prompt,
      model: "quick",
      aspectRatio: args.aspectRatio,
      count,
      sourceUrls: [],
      transparent: false,
    }),
  };
  let receipt: CloudImageReceipt = {
    receipt_key: key,
    run_id: run.id,
    user_id: owner,
    call: c,
    args,
    job_id: job,
    slots: Array.from({ length: count }, () => ({ state: "ready" })),
    settled: false,
    quota: { allowed: true },
  };
  let posts = 0,
    saves = 0,
    failUpload = false,
    unknown = false,
    failProvider = false;
  const store: CloudImageStore = {
    step: async (_r, _c, _k, action, _args, i = 0, value) => {
      receipt.dispatch = false;
      const s = receipt.slots[i];
      if (action === "start" && s.state === "ready") {
        s.state = "submitting";
        receipt.dispatch = true;
      }
      if (action === "accept" && s.state === "submitting") {
        s.state = "pending";
        s.responseId = value;
      }
      if (action === "finish") {
        s.state = "done";
        s.url = value;
      }
      if (action === "fail" || action === "cancel_ready") s.state = "failed";
      receipt.settled = receipt.slots.every((s) =>
        ["done", "failed"].includes(s.state)
      );
      return structuredClone(receipt);
    },
  };
  const provider: CloudImageProvider = {
    start: async () => {
      posts++;
      if (unknown) throw new Error("timeout");
      return "resp_test";
    },
    poll: async () =>
      failProvider ? { state: "failed" } : { state: "done", bytes: png },
  };
  const media = {
    save: async () => {
      saves++;
      if (failUpload) throw new Error("storage");
      return `https://r2.invalid/objects/${owner}/cloud-${job}-0.png`;
    },
  };
  const tool = cloudImageTool({
    store,
    provider,
    media,
    authorizeOwner: async () => true,
  });
  return {
    tool,
    store,
    provider,
    media,
    call: c,
    get receipt() {
      return structuredClone(receipt);
    },
    get posts() {
      return posts;
    },
    get saves() {
      return saves;
    },
    set unknown(v: boolean) {
      unknown = v;
    },
    set failUpload(v: boolean) {
      failUpload = v;
    },
    set failProvider(v: boolean) {
      failProvider = v;
    },
  };
}
Deno.test("image lifecycle resumes provider result after failed upload without another paid submission", async () => {
  const f = fixture();
  await rejects(() => f.tool.execute(run, f.call, key), CloudImagePending);
  f.failUpload = true;
  await rejects(() => f.tool.execute(run, f.call, key));
  assert(f.posts === 1);
  f.failUpload = false;
  const result = await f.tool.execute(run, f.call, key);
  assert(typeof result !== "string" && JSON.parse(result.output).success);
  assert(f.posts === 1 && f.receipt.settled);
  await f.tool.execute(run, f.call, key);
  assert(f.posts === 1 && f.saves === 2);
});
Deno.test("unknown acceptance never repeats paid POST and can attach verified response ID during recovery", async () => {
  const f = fixture();
  f.unknown = true;
  await rejects(
    () => f.tool.execute(run, f.call, key),
    CloudImageRecoveryRequired,
  );
  await rejects(
    () => f.tool.execute(run, f.call, key),
    CloudImageRecoveryRequired,
  );
  assert(f.posts === 1);
  const r = await recoverCloudImage(f.receipt, {
    store: f.store,
    provider: f.provider,
    media: f.media,
    abandonReady: true,
    recoveredResponseIds: { 0: "resp_test" },
  });
  assert(r.settled && r.slots[0].state === "done" && f.posts === 1);
});
Deno.test("cancelled batch recovers accepted slot and abandons unsubmitted slots with no paid starts", async () => {
  const f = fixture(3);
  await rejects(() => f.tool.execute(run, f.call, key), CloudImagePending);
  const r = await recoverCloudImage(f.receipt, {
    store: f.store,
    provider: f.provider,
    media: f.media,
    abandonReady: true,
  });
  assert(
    r.settled && r.slots.filter((s) => s.state === "done").length === 1 &&
      f.posts === 1,
  );
});
Deno.test("confirmed provider failure is terminal and replay does not regenerate", async () => {
  const f = fixture();
  await rejects(() => f.tool.execute(run, f.call, key), CloudImagePending);
  f.failProvider = true;
  const result = await f.tool.execute(run, f.call, key);
  assert(
    typeof result !== "string" && !JSON.parse(result.output).success &&
      f.posts === 1,
  );
});
Deno.test("owner-only media blocks arbitrary URLs, cross-owner paths, credentials and redirects", async () => {
  for (
    const url of [
      "https://evil.invalid/x",
      `https://r2.invalid/objects/other/x.png`,
      `https://r2.invalid/objects/${owner}/x?token=secret`,
      `https://user:pass@r2.invalid/objects/${owner}/x`,
    ]
  ) {
    await rejects(() =>
      cloudImageSourceUrl(
        url,
        owner,
        "https://r2.invalid",
        "https://sb.invalid",
      )
    );
  }
  assert(
    cloudImageSourceUrl(
      `https://r2.invalid/objects/${owner}/x.png`,
      owner,
      "https://r2.invalid",
      "https://sb.invalid",
    ),
  );
});
Deno.test("background provider preserves Quick/Pro model, edits and binds recovery to metadata", async () => {
  let posts = 0;
  let body: any;
  const provider = cloudImageProvider({
    apiKey: "server",
    r2WorkerUrl: "https://r2.invalid",
    supabaseUrl: "https://sb.invalid",
    fetch: async (url, init) => {
      assert(init?.signal instanceof AbortSignal && init.redirect === "error");
      if (String(url).startsWith("https://r2.invalid")) {
        assert(!init?.headers);
        return new Response(png);
      }
      if (init?.method === "POST") {
        posts++;
        body = JSON.parse(String(init.body));
        return Response.json({ id: "resp_test" });
      }
      return Response.json({
        id: "resp_test",
        metadata: {
          cloud_image_key: await cloudImageDigest(key),
          cloud_image_slot: "0",
        },
        status: "completed",
        output: [{
          type: "image_generation_call",
          status: "completed",
          result: cloudImageBase64(png),
        }],
      });
    },
  });
  const a = {
    ...cloudImageArguments(call),
    kind: "edit" as const,
    model: "gpt-image-2.5-sunburst",
    sourceUrls: [`https://r2.invalid/objects/${owner}/input.png`],
  };
  assert(await provider.start(a, owner, key, 0) === "resp_test");
  assert(
    body.background && body.store && body.tools[0].action === "edit" &&
      body.tools[0].model === a.model && body.max_tool_calls === 1,
  );
  assert(
    body.input[0].content[1].image_url.startsWith("data:image/png;base64,"),
  );
  assert((await provider.poll("resp_test", key, 0)).state === "done");
  await rejects(() => provider.poll("resp_test", "other", 0));
  assert(posts === 1);
});

Deno.test("cloud image generation defaults to Pro Sunburst", () => {
  const args = cloudImageArguments({
    id: "default-model",
    name: "generate_image",
    arguments: JSON.stringify({
      prompt: "A tree",
      aspectRatio: "1:1",
      count: 1,
      sourceUrls: [],
      transparent: false,
    }),
  });
  assert(args.model === "gpt-image-2.5-sunburst");
});

Deno.test("transient image polling stays pending without burning run attempts", async () => {
  for (const status of [408, 409, 425, 429, 500, 502, 503, 504]) {
    const provider = cloudImageProvider({
      apiKey: "server",
      r2WorkerUrl: "https://r2.invalid",
      supabaseUrl: "https://sb.invalid",
      fetch: async () => new Response("temporary", { status }),
    });
    const result = await provider.poll("resp_test", key, 0);
    assert(
      result.state === "pending",
      `expected status ${status} to remain pending`,
    );
  }
  const timedOut = cloudImageProvider({
    apiKey: "server",
    r2WorkerUrl: "https://r2.invalid",
    supabaseUrl: "https://sb.invalid",
    fetch: async () => {
      throw new Error("Image network timeout");
    },
  });
  assert((await timedOut.poll("resp_test", key, 0)).state === "pending");
});

Deno.test("durable image receipt and storage outages requeue safely", async () => {
  const args = cloudImageArguments(call);
  const store = cloudImageStore({
    supabaseUrl: "https://sb.invalid",
    serviceRoleKey: "server",
    fetch: async () => {
      throw new Error("network unavailable");
    },
  });
  await rejects(
    () => store.step(run, call, key, "begin", args),
    CloudImagePending,
  );
  const media = cloudImageMedia({
    workerUrl: "https://r2.invalid",
    workerSecret: "server",
    fetch: async () => new Response("temporary", { status: 503 }),
  });
  await rejects(
    () => media.save(owner, job, 0, png, args),
    CloudImagePending,
  );
});

Deno.test("provider 5xx is ambiguous, explicit 400 is rejected, no retries", async () => {
  for (const status of [400, 500]) {
    let calls = 0;
    const p = cloudImageProvider({
      apiKey: "server",
      r2WorkerUrl: "https://r2.invalid",
      supabaseUrl: "https://sb.invalid",
      fetch: async () => {
        calls++;
        return new Response("{}", { status });
      },
    });
    await rejects(
      () => p.start(cloudImageArguments(call), owner, key, 0),
      status === 400 ? CloudImageRejected : Error,
    );
    assert(calls === 1);
  }
});
Deno.test("R2 accepted upload timeout reconciles identical stable object", async () => {
  let bytes: Uint8Array | null = null, puts = 0;
  const media = cloudImageMedia({
    workerUrl: "https://r2.invalid",
    workerSecret: "server",
    fetch: async (_url, init) => {
      if (init?.method === "PUT") {
        puts++;
        bytes = new Uint8Array(init.body as Uint8Array);
        throw new Error("timeout");
      }
      return bytes
        ? new Response(new Uint8Array(bytes))
        : new Response(null, { status: 404 });
    },
  });
  const url = await media.save(owner, job, 0, png, cloudImageArguments(call));
  assert(url.includes(owner) && puts === 1);
  await media.save(owner, job, 0, png, cloudImageArguments(call));
  assert(puts === 1);
});
Deno.test("image HTTP deadline and streamed byte cap cancel bodies", async () => {
  let cancelled = false;
  await rejects(() =>
    cloudImageRequest(
      async () =>
        new Response(
          new ReadableStream({
            pull(c) {
              c.enqueue(new Uint8Array(11));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
      "https://local.invalid",
      {},
      10,
    )
  );
  assert(cancelled);
  let signal: AbortSignal | null | undefined;
  await rejects(() =>
    cloudImageRequest(
      async (_u, i) => {
        signal = i?.signal;
        return await new Promise<Response>(() => {});
      },
      "https://local.invalid",
      {},
      10,
      5,
    )
  );
  assert(signal?.aborted);
});

Deno.test("claim cancellation after edit-source download blocks provider POST", async () => {
  let posts = 0, reads = 0;
  const provider = cloudImageProvider({
    apiKey: "server",
    r2WorkerUrl: "https://r2.invalid",
    supabaseUrl: "https://sb.invalid",
    fetch: async (_url, init) => {
      if (init?.method === "POST") posts++;
      else reads++;
      return new Response(png);
    },
  });
  await rejects(
    () =>
      provider.start(
        {
          ...cloudImageArguments(call),
          kind: "edit",
          sourceUrls: [`https://r2.invalid/objects/${owner}/source.png`],
        },
        owner,
        key,
        0,
        async () => false,
      ),
    CloudImageRejected,
  );
  assert(reads === 1 && posts === 0);
});
