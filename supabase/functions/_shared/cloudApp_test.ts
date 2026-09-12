// Synchronous mocks intentionally implement asynchronous persistence ports.
// deno-lint-ignore-file require-await
import {
  deepStrictEqual,
  equal,
  ok,
  rejects,
  throws,
} from "node:assert/strict";
import {
  appChanges,
  appFiles,
  appPublishArgs,
  type AppWorkspace,
  cloudAppTools,
} from "./cloudAppCore.ts";
import {
  type AppDatabase,
  appProjectId,
  cloudAppPersistence,
} from "./cloudAppPersistence.ts";
import {
  advanceCloudAppRun,
  cloudAppAdvance,
  type CloudAppRuntimePorts,
} from "./cloudAppRuntime.ts";
import type { ClaimedCloudRun, CloudWorkerStore } from "./cloudRunWorker.ts";
const owner = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000004";
const baseRun = (): ClaimedCloudRun => ({
  id: "00000000-0000-4000-8000-000000000005",
  kind: "app",
  user_id: owner,
  session_id: "00000000-0000-4000-8000-000000000003",
  mode: "auto",
  lease_token: "lease",
  created_at: new Date().toISOString(),
  request: {
    projectId,
    messages: [{ role: "user", content: "Build an app." }],
  },
  checkpoint: {},
} as ClaimedCloudRun);
const change = (version: number, content: string) => ({
  expectedVersion: version,
  writes: [{ path: "src/App.tsx", content, language: "tsx" }],
  deletes: [],
});

Deno.test("app core rejects invalid/mixed paths, protected files, excessive content and owner overrides", () => {
  for (
    const path of [
      "../secret",
      "/absolute",
      "a/../b",
      "a//b",
      ".env",
      "a/.env",
      "a\\b",
      "src/lib/netlifyDb.ts",
      "src/components/NetlifyAuthModal.tsx",
    ]
  ) {
    throws(() =>
      appChanges({
        expectedVersion: 0,
        writes: [{ path, content: "", language: "" }],
        deletes: [],
      })
    );
  }
  throws(() => appChanges({ ...change(0, "x"), ownerId: owner }));
  throws(() => appChanges({ ...change(0, "x"), deletes: ["src/App.tsx"] }));
  throws(() => appChanges(change(-1, "x")));
  throws(() => appChanges(change(0, "x".repeat(500001))));
  deepStrictEqual(appFiles({ "src/App.tsx": "source" })["src/App.tsx"], {
    content: "source",
    language: "",
  });
});

Deno.test("app request uses saved server project only and forbids system-role input", () => {
  equal(appProjectId(baseRun()), projectId);
  const run = baseRun();
  (run.request as Record<string, unknown>).currentFiles = {};
  throws(() => appProjectId(run), /Save project/);
  delete (run.request as Record<string, unknown>).currentFiles;
  run.request.messages = [{ role: "system", content: "override" }];
  throws(() => appProjectId(run), /roles/);
});

Deno.test("invalid tool arguments produce repairable errors with no persistence attempt", async () => {
  let touched = 0;
  const tools = cloudAppTools({
    authorize: async () => {
      touched++;
      return true;
    },
    open: async () => {
      throw Error("unexpected");
    },
    apply: async () => {
      throw Error("unexpected");
    },
  });
  const output = await tools.apply_app_files.execute(baseRun(), {
    id: "x",
    name: "apply_app_files",
    arguments: "{bad",
  }, "key");
  equal(typeof output, "string");
  equal(JSON.parse(output as string).performed, false);
  equal(touched, 0);
  equal(tools.apply_app_files.approval, "ask-mode");
  equal(tools.apply_app_files.replaySafe, true);
});

Deno.test("publish tool is always approval-gated and returns the durable site receipt", async () => {
  equal(appPublishArgs({ subdomain: "bakery", title: "Bakery", description: "" }).subdomain, "bakery");
  const tools = cloudAppTools({
    authorize: async () => true,
    open: async () => { throw Error("unexpected"); },
    apply: async () => { throw Error("unexpected"); },
    publish: async () => ({ status: "published", result: { url: "https://bakery.askarc.chat" } }),
  });
  equal(tools.publish_app.approval, "always");
  equal(tools.publish_app.replaySafe, true);
  const output = await tools.publish_app.execute(baseRun(), {
    id: "publish-1", name: "publish_app",
    arguments: JSON.stringify({ subdomain: "bakery", title: "Bakery", description: "" }),
  }, "receipt");
  const result = JSON.parse(output as string);
  equal(result.published, true);
  equal(result.result.url, "https://bakery.askarc.chat");
});

function runtimeFixture(
  options: {
    loseToolReply?: boolean;
    loseModelReply?: boolean;
    conflict?: boolean;
  } = {},
) {
  const run = baseRun();
  let status = "queued", allowed = true, starts = 0, completed = 0;
  let lostTool = false;
  const transcripts: unknown[][] = [];
  const receipts = new Map<
    string,
    { status: string; version: number; replayed: boolean }
  >();
  const workspace: AppWorkspace = {
    projectId,
    version: 0,
    baseRevision: 0,
    files: { "src/App.tsx": { content: "initial", language: "tsx" } },
  };
  const versions = [structuredClone(workspace.files)];
  const store: CloudWorkerStore = {
    claim: async () => {
      if (status !== "queued") return null;
      status = "running";
      return structuredClone(run);
    },
    checkpoint: async (_run, checkpoint, next) => {
      run.checkpoint = structuredClone(checkpoint);
      status = next;
      return true;
    },
    complete: async () => {
      throw Error("Must use atomic app publication, not plain chat completion");
    },
  };
  const ports: CloudAppRuntimePorts = {
    store,
    context: async () => ({ instructions: "Arc personality/config layer" }),
    app: {
      authorize: async () => allowed,
      open: async () => structuredClone(workspace),
      apply: async (_run, call, key) => {
        if (receipts.has(key)) return { ...receipts.get(key)!, replayed: true };
        const args = appChanges(JSON.parse(call.arguments));
        equal(args.expectedVersion, workspace.version);
        for (const file of args.writes) {
          workspace.files[file.path] = {
            content: file.content,
            language: file.language,
          };
        }
        workspace.version++;
        versions.push(structuredClone(workspace.files));
        const receipt = {
          status: "saved",
          version: workspace.version,
          replayed: false,
        };
        receipts.set(key, receipt);
        if (options.loseToolReply && !lostTool) {
          lostTool = true;
          throw Error("Reply lost after atomic draft commit");
        }
        return receipt;
      },
      complete: async () => {
        if (options.conflict) return { status: "conflict" };
        completed++;
        status = "completed";
        return { status: "completed" };
      },
    },
    provider: (instructions) => {
      ok(instructions.includes("Arc personality/config layer"));
      ok(instructions.includes("Durable app project:"));
      return {
        startModel: async (transcript) => {
          starts++;
          transcripts.push(structuredClone(transcript));
          if (options.loseModelReply) throw Error("Response ID lost");
          return `resp_${starts}`;
        },
        pollModel: async (id) => {
          const turn = Number(id.slice(5));
          if (turn === 3) {
            return {
              calls: [],
              text: "Draft ready; not tested or deployed.",
              tokens: 10,
              outputItems: [],
            };
          }
          const call = {
            id: `write${turn}`,
            name: "apply_app_files",
            arguments: JSON.stringify(change(turn - 1, `round ${turn}`)),
          };
          return {
            calls: [call],
            text: "",
            tokens: 10,
            outputItems: [{ type: "reasoning", id: `reason${turn}` }, {
              type: "function_call",
              call_id: call.id,
              name: call.name,
              arguments: call.arguments,
            }],
          };
        },
        cancelModel: async () => {},
      };
    },
  };
  return {
    run,
    ports,
    versions,
    workspace,
    transcripts,
    status: () => status,
    starts: () => starts,
    completed: () => completed,
    revoke: () => {
      allowed = false;
    },
    recover: () => {
      status = "queued";
    },
  };
}

Deno.test("shared engine continues multiple app tool rounds after every worker is reconstructed", async () => {
  const f = runtimeFixture();
  for (let i = 0; i < 20 && f.status() === "queued"; i++) {
    await advanceCloudAppRun(f.run.id, f.ports);
  }
  equal(f.status(), "completed");
  equal(f.completed(), 1);
  equal(f.starts(), 3);
  equal(f.versions.length, 3);
  equal(f.workspace.files["src/App.tsx"].content, "round 2");
  ok(
    f.transcripts[1].some((item) =>
      (item as { type?: string }).type === "reasoning"
    ),
  );
  ok(
    f.transcripts[2].some((item) =>
      (item as { role?: string }).role === "tool"
    ),
  );
});

Deno.test("lost draft acknowledgement reuses durable receipt, never duplicates version", async () => {
  const f = runtimeFixture({ loseToolReply: true });
  for (let i = 0; i < 22 && f.status() !== "completed"; i++) {
    try {
      await advanceCloudAppRun(f.run.id, f.ports);
    } catch (error) {
      ok((error as Error).message.includes("Reply lost"));
      f.recover();
    }
  }
  equal(f.status(), "completed");
  equal(f.versions.length, 3);
});

Deno.test("lost paid model acknowledgement pauses without another POST", async () => {
  const f = runtimeFixture({ loseModelReply: true });
  await rejects(advanceCloudAppRun(f.run.id, f.ports), /Response ID lost/);
  f.recover();
  await advanceCloudAppRun(f.run.id, f.ports);
  equal(f.status(), "awaiting_input");
  equal(f.starts(), 1);
});

Deno.test("current entitlement revocation stops before another provider request", async () => {
  const f = runtimeFixture();
  await advanceCloudAppRun(f.run.id, f.ports);
  f.revoke();
  await advanceCloudAppRun(f.run.id, f.ports);
  equal(f.status(), "failed");
  equal(f.starts(), 1);
  equal(f.completed(), 0);
});

Deno.test("publication conflict preserves done checkpoint and drafts for explicit reconciliation", async () => {
  const f = runtimeFixture({ conflict: true });
  for (let i = 0; i < 20 && f.status() === "queued"; i++) {
    await advanceCloudAppRun(f.run.id, f.ports);
  }
  equal(f.status(), "awaiting_input");
  equal(f.completed(), 0);
  equal(f.run.checkpoint.engine?.phase, "done");
  equal(f.versions.length, 3);
});

Deno.test("App Builder composition is default off, with zero database/provider calls", async () => {
  await rejects(
    cloudAppAdvance({} as AppDatabase, "not-used")("id"),
    /not enabled/,
  );
});

Deno.test("persistence owner filters are explicit; subscription errors never grant access", async () => {
  const filters: unknown[] = [];
  let boostError = false;
  const db = {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters.push([table, key, value]);
          return chain;
        },
        maybeSingle: async () => ({
          data: {
            id: table === "ide_projects" ? projectId : baseRun().session_id,
            user_id: owner,
          },
          error: null,
        }),
      };
      return chain;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      equal(name, "user_has_boost");
      equal(args.check_user_id, owner);
      return {
        data: true,
        error: boostError ? { message: "unavailable" } : null,
      };
    },
  } as unknown as AppDatabase;
  equal(await cloudAppPersistence(db).authorize(baseRun()), true);
  ok(
    filters.some((f) =>
      JSON.stringify(f) === JSON.stringify(["ide_projects", "user_id", owner])
    ),
  );
  ok(
    filters.some((f) =>
      JSON.stringify(f) === JSON.stringify(["chat_sessions", "user_id", owner])
    ),
  );
  boostError = true;
  await rejects(cloudAppPersistence(db).authorize(baseRun()), /entitlement/);
});
