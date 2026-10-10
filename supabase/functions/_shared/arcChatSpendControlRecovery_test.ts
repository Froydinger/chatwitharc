// These fixtures implement Promise-returning production callbacks; most do not need async work.
// deno-lint-ignore-file require-await

import {
  CloudAgentsApiRequestError,
  cloudAgentsProvider,
} from "./cloudAgentsProvider.ts";
import {
  ARC_CHAT_SPEND_CONTROL_RECOVERY_ATTEMPT_ID,
  boundedCompletionTokenLimit,
  canRecoverSpendControlRejection,
  hasBoundedRecoveryActionIntent,
  isBoundedTextConversation,
  isConfirmedUnsupportedSpendControl,
  type RecoveryChatMessage,
  runBoundedChatRecovery,
  shouldUseBoundedRecoverySearch,
  type SpendControlRecoveryEligibility,
} from "./arcChatSpendControlRecovery.ts";
import { priceArcTokenUsage } from "./arcUsageAccounting.ts";
import type { ArcModelRoute } from "./arcModelRouting.ts";
import type { ArcModelUsageTicket } from "./arcModelUsage.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

const lunaRoute: ArcModelRoute = {
  model: "gpt-6-luna",
  effort: "none",
  selection: "auto",
  task: "chat",
};
const solRoute: ArcModelRoute = {
  model: "gpt-6.1-sol",
  effort: "low",
  selection: "gpt-6.1-sol",
  task: "chat",
};
const adminSolRoute = { ...solRoute, isAdmin: true };
const safeFlags: SpendControlRecoveryEligibility = {
  voiceCompatibility: false,
  legacyRoute: false,
  guestMode: false,
  collabChat: false,
  workSession: false,
  workSessionVerified: true,
  gitMode: false,
  codeMode: false,
  canvasMode: false,
  builderIntent: false,
  mediaInput: false,
  priorToolCall: false,
  actionIntent: false,
  toolChoiceRequired: false,
  routeTask: "chat",
  searchRequested: false,
};

function unsupportedError(overrides: Partial<{
  status: number;
  method: string;
  path: string;
  param: string;
  type: string;
  code: string;
  spendControlUnavailable: boolean;
  confirmedZero: boolean;
}> = {}) {
  const value = {
    status: 400,
    method: "POST",
    path: "/sessions",
    code: "feature_not_available",
    param: "spend_control",
    type: "invalid_request_error",
    spendControlUnavailable: true,
    confirmedZero: true,
    ...overrides,
  };
  return new CloudAgentsApiRequestError(
    "Agents API rejection",
    value.status,
    value.method,
    value.path,
    value.code,
    value.param,
    value.type,
    value.spendControlUnavailable,
    value.confirmedZero,
  );
}

function ticket(options: { replayed?: boolean; reservedNanos?: number } = {}) {
  let started = false;
  let zeroConfirmations = 0;
  let observations = 0;
  let unstartedReleases = 0;
  const value = {
    reservation: {
      allowed: true,
      replayed: options.replayed ?? false,
      reservedNanos: options.reservedNanos ?? 10_000_000,
      reservationId: "fresh-reservation",
    },
    assertNewProviderAttempt() {
      started = true;
    },
    async observe(_usage: unknown, final: boolean) {
      assert(final);
      observations++;
    },
    async observeSession() {},
    async confirmZero() {
      zeroConfirmations++;
    },
    async releaseIfNotStarted() {
      if (!started && !options.replayed) unstartedReleases++;
    },
    completionTokenLimit(_input: unknown, requested: number) {
      return requested;
    },
  } as unknown as ArcModelUsageTicket;
  return {
    value,
    started: () => started,
    zeroConfirmations: () => zeroConfirmations,
    observations: () => observations,
    unstartedReleases: () => unstartedReleases,
  };
}

Deno.test("recovery gate accepts only a confirmed unavailable spend_control rejection", () => {
  assert(String(ARC_CHAT_SPEND_CONTROL_RECOVERY_ATTEMPT_ID) !== "chat:primary");
  const error = unsupportedError();
  assert(isConfirmedUnsupportedSpendControl(error));
  assert(canRecoverSpendControlRejection(error, safeFlags, true, false));
  assert(
    !canRecoverSpendControlRejection(
      error,
      { ...safeFlags, routeTask: "write" },
      true,
      false,
    ),
  );
  assert(
    !canRecoverSpendControlRejection(
      error,
      { ...safeFlags, routeTask: "search" },
      true,
      false,
    ),
  );
  assert(
    canRecoverSpendControlRejection(
      error,
      { ...safeFlags, routeTask: "search", searchRequested: true },
      true,
      false,
    ),
  );
  assert(!canRecoverSpendControlRejection(error, safeFlags, false, false));
  assert(!canRecoverSpendControlRejection(error, safeFlags, true, true));

  for (
    const [key, value] of Object.entries({
      voiceCompatibility: true,
      legacyRoute: true,
      guestMode: true,
      collabChat: true,
      workSession: true,
      workSessionVerified: false,
      gitMode: true,
      codeMode: true,
      canvasMode: true,
      builderIntent: true,
      mediaInput: true,
      priorToolCall: true,
      actionIntent: true,
      toolChoiceRequired: true,
    })
  ) {
    const flags = {
      ...safeFlags,
      [key]: value,
    } as SpendControlRecoveryEligibility;
    assert(
      !canRecoverSpendControlRejection(error, flags, true, false),
      `${key} must fail closed`,
    );
  }
  assert(
    !canRecoverSpendControlRejection(
      error,
      { ...safeFlags, forcedToolName: "get_weather" },
      true,
      false,
    ),
  );
  assert(
    canRecoverSpendControlRejection(
      error,
      { ...safeFlags, forcedToolName: "web_search" },
      true,
      false,
    ),
  );
  assert(
    !isConfirmedUnsupportedSpendControl(unsupportedError({ status: 500 })),
  );
  assert(
    !isConfirmedUnsupportedSpendControl(
      unsupportedError({ param: "spend_control.limit" }),
    ),
  );
  assert(
    !isConfirmedUnsupportedSpendControl(
      unsupportedError({ spendControlUnavailable: false }),
    ),
  );
  assert(
    !isConfirmedUnsupportedSpendControl(
      unsupportedError({ confirmedZero: false }),
    ),
  );
});

Deno.test("bounded recovery screens action intents and permits only genuine bounded web-search intent", () => {
  assert(!hasBoundedRecoveryActionIntent("Hi Arc"));
  assert(!hasBoundedRecoveryActionIntent("What is photosynthesis?"));
  for (
    const text of [
      "Remember this for next time",
      "Remind me tomorrow",
      "What is the weather?",
      "Create an image of a mountain",
      "Open this site",
      "Search my past chats",
      "Build a website",
      "Use GitHub to change this file",
      "Create a reminder",
    ]
  ) {
    assert(
      hasBoundedRecoveryActionIntent(text),
      `${text} must not enter text-only recovery`,
    );
  }
  assert(shouldUseBoundedRecoverySearch("What is the latest release?", false));
  assert(
    shouldUseBoundedRecoverySearch(
      "Search the web for the current price",
      false,
    ),
  );
  assert(
    !shouldUseBoundedRecoverySearch(
      "What is the weather today?",
      true,
      "get_weather",
    ),
  );
  assert(!shouldUseBoundedRecoverySearch("What is the weather today?", false));
  assert(
    !shouldUseBoundedRecoverySearch(
      "Remind me to check the latest news tomorrow",
      true,
      "schedule_task",
    ),
  );
});

Deno.test("only plain-text user/assistant/system transcripts pass the recovery shape guard", () => {
  assert(isBoundedTextConversation([
    { role: "system", content: "Arc instructions" },
    {
      role: "user",
      content: "Hi",
      id: "message-1",
      timestamp: "2026-10-10T00:00:00.000Z",
      type: "text",
    },
    { role: "assistant", content: "Hello", type: "text" },
  ]));
  assert(
    !isBoundedTextConversation([{
      role: "user",
      content: [{ type: "input_image" }],
    }]),
  );
  assert(!isBoundedTextConversation([{ role: "tool", content: "result" }]));
  assert(
    !isBoundedTextConversation([{
      role: "assistant",
      content: "Generated code",
      type: "code",
      codeContent: "alert(1)",
    }]),
  );
  assert(
    !isBoundedTextConversation([{
      role: "assistant",
      content: "Hello",
      privateAction: { type: "send_email" },
    }]),
  );
  assert(!isBoundedTextConversation([{ role: "assistant", content: "Hello" }]));
  assert(
    !isBoundedTextConversation([{
      role: "user",
      content: "Hi",
      images: ["https://image.test/a.png"],
    }]),
  );
  assert(
    !isBoundedTextConversation([{
      role: "user",
      content: "Hi",
      type: "image",
    }]),
  );
  assert(
    !isBoundedTextConversation([{
      role: "assistant",
      content: null,
      tool_calls: [],
    }]),
  );
});

Deno.test("output ceiling covers conservative UTF-8 input price and the Standard output price", () => {
  const messages: RecoveryChatMessage[] = [
    { role: "system", content: "System instructions" },
    { role: "user", content: "Hello 🪄" },
  ];
  const inputTokens =
    new TextEncoder().encode(JSON.stringify(messages)).byteLength + 1_024;
  const reserve = priceArcTokenUsage("gpt-6-luna", {
    inputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: inputTokens,
    outputTokens: 512,
  }).costNanos;
  const maxOutput = boundedCompletionTokenLimit(
    "gpt-6-luna",
    reserve,
    messages,
  );
  assert(maxOutput >= 128 && maxOutput <= 512);
  let rejected = false;
  try {
    boundedCompletionTokenLimit("gpt-6-luna", 1, messages);
  } catch {
    rejected = true;
  }
  assert(
    rejected,
    "must reject a reservation below the minimum response budget",
  );
  const hugeUnicode: RecoveryChatMessage[] = [{
    role: "user",
    content: "🪄".repeat(20_000),
  }];
  rejected = false;
  try {
    boundedCompletionTokenLimit("gpt-6-luna", reserve, hugeUnicode);
  } catch {
    rejected = true;
  }
  assert(rejected, "UTF-8 byte counting must reject oversized Unicode context");
});

Deno.test("one fresh metered Chat Completions request preserves model, effort, default tier, and real search citations", async () => {
  const messages: RecoveryChatMessage[] = [
    { role: "system", content: "System instructions" },
    { role: "user", content: "Hi" },
    {
      role: "assistant",
      content: "Hello",
      type: "text",
      id: "assistant-1",
      timestamp: "2026-10-10T00:00:00.000Z",
      modelUsed: "gpt-6-luna",
      toolsUsed: ["web_search"],
    },
    { role: "user", content: "What is the latest release?" },
  ];
  const usageTicket = ticket({ reservedNanos: 100_000_000 });
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let prepared = 0;
  let searched = "";
  const result = await runBoundedChatRecovery({
    apiKey: "test-key",
    requestId: "submission-1",
    route: adminSolRoute,
    messages,
    searchRequested: true,
    searchQuery: "What is the latest release?",
    search: async (query) => {
      searched = query;
      return {
        searchProvider: "tavily",
        sources: Array.from({ length: 10 }, (_, index) => ({
          title: `Source ${index}`,
          url: `https://example.test/${index}`,
          content: "Verified excerpt.",
        })),
      };
    },
    prepare: async (providerMessages) => {
      prepared++;
      assert(
        providerMessages.at(-1)?.content?.toString().includes(
          "https://example.test/0",
        ),
      );
      assert(adminSolRoute.isAdmin);
      return { route: adminSolRoute, ticket: usageTicket.value };
    },
    fetcher: (async (input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(input), body });
      return Response.json({
        id: "cmpl_recovery",
        model: adminSolRoute.model,
        usage: { total_tokens: 41 },
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: "The release is documented here.",
          },
          finish_reason: "stop",
        }],
      });
    }) as typeof fetch,
  });
  assert(
    prepared === 1 && calls.length === 1 &&
      searched === "What is the latest release?",
  );
  assert(calls[0].url === "https://api.openai.com/v1/chat/completions");
  const body = calls[0].body;
  assert(
    body.model === adminSolRoute.model &&
      body.reasoning_effort === adminSolRoute.effort,
  );
  assert(
    body.service_tier === "default" &&
      Number(body.max_completion_tokens) < 65_536,
  );
  assert(!Object.hasOwn(body, "tools") && !Object.hasOwn(body, "tool_choice"));
  const sentMessages = body.messages as Array<Record<string, unknown>>;
  assert(
    sentMessages.every((message) =>
      Object.keys(message).every((key) => key === "role" || key === "content")
    ),
    "bounded provider requests contain only validated role/content text",
  );
  assert(
    sentMessages.some((message) =>
      String(message.content).includes("untrusted data")
    ),
  );
  assert(
    sentMessages.filter((message) =>
      String(message.content).includes("URL: https://example.test/")
    ).length <= 6,
  );
  assert(
    result.searchUsed && result.searchProvider === "tavily" &&
      result.searchSources.length === 6,
  );
  assert(result.data.choices[0].message.content.includes("release"));
  assert(
    usageTicket.started() && usageTicket.observations() === 1 &&
      usageTicket.zeroConfirmations() === 0,
  );
});

Deno.test("route changes, usage exhaustion, replay, and cancellation never reach OpenAI", async () => {
  let requests = 0;
  let releases = 0;
  const messages: RecoveryChatMessage[] = [{
    role: "system",
    content: "System",
  }, { role: "user", content: "Hi" }];
  const base = {
    apiKey: "test",
    requestId: "submission",
    route: lunaRoute,
    messages,
    searchRequested: false,
    searchQuery: "Hi",
    search: async () => ({ sources: [], searchProvider: "tavily" }),
    fetcher: (async () => {
      requests++;
      return Response.json({});
    }) as typeof fetch,
  };
  const changed = ticket();
  let rejected = false;
  try {
    await runBoundedChatRecovery({
      ...base,
      prepare: async () => ({
        route: solRoute,
        ticket: changed.value,
        notice: "Quota fallback",
      }),
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 0 && !changed.started());
  const replay = ticket({ replayed: true });
  rejected = false;
  try {
    await runBoundedChatRecovery({
      ...base,
      prepare: async () => ({ route: lunaRoute, ticket: replay.value }),
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 0 && !replay.started());
  rejected = false;
  try {
    await runBoundedChatRecovery({
      ...base,
      prepare: async () => {
        throw new Error("allowance exhausted");
      },
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 0);
  const abort = new AbortController();
  abort.abort();
  rejected = false;
  try {
    await runBoundedChatRecovery({
      ...base,
      signal: abort.signal,
      prepare: async () => {
        throw new Error("must not prepare");
      },
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 0);
  const fresh = ticket();
  const cancelledAfterReserve = new AbortController();
  rejected = false;
  try {
    await runBoundedChatRecovery({
      ...base,
      signal: cancelledAfterReserve.signal,
      prepare: async () => {
        cancelledAfterReserve.abort();
        return {
          route: lunaRoute,
          ticket: {
            ...fresh.value,
            async releaseIfNotStarted() {
              releases++;
            },
          } as ArcModelUsageTicket,
        };
      },
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 0 && releases === 1);
});

Deno.test("ambiguous transport failure keeps the fresh model reservation and is never retried", async () => {
  const usageTicket = ticket();
  let requests = 0;
  let rejected = false;
  try {
    await runBoundedChatRecovery({
      apiKey: "test",
      requestId: "submission",
      route: lunaRoute,
      messages: [{ role: "system", content: "System" }, {
        role: "user",
        content: "Hi",
      }],
      searchRequested: false,
      searchQuery: "Hi",
      search: async () => ({ sources: [], searchProvider: "tavily" }),
      prepare: async () => ({ route: lunaRoute, ticket: usageTicket.value }),
      fetcher: (async () => {
        requests++;
        throw new Error("network disconnected after write");
      }) as typeof fetch,
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 1 && usageTicket.started());
  assert(
    usageTicket.zeroConfirmations() === 0 &&
      usageTicket.unstartedReleases() === 0,
  );
});

Deno.test("ambiguous provider 5xx retains its fresh hold and is never retried", async () => {
  const usageTicket = ticket();
  let requests = 0;
  let rejected = false;
  try {
    await runBoundedChatRecovery({
      apiKey: "test",
      requestId: "submission",
      route: lunaRoute,
      messages: [{ role: "system", content: "System" }, {
        role: "user",
        content: "Hi",
      }],
      searchRequested: false,
      searchQuery: "Hi",
      search: async () => ({ sources: [], searchProvider: "tavily" }),
      prepare: async () => ({ route: lunaRoute, ticket: usageTicket.value }),
      fetcher: (async () => {
        requests++;
        return Response.json({ error: "upstream failure" }, { status: 503 });
      }) as typeof fetch,
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 1 && usageTicket.started());
  assert(
    usageTicket.zeroConfirmations() === 0 &&
      usageTicket.unstartedReleases() === 0,
  );
});

Deno.test("client cancellation after model dispatch aborts without a retry or zero settlement", async () => {
  const usageTicket = ticket();
  const abort = new AbortController();
  let requests = 0;
  let rejected = false;
  try {
    await runBoundedChatRecovery({
      apiKey: "test",
      requestId: "submission",
      route: lunaRoute,
      messages: [{ role: "system", content: "System" }, {
        role: "user",
        content: "Hi",
      }],
      searchRequested: false,
      searchQuery: "Hi",
      search: async () => ({ sources: [], searchProvider: "tavily" }),
      prepare: async () => ({ route: lunaRoute, ticket: usageTicket.value }),
      signal: abort.signal,
      fetcher: (async (_input, init) => {
        requests++;
        const signal = init?.signal as AbortSignal;
        abort.abort();
        if (signal.aborted) throw new DOMException("aborted", "AbortError");
        return Response.json({});
      }) as typeof fetch,
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 1 && usageTicket.started());
  assert(
    usageTicket.zeroConfirmations() === 0 &&
      usageTicket.unstartedReleases() === 0,
  );
});

Deno.test("incomplete and tool-call completion shapes are rejected after usage settlement", async () => {
  const invalidReplies = [
    {
      finish_reason: "length",
      message: { role: "assistant", content: "truncated" },
    },
    {
      finish_reason: "tool_calls",
      message: { role: "assistant", content: "tool text", tool_calls: [] },
    },
    {
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "function text",
        function_call: { name: "schedule_task" },
      },
    },
  ];
  for (const choice of invalidReplies) {
    const usageTicket = ticket();
    let requests = 0;
    let rejected = false;
    try {
      await runBoundedChatRecovery({
        apiKey: "test",
        requestId: "submission",
        route: lunaRoute,
        messages: [{ role: "system", content: "System" }, {
          role: "user",
          content: "Hi",
        }],
        searchRequested: false,
        searchQuery: "Hi",
        search: async () => ({ sources: [], searchProvider: "tavily" }),
        prepare: async () => ({ route: lunaRoute, ticket: usageTicket.value }),
        fetcher: (async () => {
          requests++;
          return Response.json({
            usage: { total_tokens: 5 },
            choices: [choice],
          });
        }) as typeof fetch,
      });
    } catch {
      rejected = true;
    }
    assert(rejected && requests === 1 && usageTicket.observations() === 1);
    assert(usageTicket.zeroConfirmations() === 0);
  }
});

Deno.test("confirmed bounded completion rejection releases once and is not retried", async () => {
  const usageTicket = ticket();
  let requests = 0;
  let rejected = false;
  try {
    await runBoundedChatRecovery({
      apiKey: "test",
      requestId: "submission",
      route: lunaRoute,
      messages: [{ role: "system", content: "System" }, {
        role: "user",
        content: "Hi",
      }],
      searchRequested: false,
      searchQuery: "Hi",
      search: async () => ({ sources: [], searchProvider: "tavily" }),
      prepare: async () => ({ route: lunaRoute, ticket: usageTicket.value }),
      fetcher: (async () => {
        requests++;
        return Response.json({ error: "rejected" }, { status: 400 });
      }) as typeof fetch,
    });
  } catch {
    rejected = true;
  }
  assert(rejected && requests === 1 && usageTicket.zeroConfirmations() === 1);
});

Deno.test("no search evidence yields a transparent answer without a model call", async () => {
  let calls = 0, prepared = 0;
  const result = await runBoundedChatRecovery({
    apiKey: "test",
    requestId: "submission",
    route: lunaRoute,
    messages: [{ role: "system", content: "System" }, {
      role: "user",
      content: "latest item",
    }],
    searchRequested: true,
    searchQuery: "latest item",
    search: async () => ({ sources: [], searchProvider: "tavily" }),
    prepare: async () => {
      prepared++;
      throw new Error("no completion should be reserved");
    },
    fetcher: (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch,
  });
  assert(result.searchUsed && result.searchSources.length === 0);
  assert(
    result.data.choices[0].message.content.includes("do not want to guess"),
  );
  assert(calls === 0 && prepared === 0);
});

Deno.test("Agents rejection classifier matches the confirmed unsupported/not-enabled spend-control category and confirmed zero settlement", async () => {
  for (
    const providerError of [
      {
        type: "",
        code: "invalid_request_error",
        param: "spend_control",
        message:
          "The provider does not support or has not enabled spend control for this request.",
      },
      {
        type: "invalid_request_error",
        code: "",
        param: "spend_control",
        message: "spend_control is unsupported for this project",
      },
      {
        type: "invalid_request_error",
        code: "feature_not_available",
        param: "spend_control",
        message: "Feature is unavailable",
      },
      {
        type: "invalid_request_error",
        code: "unsupported_parameter",
        param: "spend_control",
        message: "unsupported parameter",
      },
    ]
  ) {
    let confirmations = 0;
    const provider = cloudAgentsProvider({
      apiKey: "test",
      instructions: "",
      reasoningEffort: "none",
      model: "gpt-6-luna",
      tools: [],
      spendLimitCents: 4,
      onRejected: async (reason) => {
        assert(reason === "provider-rejected-400");
        confirmations++;
      },
      fetcher: (async () =>
        Response.json({ error: providerError }, {
          status: 400,
        })) as typeof fetch,
    });
    let caught: unknown;
    try {
      await provider.startAgentSession!(
        [{ role: "user", content: "Hi" }],
        "test",
        65_536,
      );
    } catch (error) {
      caught = error;
    }
    assert(
      caught instanceof CloudAgentsApiRequestError &&
        caught.spendControlUnavailable && caught.confirmedZero,
    );
    assert(confirmations === 1);
  }

  let malformed: unknown;
  const invalidAmount = cloudAgentsProvider({
    apiKey: "test",
    instructions: "",
    reasoningEffort: "none",
    model: "gpt-6-luna",
    tools: [],
    spendLimitCents: 4,
    onRejected: async () => {},
    fetcher: (async () =>
      Response.json({
        error: {
          type: "invalid_request_error",
          code: "invalid_type",
          param: "spend_control",
          message: "limit must be an integer greater than or equal to 1",
        },
      }, { status: 400 })) as typeof fetch,
  });
  try {
    await invalidAmount.startAgentSession!(
      [{ role: "user", content: "Hi" }],
      "test",
      65_536,
    );
  } catch (error) {
    malformed = error;
  }
  assert(
    malformed instanceof CloudAgentsApiRequestError &&
      !malformed.spendControlUnavailable,
  );
});

Deno.test("zero-settlement failure blocks recovery classification", async () => {
  let caught: unknown;
  const provider = cloudAgentsProvider({
    apiKey: "test",
    instructions: "",
    reasoningEffort: "none",
    model: "gpt-6-luna",
    tools: [],
    spendLimitCents: 4,
    onRejected: async () => {
      throw new Error("zero settlement unconfirmed");
    },
    fetcher: (async () =>
      Response.json({
        error: {
          type: "invalid_request_error",
          code: "feature_not_available",
          param: "spend_control",
          message: "spend_control is not enabled",
        },
      }, { status: 400 })) as typeof fetch,
  });
  try {
    await provider.startAgentSession!(
      [{ role: "user", content: "Hi" }],
      "test",
      65_536,
    );
  } catch (error) {
    caught = error;
  }
  assert(
    caught instanceof Error && caught.message === "zero settlement unconfirmed",
  );
  assert(!(caught instanceof CloudAgentsApiRequestError));
});
