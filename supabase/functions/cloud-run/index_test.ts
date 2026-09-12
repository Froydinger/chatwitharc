import {
  canonical,
  handleCloudRun,
  publicRun,
  validateAction,
} from "./index.ts";

const id = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const owner = "00000000-0000-4000-8000-000000000003";
const submit = {
  action: "submit",
  id,
  sessionId,
  kind: "chat",
  mode: "auto",
  expectedRevision: 4,
  userMessage: {
    id: "user-message-1",
    role: "user",
    type: "text",
    content: "Hello",
    timestamp: "2026-09-12T00:00:00.000Z",
  },
  request: {
    messages: [{ role: "user", content: "Hello" }],
    reasoningEffort: "high",
  },
};

Deno.test('workspace snapshot closed schema, full content and raw message preserved',()=>{
  const workspace={kind:'code',content:'console.log(1);\n'.repeat(2000),language:'javascript',label:'Current'};
  const accepted=validateAction({...submit,request:{...submit.request,workspace_context:workspace}});
  assert(accepted.action==='submit');
  assert(canonical(accepted.request.workspace_context)===canonical(workspace));
  assert(accepted.userMessage.content==='Hello');
  validateAction({...submit,request:{...submit.request,workspace_context:{kind:'canvas',content:''}}});
  for(const workspace_context of [null,[],{kind:'code',content:'x',system:'forged'},
    {kind:'other',content:'x'},{kind:'code',content:123},{kind:'code',content:'x'.repeat(400001)},
    {kind:'code',content:'x',language:null},{kind:'canvas',content:'x',label:'x'.repeat(201)},
    {kind:'code',content:'secret-test-bearer'}]) rejects({...submit,request:{...submit.request,workspace_context}});
});

Deno.test('app discovery exposes only validated project association, not source request', () => {
  const projectId='00000000-0000-4000-8000-000000000004';
  for(const data of [{project_id:projectId},{request:{projectId,messages:['PRIVATE']}}]) {
    const projected=publicRun({...row(),kind:'app',...data});
    assert(projected.projectId===projectId);
    assert(!JSON.stringify(projected).includes('PRIVATE'));
    assert(!('request' in projected));
  }
  assert(!('projectId' in publicRun({...row(),kind:'chat',project_id:projectId})));
  assert(!('projectId' in publicRun({...row(),kind:'app',project_id:'invalid'})));
});

Deno.test('app submit enforces activation, owned project and current Boost before atomic acceptance', async () => {
  const projectId = '00000000-0000-4000-8000-000000000004';
  const app = {...submit, kind:'app', request:{...submit.request,projectId}};
  assert((await exercise(app,[auth()])).status === 503);
  for (const boost of [false,true]) {
    const steps: Step[] = [auth(),
      {method:'GET',path:'/rest/v1/chat_sessions',data:{id:sessionId,user_id:owner},
        inspect:url=>assert(url.searchParams.get('user_id')===`eq.${owner}`)},
      {method:'GET',path:'/rest/v1/ide_projects',data:{id:projectId,user_id:owner},
        inspect:url=>{assert(url.searchParams.get('id')===`eq.${projectId}`);assert(url.searchParams.get('user_id')===`eq.${owner}`);}},
      {method:'POST',path:'/rest/v1/rpc/user_has_boost',data:boost,
        inspect:(_url,body)=>assert(canonical(body)===canonical({check_user_id:owner}))},
    ];
    if(boost) steps.push(submitRpc(),read({...row(),kind:'app'}));
    assert((await exercise(app,steps,'true','true')).status === (boost?202:403));
  }
});

Deno.test('regular Ask chat is durable for free users while Arc Cloud Auto is Boost-only', async () => {
  const ask = { ...submit, mode: 'ask' as const };
  const accepted = await exercise(ask, [auth(), submitRpc(), read(row())]);
  assert(accepted.status === 202);

  const denied = await exercise(submit, [auth(), { ...boost(), data: false }]);
  assert(denied.status === 403);
});

Deno.test('workspace reaches atomic submit RPC unchanged without augmenting visible user',async()=>{
  const workspace={kind:'canvas',content:'Current live draft\nwith exact spacing  '};
  const response=await exercise({...submit,request:{...submit.request,workspace_context:workspace}},[auth(),boost(),{
    ...submitRpc(),inspect:(_url,body)=>{
      const payload=body as Record<string,unknown>;
      assert(canonical((payload.p_request as Record<string,unknown>).workspace_context)===canonical(workspace));
      assert(canonical(payload.p_user_message)===canonical(submit.userMessage));
    },
  },read(row())]);
  assert(response.status===202);
});

Deno.test("discovery schema is closed and bounded", () => {
  assert(validateAction({ action: "list" }).action === "list");
  for (
    const input of [
      { action: "list", user_id: owner },
      { action: "list", limit: 101 },
      { action: "list", limit: 0 },
      { action: "list", limit: 1.5 },
      { action: "list", cursor: "bad" },
      { action: "list", includeTerminal: "true" },
      { action: "list", sessionId: "bad" },
    ]
  ) rejects(input);
});

Deno.test("discovery filters owner/session and active states; sanitizes bounded page", async () => {
  const nextId = "00000000-0000-4000-8000-000000000004";
  const response = await exercise({ action: "list", sessionId, limit: 1 }, [
    auth(),
    {
      method: "GET",
      path: "/rest/v1/cloud_runs",
      data: [
        {
          ...row("running"),
          checkpoint: {
            engine: { phase: "tools", transcript: ["PRIVATE"] },
            inputResponse: "PRIVATE",
          },
        },
        { ...row(), id: nextId },
      ],
      inspect: (url) => {
        assert(url.searchParams.get("user_id") === `eq.${owner}`);
        assert(url.searchParams.get("session_id") === `eq.${sessionId}`);
        assert(
          url.searchParams.get("status") ===
            "in.(queued,running,awaiting_input)",
        );
        assert(url.searchParams.get("limit") === "2");
        assert(url.searchParams.get("order") === "id.asc");
        assert(url.searchParams.get("select")?.includes("project_id:request->>projectId"));
        assert(!url.searchParams.get("select")?.split(',').includes("request"));
      },
    },
  ]);
  assert(response.status === 200 && response.body.runs.length === 1);
  assert(
    response.body.nextCursor === id &&
      response.body.runs[0].sessionId === sessionId,
  );
  assert(!JSON.stringify(response.body).includes("PRIVATE"));
  assert(!("user_id" in response.body.runs[0]));
});

Deno.test("discovery cursor and terminal lookup remain owner scoped", async () => {
  const response = await exercise({
    action: "list",
    cursor: id,
    includeTerminal: true,
  }, [auth(), {
    method: "GET",
    path: "/rest/v1/cloud_runs",
    data: [],
    inspect: (url) => {
      assert(url.searchParams.get("user_id") === `eq.${owner}`);
      assert(url.searchParams.get("id") === `gt.${id}`);
      assert(!url.searchParams.has("status"));
      assert(url.searchParams.get("limit") === "26");
    },
  }]);
  assert(response.body.runs.length === 0 && response.body.nextCursor === null);
});
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function rejects(value: unknown) {
  try {
    validateAction(value, "secret-test-bearer");
  } catch {
    return;
  }
  throw new Error("Expected validation failure");
}

Deno.test("closed payload schema, UUIDs, reasoning and credential rejection", () => {
  assert(validateAction(submit).action === "submit");
  for (const reasoningEffort of ["low", "medium", "high"]) {
    validateAction({
      ...submit,
      request: { ...submit.request, reasoningEffort },
    });
  }
  rejects({ ...submit, user_id: owner });
  rejects({ ...submit, id: "not-uuid" });
  rejects({ ...submit, mode: "deep" });
  rejects({
    ...submit,
    request: { ...submit.request, access_token: "secret" },
  });
  rejects({ ...submit, request: { ...submit.request, profile: { auth: {} } } });
  rejects({
    ...submit,
    request: { messages: [{ role: "user", content: "secret-test-bearer" }] },
  });
  rejects({
    action: "respond",
    id,
    response: { answers: { Authorization: "x" } },
  });
  rejects({ action: "respond", id, response: {} });
  assert(
    validateAction({
      action: "respond",
      id,
      response: { text: "Yes", answers: { color: "black" } },
    }).action === "respond",
  );
});

Deno.test("app files allowlist and canonical equality", () => {
  validateAction({
    ...submit,
    kind: "app",
    request: {
      messages: submit.request.messages,
      currentFiles: { "src/App.tsx": { content: "", language: "typescript" } },
    },
  });
  rejects({
    ...submit,
    kind: "app",
    request: {
      messages: submit.request.messages,
      currentFiles: { "../escape": "x" },
    },
  });
  assert(
    canonical({ b: 2, a: { d: 3, c: 4 } }) ===
      canonical({ a: { c: 4, d: 3 }, b: 2 }),
  );
  assert(canonical(["a", "b"]) !== canonical(["b", "a"]));
});

Deno.test("client messages accept only user and assistant roles for chat and app", () => {
  for (const kind of ["chat", "app"]) {
    for (const role of ["system", "developer", "tool"]) {
      rejects({
        ...submit,
        kind,
        request: { messages: [{ role, content: "Untrusted instructions" }] },
      });
    }
    validateAction({
      ...submit,
      kind,
      request: {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
        ],
      },
    });
  }
});

Deno.test("public checkpoint exposes only progress and exact pending approval fields", () => {
  const privateCheckpoint = {
    engine: {
      phase: "tools",
      turns: 2,
      tokens: 140,
      transcript: ["PRIVATE_REASONING"],
      receipts: { secret: "PRIVATE_RECEIPT" },
      responseId: "PRIVATE_PROVIDER_ID",
    },
    pendingApproval: {
      callId: "call_123",
      argumentsHash: "hash",
      name: "send_notification",
      arguments: '{"message":"Hello"}',
      reasoning: "PRIVATE_REASONING",
      inputResponse: "PRIVATE_INPUT",
    },
    inputResponse: "PRIVATE_INPUT",
    receipts: "PRIVATE_RECEIPT",
    reasoning: "PRIVATE_REASONING",
  };
  const original = canonical(privateCheckpoint);
  const output = publicRun({
    id,
    status: "awaiting_input",
    checkpoint: privateCheckpoint,
  });
  assert(
    canonical(output.checkpoint) === canonical({
      progress: { phase: "tools", turns: 2, tokens: 140 },
      pendingApproval: {
        callId: "call_123",
        argumentsHash: "hash",
        name: "send_notification",
        arguments: '{"message":"Hello"}',
      },
    }),
  );
  assert(!JSON.stringify(output).includes("PRIVATE_"));
  assert(canonical(privateCheckpoint) === original);
  assert(
    publicRun({ id, status: "completed", checkpoint: privateCheckpoint })
      .checkpoint.pendingApproval === null,
  );
  const malformed = publicRun({
    id,
    status: "awaiting_input",
    checkpoint: {
      engine: {
        phase: { transcript: "PRIVATE" },
        turns: "PRIVATE",
        tokens: -1,
      },
      pendingApproval: { callId: "call", argumentsHash: { secret: "PRIVATE" } },
    },
  });
  assert(
    canonical(malformed.checkpoint) ===
      canonical({
        progress: { phase: null, turns: null, tokens: null },
        pendingApproval: null,
      }),
  );
});

Deno.test("status endpoint uses public checkpoint projection", async () => {
  const result = await exercise({ action: "status", id }, [
    auth(),
    read({
      ...row("running"),
      checkpoint: {
        engine: {
          phase: "model",
          turns: 1,
          tokens: 20,
          transcript: ["PRIVATE_REASONING"],
        },
        inputResponse: "PRIVATE_INPUT",
      },
    }),
  ]);
  assert(result.status === 200);
  assert(!JSON.stringify(result.body).includes("PRIVATE_"));
  assert(
    canonical(result.body.checkpoint) ===
      canonical({
        progress: { phase: "model", turns: 1, tokens: 20 },
        pendingApproval: null,
      }),
  );
});

type Step = {
  method: string;
  path: string;
  status?: number;
  data: unknown;
  inspect?: (url: URL, body: Record<string, unknown>) => void;
};
async function exercise(body: unknown, steps: Step[], enabled = "true", appEnabled = "false") {
  const names = [
    "CLOUD_RUNS_ENABLED",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CLOUD_APP_RUNS_ENABLED",
  ];
  const oldEnv = names.map((name) => Deno.env.get(name));
  const oldFetch = globalThis.fetch;
  Deno.env.set(names[0], enabled);
  Deno.env.set(names[1], "https://cloud-run-test.invalid");
  Deno.env.set(names[2], "test-service-key");
  Deno.env.set(names[3], appEnabled);
  globalThis.fetch = async (input, init) => {
    const step = steps.shift();
    assert(step, "Unexpected HTTP call (possibly provider/dispatcher)");
    const url = new URL(String(input));
    assert(url.hostname === "cloud-run-test.invalid");
    assert(url.pathname === step.path, `Unexpected path ${url.pathname}`);
    assert((init?.method ?? "GET") === step.method);
    const payload = init?.body ? JSON.parse(String(init.body)) : {};
    step.inspect?.(url, payload);
    return new Response(JSON.stringify(step.data), {
      status: step.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const response = await handleCloudRun(
      new Request("https://endpoint.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer test-user-token" },
        body: JSON.stringify(body),
      }),
    );
    assert(steps.length === 0, "Expected HTTP call missing");
    return { status: response.status, body: await response.json() };
  } finally {
    globalThis.fetch = oldFetch;
    names.forEach((name, i) =>
      oldEnv[i] === undefined
        ? Deno.env.delete(name)
        : Deno.env.set(name, oldEnv[i]!)
    );
  }
}
const auth = (): Step => ({
  method: "GET",
  path: "/auth/v1/user",
  data: { id: owner },
});
const boost = (): Step => ({
  method: "POST",
  path: "/rest/v1/rpc/user_has_boost",
  data: true,
  inspect: (_url, body) => assert(canonical(body) === canonical({ check_user_id: owner })),
});
const row = (status = "queued") => ({
  id,
  session_id: sessionId,
  user_id: owner,
  kind: "chat",
  mode: "auto",
  request: submit.request,
  status,
  checkpoint: { question: "Proceed?" },
  updated_at: "2026-09-12T00:00:00Z",
  result: null,
  error: null,
});
function owned(url: URL) {
  assert(url.searchParams.get("user_id") === `eq.${owner}`);
  assert(url.searchParams.get("id") === `eq.${id}`);
}
const read = (data: unknown): Step => ({
  method: "GET",
  path: "/rest/v1/cloud_runs",
  data,
  inspect: owned,
});
const submitRpc = (replayed = false): Step => ({
  method: "POST",
  path: "/rest/v1/rpc/submit_cloud_run",
  data: {
    id,
    status: replayed ? "completed" : "queued",
    session_revision: replayed ? 9 : 5,
    replayed,
  },
});

Deno.test("disabled gate does no auth or database work; invalid auth fails closed", async () => {
  assert((await exercise(submit, [], "false")).status === 503);
  assert(
    (await exercise(submit, [{
      ...auth(),
      status: 401,
      data: { message: "Invalid JWT" },
    }])).status === 401,
  );
});
Deno.test("submit queues only, derives owner, returns client shape", async () => {
  const response = await exercise(submit, [auth(), boost(), {
    ...submitRpc(),
    inspect: (_url, body) => {
      assert(
        canonical(body) ===
          canonical({
            p_run_id: id,
            p_user_id: owner,
            p_session_id: sessionId,
            p_mode: "auto",
            p_kind: "chat",
            p_request: submit.request,
            p_user_message: submit.userMessage,
            p_expected_revision: 4,
          }),
      );
      assert(!JSON.stringify(body).includes("test-user-token"));
    },
  }, read(row())]);
  assert(
    response.status === 202 && response.body.id === id &&
      response.body.status === "queued",
  );
  assert(!("request" in response.body) && !("user_id" in response.body));
  assert(
    response.body.sessionRevision === 5 && response.body.replayed === false,
  );
});
Deno.test("same UUID returns existing result; differing submission conflicts", async () => {
  const conflict = (): Step => ({
    method: "POST",
    path: "/rest/v1/rpc/submit_cloud_run",
    status: 409,
    data: { code: "23505" },
  });
  const same = await exercise(submit, [
    auth(),
    boost(),
    submitRpc(true),
    read(row("completed")),
  ]);
  assert(same.status === 200 && same.body.status === "completed");
  assert(same.body.sessionRevision === 9 && same.body.replayed === true);
  assert(
    (await exercise(submit, [
      auth(),
      boost(),
      conflict(),
    ])).status === 409,
  );
});
Deno.test("missing owned session/run is not accessible", async () => {
  assert(
    (await exercise(submit, [auth(), boost(), {
      ...submitRpc(),
      status: 409,
      data: { code: "23503" },
    }])).status ===
      404,
  );
  assert(
    (await exercise({ action: "status", id }, [auth(), read(null)])).status ===
      404,
  );
});

Deno.test("stable user message and expected revision are required and allowlisted", () => {
  for (
    const expectedRevision of [
      undefined,
      -1,
      1.5,
      "4",
      Number.MAX_SAFE_INTEGER + 1,
    ]
  ) rejects({ ...submit, expectedRevision });
  rejects({ ...submit, userMessage: undefined });
  for (
    const patch of [
      { id: "cloud-reserved" },
      { role: "assistant" },
      { timestamp: "yesterday" },
      { authorization: "secret" },
      { content: "test-token secret-test-bearer" },
    ]
  ) {
    rejects({ ...submit, userMessage: { ...submit.userMessage, ...patch } });
  }
});

Deno.test("RPC conflicts and failures never fall back to insert or another submission", async () => {
  for (
    const [code, status] of [["40001", 409], ["23505", 409], ["22023", 400], [
      "PGRST202",
      500,
    ], ["XX000", 500]] as const
  ) {
    const result = await exercise(submit, [auth(), boost(), {
      ...submitRpc(),
      status: 400,
      data: { code },
    }]);
    assert(result.status === status);
  }
});

Deno.test("accepted submit with failed status read reports uncertainty without writing again", async () => {
  const response = await exercise(submit, [auth(), boost(), submitRpc(), {
    ...read(null),
    status: 500,
    data: { code: "XX000" },
  }]);
  assert(response.status === 500);
});
Deno.test("cancel uses atomic nonterminal predicate; concurrent completion wins", async () => {
  const response = await exercise({ action: "cancel", id }, [
    auth(),
    read(row("running")),
    {
      method: "PATCH",
      path: "/rest/v1/cloud_runs",
      data: null,
      inspect: (url, body) => {
        owned(url);
        assert(
          url.searchParams.get("status") ===
            "in.(queued,running,awaiting_input)",
        );
        assert(
          body.status === "cancelled" && body.lease_token === null &&
            body.lease_expires_at === null,
        );
      },
    },
    read(row("completed")),
  ]);
  assert(response.body.status === "completed");
});
Deno.test("respond preserves checkpoint, queues only awaiting input with CAS", async () => {
  const response = await exercise({ action: "respond", id, response: "Yes" }, [
    auth(),
    read(row("awaiting_input")),
    {
      method: "POST",
      path: "/rest/v1/rpc/resume_cloud_run",
      data: true,
      inspect: (_url, body) => {
        assert(body.p_user_id === owner && body.p_run_id === id);
        assert(body.p_expected_updated_at === row().updated_at);
        assert(body.p_input_response === "Yes");
        const message = body.p_user_message as Record<string, unknown>;
        assert(message.role === "user" && message.content === "Yes");
        assert(message.id === `cloud-response-${id}-${row().updated_at}`);
      },
    },
    read(row()),
  ]);
  assert(response.status === 202);
  assert(
    (await exercise({ action: "respond", id, response: "Yes" }, [
      auth(),
      read(row("completed")),
    ])).status === 409,
  );
  assert(
    (await exercise({ action: "respond", id, response: "Yes" }, [
      auth(),
      read(row("awaiting_input")),
      { method: "POST", path: "/rest/v1/rpc/resume_cloud_run", data: false },
    ])).status === 409,
  );
});

const approval = {
  decision: "approve",
  callId: "call_123",
  argumentsHash: "a".repeat(64),
};
const pendingRow = () => ({
  ...row("awaiting_input"),
  checkpoint: {
    pendingApproval: {
      callId: approval.callId,
      argumentsHash: approval.argumentsHash,
    },
  },
});

Deno.test("approval envelope is closed and strictly validated", () => {
  validateAction({ action: "respond", id, response: approval });
  for (
    const response of [
      { ...approval, decision: "yes" },
      { ...approval, callId: "" },
      { ...approval, argumentsHash: "" },
      { ...approval, text: "yes" },
      { decision: "approve", callId: "call_123" },
    ]
  ) rejects({ action: "respond", id, response });
});

Deno.test("exact approve and deny decisions persist typed through owner-scoped resume RPC", async () => {
  for (const decision of ["approve", "deny"]) {
    const typed = { ...approval, decision };
    const result = await exercise({ action: "respond", id, response: typed }, [
      auth(),
      read(pendingRow()),
      {
        method: "POST",
        path: "/rest/v1/rpc/resume_cloud_run",
        data: true,
        inspect: (_url, body) => {
          assert(body.p_user_id === owner && body.p_run_id === id);
          assert(body.p_expected_updated_at === pendingRow().updated_at);
          assert(canonical(body.p_input_response) === canonical(typed));
        },
      },
      read(row()),
    ]);
    assert(result.status === 202 && result.body.status === "queued");
  }
});

Deno.test("foreign, stale, missing and free-text approvals never reach resume RPC", async () => {
  assert(
    (await exercise({ action: "respond", id, response: approval }, [
      auth(),
      read(null),
    ])).status === 404,
  );
  for (
    const response of [
      { ...approval, callId: "old-call" },
      { ...approval, argumentsHash: "b".repeat(64) },
      "yes",
      { text: "approve" },
      { answers: { decision: "approve" } },
    ]
  ) {
    assert(
      (await exercise({ action: "respond", id, response }, [
        auth(),
        read(pendingRow()),
      ])).status === 409,
    );
  }
  assert(
    (await exercise({ action: "respond", id, response: approval }, [
      auth(),
      read(row("awaiting_input")),
    ])).status === 409,
  );
});

Deno.test("approval pause changed after verification is rejected by RPC CAS", async () => {
  assert(
    (await exercise({ action: "respond", id, response: approval }, [
      auth(),
      read(pendingRow()),
      {
        method: "POST",
        path: "/rest/v1/rpc/resume_cloud_run",
        data: false,
        inspect: (_url, body) =>
          assert(body.p_expected_updated_at === pendingRow().updated_at),
      },
    ])).status === 409,
  );
});
