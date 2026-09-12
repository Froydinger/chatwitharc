import {
  cloudFileArguments,
  type CloudFileReceipt,
  type CloudFileStore,
  cloudFileTool,
  renderCloudFile,
} from "./cloudFileTool.ts";
import { cloudFileStore } from "./cloudFileStore.ts";
import type { ClaimedCloudRun } from "./cloudRunWorker.ts";
function assert(v: unknown, message = "Assertion failed"): asserts v {
  if (!v) throw new Error(message);
}
async function rejects(f: () => unknown) {
  let failed = false;
  try {
    await f();
  } catch {
    failed = true;
  }
  assert(failed, "Expected rejection");
}
const decode = (b: Uint8Array) => new TextDecoder().decode(b);
const args = (type: string, content: string) =>
  cloudFileArguments(
    JSON.stringify({ fileType: type, fileName: "Report", content }),
  );
function entries(bytes: Uint8Array) {
  const result = new Map<string, string>();
  let at = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (view.getUint32(at, true) === 0x04034b50) {
    assert(view.getUint16(at + 6, true) === 0x800, "UTF-8 flag");
    const length = view.getUint32(at + 18, true),
      nameLength = view.getUint16(at + 26, true);
    const start = at + 30 + nameLength;
    let crc = 0xffffffff;
    for (const byte of bytes.slice(start, start + length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    assert(
      ((crc ^ 0xffffffff) >>> 0) === view.getUint32(at + 14, true),
      "ZIP CRC",
    );
    result.set(
      decode(bytes.slice(at + 30, start)),
      decode(bytes.slice(start, start + length)),
    );
    at = start + length;
  }
  assert(view.getUint32(at, true) === 0x02014b50, "Central directory");
  assert(view.getUint32(bytes.length - 22, true) === 0x06054b50, "EOCD");
  return result;
}
Deno.test("all formats have truthful extensions, bytes and deterministic rendering", async () => {
  const contents: Record<string, string> = {
    pdf: "Hello (world)\\\n".repeat(100),
    docx: JSON.stringify({
      sections: [{ type: "paragraph", content: "Café <hello> 世界" }],
    }),
    pptx: JSON.stringify({ slides: [{ title: "Hello", content: "World" }] }),
    zip: JSON.stringify({ files: [{ name: "café.txt", content: "世界" }] }),
    txt: "hello",
    md: "# Hello",
    html: "<h1>Hello</h1>",
    json: '{"hello":true}',
    csv: "a,b\n1,2",
  };
  for (const [type, content] of Object.entries(contents)) {
    const a = args(type, content),
      first = await renderCloudFile(a),
      second = await renderCloudFile(a);
    assert(
      first.bytes.every((v, i) => v === second.bytes[i]),
      type + " deterministic",
    );
    if (type === "docx") {
      assert(
        entries(first.bytes).get("word/document.xml")?.includes(
          "Café &lt;hello&gt; 世界",
        ),
      );
    } else if (type === "pptx") {
      assert(
        entries(first.bytes).get("ppt/slides/slide1.xml")?.includes("World"),
      );
    } else if (type === "zip") {
      assert(entries(first.bytes).get("café.txt") === "世界");
    } else if (type === "pdf") {
      const pdf = decode(first.bytes);
      assert(pdf.startsWith("%PDF-1.4"));
      const offset = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
      assert(decode(first.bytes.slice(offset, offset + 4)) === "xref");
      const offsets = [...pdf.matchAll(/(\d{10}) 00000 n/g)].map((m) =>
        Number(m[1])
      );
      offsets.forEach((n, i) =>
        assert(
          decode(first.bytes.slice(n, n + 20)).startsWith(`${i + 1} 0 obj`),
        )
      );
    } else assert(decode(first.bytes) === content);
  }
  assert(args("doc", contents.docx).fileName === "Report.docx");
  assert(args("markdown", "hello").type === "md");
});
Deno.test("reject malformed content, unsafe archives, and unsupported binary formats", async () => {
  for (
    const [type, content] of [
      ["xlsx", "hello"],
      ["json", "bad"],
      ["docx", "{}"],
      ["pptx", '{"slides":[]}'],
      ["zip", '{"files":[{"name":"../x","content":"bad"}]}'],
      [
        "zip",
        '{"files":[{"name":"x","content":"a"},{"name":"X","content":"b"}]}',
      ],
      ["txt", "x".repeat(200001)],
    ]
  ) await rejects(() => args(type, content));
});
const run = {
  id: "run",
  user_id: "11111111-1111-4111-a111-111111111111",
  lease_token: "lease",
  checkpoint: { engine: { turns: 1 } },
} as ClaimedCloudRun;
const call = {
  id: "call",
  name: "generate_file",
  arguments: JSON.stringify({
    fileType: "txt",
    fileName: "Report",
    content: "hello",
  }),
};
const key = "run:turn:1:tool:call";
Deno.test("durable replay reconciles metadata failure with one stable object and no paid provider", async () => {
  let row: CloudFileReceipt | null = null, fail = true, writes = 0;
  const objects = new Map<string, string>();
  const store: CloudFileStore = {
    read: async () => row,
    url: (p) => "https://files/" + p,
    put: async (p, b) => {
      if (!objects.has(p)) {
        objects.set(p, decode(b));
        writes++;
      } else assert(objects.get(p) === decode(b));
    },
    commit: async (r) => {
      if (fail) {
        fail = false;
        throw new Error("timeout");
      }
      row = r;
      return r;
    },
  };
  const tool = cloudFileTool({ store, authorizeOwner: async () => true });
  await rejects(() => tool.execute(run, call, key));
  const done = await tool.execute(run, call, key);
  assert(writes === 1 && row);
  assert(
    JSON.stringify(await tool.execute(run, call, key)) === JSON.stringify(done),
  );
  await rejects(() =>
    tool.execute(run, {
      ...call,
      arguments: call.arguments.replace("hello", "changed"),
    }, key)
  );
  assert(writes === 1);
  await rejects(() => tool.execute(run, call, "wrong-key"));
  const denied = cloudFileTool({ store, authorizeOwner: async () => false });
  await rejects(() => denied.execute(run, call, key));
});
Deno.test("REST adapter reconciles accepted upload timeout and metadata timeout, refuses overwrite", async () => {
  let object: Uint8Array | null = null,
    row: CloudFileReceipt | null = null,
    uploads = 0;
  const mock: typeof fetch = async (input, init) => {
    assert(
      init?.signal instanceof AbortSignal,
      "Every request has an abort signal",
    );
    const url = String(input);
    assert(
      (init?.headers as Record<string, string>).Authorization ===
        "Bearer server-secret",
    );
    if (url.includes("/rest/")) {
      if (init?.method === "POST") {
        row = JSON.parse(String(init.body));
        throw new Error("timeout");
      }
      assert(url.includes("user_id=eq.owner"));
      return Response.json(row ? [row] : []);
    }
    if (init?.method === "POST") {
      uploads++;
      assert((init.headers as Record<string, string>)["x-upsert"] === "false");
      object = new Uint8Array(init.body as Uint8Array);
      throw new Error("timeout");
    }
    return object
      ? new Response(new Uint8Array(object))
      : Response.json({ statusCode: "404" }, { status: 400 });
  };
  const store = cloudFileStore({
    supabaseUrl: "https://local.invalid",
    serviceRoleKey: "server-secret",
    fetch: mock,
  });
  await store.put(
    "owner/cloud/file",
    new TextEncoder().encode("hello"),
    "text/plain",
  );
  await store.put(
    "owner/cloud/file",
    new TextEncoder().encode("hello"),
    "text/plain",
  );
  assert(uploads === 1);
  await rejects(() =>
    store.put(
      "owner/cloud/file",
      new TextEncoder().encode("other"),
      "text/plain",
    )
  );
  assert(uploads === 1);
  const r: CloudFileReceipt = {
    id: "id",
    user_id: "owner",
    file_name: "f.txt",
    file_url: "https://files/f",
    file_type: "txt",
    file_size: 5,
    mime_type: "text/plain",
    prompt: "receipt",
  };
  assert((await store.commit(r)).id === "id");
});

Deno.test("request deadline aborts stalled headers and stalled body, cancelling reader", async () => {
  for (const stalledBody of [false, true]) {
    let signal: AbortSignal | null | undefined;
    let cancelled = false;
    const store = cloudFileStore({
      supabaseUrl: "https://local.invalid",
      serviceRoleKey: "server-secret",
      requestTimeoutMs: 10,
      fetch: async (_, init) => {
        signal = init?.signal;
        if (!stalledBody) return await new Promise<Response>(() => {});
        return new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              return new Promise<void>(() => {});
            },
            cancel() {
              cancelled = true;
            },
          }),
        );
      },
    });
    await rejects(() => store.read("id", "owner"));
    assert(signal?.aborted, "Deadline aborts fetch");
    if (stalledBody) assert(cancelled, "Deadline cancels body");
  }
});

Deno.test("reconciliation cancels objects exceeding 6MB with or without trustworthy length", async () => {
  for (const length of [undefined, "1", "6000001"]) {
    let cancelled = false, reads = 0, requests = 0;
    const store = cloudFileStore({
      supabaseUrl: "https://local.invalid",
      serviceRoleKey: "server-secret",
      fetch: async () => {
        requests++;
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              reads++;
              controller.enqueue(new Uint8Array(3000001));
            },
            cancel() {
              cancelled = true;
            },
          }, { highWaterMark: 0 }),
          { headers: length ? { "content-length": length } : {} },
        );
      },
    });
    await rejects(() =>
      store.put("owner/cloud/file", new Uint8Array(1), "text/plain")
    );
    assert(
      cancelled && requests === 1,
      "Cancel oversized read without uploading",
    );
    assert(
      reads === (length === "6000001" ? 0 : 2),
      "Stop immediately at limit",
    );
  }
});

Deno.test("reconciliation accepts exactly 6MB", async () => {
  const bytes = new Uint8Array(6000000);
  const store = cloudFileStore({
    supabaseUrl: "https://local.invalid",
    serviceRoleKey: "server-secret",
    fetch: async () => new Response(bytes),
  });
  await store.put("owner/cloud/file", bytes, "application/zip");
});

Deno.test("lease cancellation during upload prevents metadata commit", async () => {
  let authorized = true, commits = 0, puts = 0;
  const store: CloudFileStore = {
    read: async () => null,
    url: (p) => "https://files/" + p,
    put: async () => {
      puts++;
      authorized = false;
    },
    commit: async (receipt) => {
      commits++;
      return receipt;
    },
  };
  const tool = cloudFileTool({ store, authorizeOwner: async () => authorized });
  await rejects(() => tool.execute(run, call, key));
  assert(puts === 1 && commits === 0);
});

Deno.test("accepted POST deadline reconciles using a fresh request signal", async () => {
  let object: Uint8Array | null = null,
    uploadSignal: AbortSignal | null | undefined;
  const store = cloudFileStore({
    supabaseUrl: "https://local.invalid",
    serviceRoleKey: "server-secret",
    requestTimeoutMs: 10,
    fetch: async (_, init) => {
      assert(init?.signal && !init.signal.aborted);
      if (init.method === "POST") {
        object = new Uint8Array(init.body as Uint8Array);
        uploadSignal = init.signal;
        return await new Promise<Response>(() => {});
      }
      return object
        ? new Response(new Uint8Array(object))
        : new Response(null, { status: 404 });
    },
  });
  await store.put(
    "owner/cloud/file",
    new Uint8Array([1, 2, 3]),
    "application/zip",
  );
  assert(uploadSignal?.aborted);
});
