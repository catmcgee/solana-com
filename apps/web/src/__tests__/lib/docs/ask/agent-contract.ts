/**
 * The docs agent's real wire bodies (solana-com-agent, develop 90b9c379),
 * copied from its code so the client, proxy and parser tests run against
 * what the agent sends rather than invented shapes:
 * - app/Http/Controllers/AskController.php (session, chat, done, errors)
 * - app/Http/Middleware/{AskProxySecret,AskThrottle,AskBudgetGuard}.php
 * - app/Services/AgentService.php, Ask/AskChatOrchestrator.php (stream)
 * - app/Services/Ask/FollowupSuggestionService.php (suggested_followups)
 * Laravel's own 422 shape is `{message, errors}`; with an Accept that
 * doesn't lead with JSON, a failed validation is a 302 to the agent's home.
 */

/** POST /api/ask/session */
export const AGENT_SESSION = {
  session_token: "v1.01JBQ9ZK3X7Y8V6T5R4P3N2M1K.1893456000.3f9c2a",
  expires_at: 1893456000,
};

type AgentReply = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

/** Error replies, by cause. */
export const AGENT_ERRORS = {
  /** AskProxySecret: missing or wrong X-Ask-Proxy-Secret. */
  forbidden: { status: 403, body: { error: "Forbidden." } },
  /** requireSession: no, expired or forged session_token. */
  invalidSession: {
    status: 401,
    body: {
      error:
        "A valid session_token is required. Request one from POST /api/ask/session.",
    },
  },
  /** AskThrottle: 20/min per IP, 10/min per session. */
  throttled: {
    status: 429,
    body: { error: "Too many requests.", retry_after_seconds: 42 },
    headers: { "retry-after": "42" },
  },
  /** AskController: two answers still running for this session. */
  pendingRun: {
    status: 429,
    body: { error: "Please wait for your previous question to finish." },
    headers: { "retry-after": "10" },
  },
  /** AskThrottle: message over 4,000 characters. */
  messageTooLong: {
    status: 422,
    body: { error: "Message too long.", max_chars: 4000 },
  },
  /** Laravel validation (Accept leads with JSON): a non-numeric conversation_id. */
  invalidConversationId: {
    status: 422,
    body: {
      message: "The conversation id field must be an integer.",
      errors: {
        conversation_id: ["The conversation id field must be an integer."],
      },
    },
  },
  /** Laravel validation: an over-long message that passed the throttle. */
  invalidMessage: {
    status: 422,
    body: {
      message: "The message field must not be greater than 4000 characters.",
      errors: {
        message: [
          "The message field must not be greater than 4000 characters.",
        ],
      },
    },
  },
  /** resolveConversation: the conversation belongs to another session. */
  conversationNotFound: {
    status: 404,
    body: { error: "Conversation not found for this session." },
  },
  /** 40 messages in the conversation. */
  conversationFull: {
    status: 409,
    body: {
      error: "This conversation is full. Start a new one to continue.",
      code: "conversation_full",
    },
  },
  /** AskBudgetGuard: kill switch or hourly/daily budget. */
  budget: {
    status: 503,
    body: {
      error:
        "The assistant is temporarily unavailable. Please try again later.",
      reason: "hourly_budget",
    },
    headers: { "retry-after": "300" },
  },
  notProvisioned: {
    status: 503,
    body: { error: "The assistant is not provisioned." },
  },
} satisfies Record<string, AgentReply>;

/** A reply as fetch would return it. */
export function agentResponse({ status, body, headers }: AgentReply): Response {
  return Response.json(body, { status, headers });
}

/** Cloud Run / Google Front End at capacity: a 429 that isn't the agent's JSON. */
export function capacityResponse(): Response {
  return new Response(
    "<html><head><title>429 Too Many Requests</title></head><body><h1>Rate exceeded.</h1></body></html>",
    { status: 429, headers: { "content-type": "text/html" } },
  );
}

/** A failed validation when Accept puts text/event-stream first. */
export function validationRedirectResponse(): Response {
  return new Response(
    '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=\'https://agent.example\'" /><title>Redirecting to https://agent.example</title></head><body>Redirecting to <a href="https://agent.example">https://agent.example</a>.</body></html>',
    {
      status: 302,
      headers: {
        "content-type": "text/html; charset=utf-8",
        location: "https://agent.example",
      },
    },
  );
}

/** The `event: error` the agent sends when a run throws mid-stream. */
export const AGENT_STREAM_ERROR = {
  message: "The assistant could not answer. Please try again.",
};

/** A visual as the agent's validator lets it through. */
export const AGENT_VISUAL = {
  version: "solana-docs-ui/v1",
  kind: "answer",
  components: [
    {
      type: "answer_intro",
      title: "Program derived addresses",
      summary: "An address a program controls, derived from seeds.",
    },
  ],
};

export const AGENT_RESPONSE =
  "### Summary response\nA program derived address (PDA) is an address derived from seeds and a program ID. It has no private key, so only the program can sign for it.\n\n### Indepth response\nPDAs are found with `findProgramAddress`, which tries bumps from 255 down until the result is off the ed25519 curve.\n\nDo you want to see a code example for that? If so, what language do you want it in?";

/** `done` exactly as AskController::streamChat builds it. */
export const AGENT_DONE = {
  run_id: 4821,
  conversation_id: 1307,
  response: AGENT_RESPONSE,
  citations: [
    {
      title: "Program Derived Address",
      url: "https://solana.com/docs/core/pda",
    },
    { title: null, url: "/docs/core/cpi" },
  ],
  // Always null with `deferred-generative-ui`: the visual comes in ui_done.
  generative_ui: null,
  code_followups: {
    prompt:
      "Do you want to see a code example for that? If so, what language do you want it in?",
    buttons: [
      {
        type: "show_code",
        label: "Rust",
        language: "rust",
        message: "Show me the code for that in Rust.",
      },
      {
        type: "show_code",
        label: "TypeScript",
        language: "typescript",
        message: "Show me the code for that in TypeScript.",
      },
    ],
  },
  suggested_followups: {
    prompt: "Want to keep going? Try one of these:",
    buttons: [
      {
        type: "ask",
        label: "Next lesson: Cross Program Invocation",
        message: "Teach me the next lesson: Cross Program Invocation.",
      },
      {
        type: "ask",
        label: "PDA signing",
        message: "How does a program sign for a PDA with invoke_signed?",
      },
      {
        type: "ask",
        label: "Canonical bumps",
        message: "What is a canonical bump and why does it matter?",
      },
    ],
  },
  latency_trace: {
    checkpoints: { run_started: { elapsed_ms: 0 }, done: { elapsed_ms: 6120 } },
    durations: { model_ms: 4980 },
  },
  latency_summary: { p50_ms: 5200, p95_ms: 11800 },
  usage: { input_tokens: 9120, output_tokens: 412 },
};

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * A whole agent stream with capabilities early-status, ui-done and
 * deferred-generative-ui: statuses, traces, answer statuses, a delta chunk
 * lost to the agent's UTF-8 split (an empty `data:` line), a visual that is
 * then withdrawn, and `done`.
 */
export function agentStream({
  withdrawVisual = false,
}: { withdrawVisual?: boolean } = {}): string {
  return [
    sse("status", { stage: "accepted" }),
    sse("status", { stage: "searching_docs" }),
    sse("trace", {
      checkpoint: "run_started",
      elapsed_ms: 0,
      durations: {},
    }),
    sse("answer_status", {
      stage: "retrieving_docs",
      mode: "canonical",
      workflow: "pda_derivation",
    }),
    sse("status", { stage: "reading_doc", tool: "read_doc" }),
    sse("answer_status", {
      stage: "building_plan",
      mode: "canonical",
      workflow: "pda_derivation",
    }),
    sse("delta", { text: AGENT_RESPONSE.slice(0, 120) }),
    // json_encode failed on a chunk cut inside a UTF-8 character.
    "event: delta\ndata: \n\n",
    sse("ui_status", { stage: "building_visual_answer" }),
    sse("ui_done", { generative_ui: AGENT_VISUAL, cached: false }),
    ...(withdrawVisual
      ? [sse("ui_done", { generative_ui: null, discarded: true })]
      : []),
    sse("done", AGENT_DONE),
  ].join("");
}
