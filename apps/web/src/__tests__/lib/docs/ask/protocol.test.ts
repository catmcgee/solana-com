import { describe, expect, it } from "vitest";
import {
  advanceAskStatus,
  askErrorKindFor,
  askErrorKindForEvent,
  askStatusForStage,
  isAskGenerativeUi,
  isStaleConversation,
  normalizeCitations,
  normalizeDocsHref,
  normalizeSuggestedFollowups,
  splitAnswerSections,
  splitCodeFollowupPrompt,
  toAskGenerativeUi,
  toDonePayload,
  toId,
} from "@/lib/docs/ask/protocol";
import { createTokenGenerativeUiFixture } from "@/lib/docs/ask/fixtures/create-token";
import { AGENT_DONE, AGENT_ERRORS, AGENT_STREAM_ERROR } from "./agent-contract";

const followups = {
  prompt: "Do you want code?",
  buttons: [
    {
      type: "show_code",
      label: "Rust",
      language: "rust",
      message: "Show me the code for that in Rust.",
    },
  ],
};

describe("toDonePayload", () => {
  it("keeps numeric run and conversation ids as strings", () => {
    expect(toDonePayload({ run_id: 101, conversation_id: 7 })).toMatchObject({
      runId: "101",
      conversationId: "7",
    });
    expect(toDonePayload({ runId: "r1", conversationId: "c1" })).toMatchObject({
      runId: "r1",
      conversationId: "c1",
    });
    expect(
      toDonePayload({ run_id: Number.NaN, conversation_id: "  " }),
    ).toMatchObject({
      runId: null,
      conversationId: null,
    });
  });

  it("reads the response aliases, the visual and code follow-ups", () => {
    const done = toDonePayload({
      answer: "Final.",
      generative_ui: createTokenGenerativeUiFixture,
      code_followups: followups,
      citations: [{ title: "Quickstart", url: "/docs/tokens/quickstart" }],
    });
    expect(done.response).toBe("Final.");
    expect(done.generativeUi).toBe(createTokenGenerativeUiFixture);
    expect(done.codeFollowups).toEqual(followups);
    expect(done.citations).toEqual([
      { title: "Quickstart", url: "/developers/docs/tokens/quickstart" },
    ]);
  });

  it("maps an invalid visual to null", () => {
    expect(
      toDonePayload({
        generative_ui: { version: "unknown", kind: "answer", components: [] },
      }).generativeUi,
    ).toBeNull();
  });

  it("reads the agent's real done payload", () => {
    expect(toDonePayload(AGENT_DONE, "en")).toEqual({
      response: AGENT_DONE.response,
      runId: "4821",
      conversationId: "1307",
      citations: [
        {
          title: "Program Derived Address",
          url: "/developers/docs/core/pda",
        },
        { title: "", url: "/developers/docs/core/cpi" },
      ],
      generativeUi: null,
      codeFollowups: AGENT_DONE.code_followups,
      suggestedFollowups: {
        prompt: "Want to keep going? Try one of these:",
        items: [
          {
            label: "Next lesson: Cross Program Invocation",
            message: "Teach me the next lesson: Cross Program Invocation.",
            kind: "ask",
          },
          {
            label: "PDA signing",
            message: "How does a program sign for a PDA with invoke_signed?",
            kind: "ask",
          },
          {
            label: "Canonical bumps",
            message: "What is a canonical bump and why does it matter?",
            kind: "ask",
          },
        ],
      },
    });
  });

  it("drops code follow-ups without a prompt or valid buttons", () => {
    expect(
      toDonePayload({
        code_followups: { prompt: "Code?", buttons: [{ label: "x" }] },
      }).codeFollowups,
    ).toBeNull();
  });
});

describe("normalizeSuggestedFollowups", () => {
  it("keeps items with a label and a message, without repeats, at most three", () => {
    expect(
      normalizeSuggestedFollowups({
        prompt: "  ",
        buttons: [
          { type: "ask", label: "Rent", message: "What is rent?" },
          { label: "Rent again", message: "what is rent?" },
          { label: "No message" },
          "nope",
          { label: "Fees", message: "How are fees set?" },
          { label: "Votes", message: "How do votes land?" },
          { label: "Fourth", message: "One too many?" },
        ],
      }),
    ).toEqual({
      prompt: null,
      items: [
        { label: "Rent", message: "What is rent?", kind: "ask" },
        { label: "Fees", message: "How are fees set?", kind: "ask" },
        { label: "Votes", message: "How do votes land?", kind: "ask" },
      ],
    });
  });

  it("reads a stored copy and a bare list, and returns null when empty", () => {
    const stored = {
      prompt: "Next?",
      items: [{ label: "A", message: "Ask A", kind: "lesson" }],
    };
    expect(normalizeSuggestedFollowups(stored)).toEqual(stored);
    expect(
      normalizeSuggestedFollowups([{ label: "B", message: "Ask B" }]),
    ).toEqual({
      prompt: null,
      items: [{ label: "B", message: "Ask B", kind: "ask" }],
    });
    expect(
      normalizeSuggestedFollowups({ prompt: "Next?", buttons: [] }),
    ).toBeNull();
    expect(normalizeSuggestedFollowups(null)).toBeNull();
  });
});

describe("toAskGenerativeUi", () => {
  it("skips malformed components instead of the whole visual", () => {
    const ui = {
      version: "solana-docs-ui/v1",
      kind: "answer",
      components: [{ type: "callout", body: "Kept" }, { body: "no type" }, 7],
    };
    expect(toAskGenerativeUi(ui)).toEqual({
      ...ui,
      components: [{ type: "callout", body: "Kept" }],
    });
    expect(isAskGenerativeUi(ui)).toBe(false);
    expect(
      toDonePayload({ generative_ui: ui }).generativeUi?.components,
    ).toEqual([{ type: "callout", body: "Kept" }]);
  });

  it("returns a valid visual as is, and null with no component left", () => {
    expect(toAskGenerativeUi(createTokenGenerativeUiFixture)).toBe(
      createTokenGenerativeUiFixture,
    );
    expect(
      toAskGenerativeUi({
        version: "solana-docs-ui/v1",
        kind: "answer",
        components: [{ title: "no type" }],
      }),
    ).toBeNull();
    expect(
      toAskGenerativeUi({ version: "solana-docs-ui/v1", kind: "answer" }),
    ).toBeNull();
  });
});

describe("toId", () => {
  it("accepts strings, finite numbers and bigints", () => {
    expect(toId(" abc ")).toBe("abc");
    expect(toId(42)).toBe("42");
    expect(toId(BigInt(9))).toBe("9");
    expect(toId(Infinity)).toBeNull();
    expect(toId({})).toBeNull();
  });
});

describe("normalizeDocsHref", () => {
  it("moves /docs links to /developers/docs", () => {
    expect(normalizeDocsHref("/docs/core/pda")).toBe(
      "/developers/docs/core/pda",
    );
    expect(normalizeDocsHref("/docs")).toBe("/developers/docs");
    expect(normalizeDocsHref("/docs/core/pda#bump?x=1")).toBe(
      "/developers/docs/core/pda#bump?x=1",
    );
  });

  it("makes solana.com docs links site-relative", () => {
    expect(normalizeDocsHref("https://solana.com/docs/core/pda")).toBe(
      "/developers/docs/core/pda",
    );
    expect(
      normalizeDocsHref("https://www.solana.com/developers/cookbook/x"),
    ).toBe("/developers/cookbook/x");
  });

  it("adds the reader's locale when the docs are translated into it", () => {
    expect(normalizeDocsHref("/docs/core/pda", "ja")).toBe(
      "/ja/developers/docs/core/pda",
    );
    expect(normalizeDocsHref("/developers/docs/core", "en")).toBe(
      "/developers/docs/core",
    );
    // Greek docs were dropped; links stay English.
    expect(normalizeDocsHref("/developers/docs/core", "el")).toBe(
      "/developers/docs/core",
    );
  });

  it("keeps a link's own locale, dropping en and el", () => {
    expect(normalizeDocsHref("/ko/docs/core", "ja")).toBe(
      "/ko/developers/docs/core",
    );
    expect(normalizeDocsHref("/en/docs/core", "ja")).toBe(
      "/developers/docs/core",
    );
    expect(normalizeDocsHref("/el/developers/docs/core")).toBe(
      "/developers/docs/core",
    );
  });

  it("leaves other links alone", () => {
    expect(normalizeDocsHref("https://github.com/anza-xyz/agave")).toBe(
      "https://github.com/anza-xyz/agave",
    );
    expect(normalizeDocsHref("https://solana.com/news")).toBe(
      "https://solana.com/news",
    );
    expect(normalizeDocsHref("/developers/templates", "ja")).toBe(
      "/developers/templates",
    );
    expect(normalizeDocsHref("/docsify")).toBe("/docsify");
  });
});

describe("normalizeCitations", () => {
  it("keeps cited URLs once, with breadcrumbs when given", () => {
    expect(
      normalizeCitations(
        [
          {
            title: "PDA",
            url: "/docs/core/pda",
            breadcrumbs: ["Building", { title: "PDAs" }],
          },
          { title: "Again", url: "/developers/docs/core/pda" },
          { title: "No URL" },
          { href: "/docs/core/cpi" },
        ],
        "ja",
      ),
    ).toEqual([
      {
        title: "PDA",
        url: "/ja/developers/docs/core/pda",
        breadcrumbs: ["Building", "PDAs"],
      },
      { title: "", url: "/ja/developers/docs/core/cpi" },
    ]);
  });
});

describe("splitCodeFollowupPrompt", () => {
  it("removes the follow-up prompt when it ends the answer", () => {
    expect(
      splitCodeFollowupPrompt(
        "### Summary response\nA CPI is a cross-program invocation.\n\nDo you want code?",
        followups,
      ),
    ).toEqual({
      body: "### Summary response\nA CPI is a cross-program invocation.",
      prompt: "Do you want code?",
    });
  });

  it("keeps the body when the prompt is not the last text", () => {
    const response = "### Summary response\nDo you want code? This explains.";
    expect(splitCodeFollowupPrompt(response, followups)).toEqual({
      body: response,
      prompt: "Do you want code?",
    });
  });
});

describe("splitAnswerSections", () => {
  it("splits the summary from the in-depth part and drops the headings", () => {
    expect(
      splitAnswerSections(
        "### Summary response\nShort answer.\n\n### Indepth response\nLong answer.",
      ),
    ).toEqual({ summary: "Short answer.", inDepth: "Long answer." });
  });

  it("accepts heading variants", () => {
    expect(
      splitAnswerSections("## Summary\nShort.\n## In-depth response:\r\nLong."),
    ).toEqual({ summary: "Short.", inDepth: "Long." });
  });

  it("treats text without headings as all summary", () => {
    expect(splitAnswerSections("Plain answer.")).toEqual({
      summary: "Plain answer.",
      inDepth: null,
    });
  });

  it("hides a half-streamed heading", () => {
    expect(
      splitAnswerSections("### Summary response\nShort.\n\n### Indep"),
    ).toEqual({
      summary: "Short.",
      inDepth: null,
    });
    expect(splitAnswerSections("### Summ")).toEqual({
      summary: "",
      inDepth: null,
    });
    expect(splitAnswerSections("Short.\n### Indepth response")).toEqual({
      summary: "Short.",
      inDepth: null,
    });
  });

  it("keeps other headings", () => {
    expect(
      splitAnswerSections("### Summary response\nA.\n### Example\nB.").summary,
    ).toBe("A.\n### Example\nB.");
  });
});

describe("status and error mapping", () => {
  it("maps raw stages to the status row", () => {
    expect(askStatusForStage("searching_docs")).toBe("searching");
    expect(askStatusForStage("building_visual")).toBe("visual");
    expect(askStatusForStage("cache_hit")).toBe("writing");
    expect(askStatusForStage("session_start")).toBe("preparing");
    expect(askStatusForStage("something_new")).toBe("preparing");
  });

  it("maps every stage the agent sends", () => {
    const stages = {
      accepted: "preparing",
      starting: "preparing",
      searching_docs: "searching",
      reading_doc: "searching",
      using_tool: "searching",
      retrieving_docs: "searching",
      building_plan: "searching",
      response_cache_hit: "writing",
      rendering_template_answer: "writing",
      writing: "writing",
      building_visual_answer: "visual",
    };
    for (const [stage, status] of Object.entries(stages)) {
      expect([stage, askStatusForStage(stage)]).toEqual([stage, status]);
    }
  });

  it("only moves the status row forward", () => {
    expect(advanceAskStatus(undefined, "searching")).toBe("searching");
    expect(advanceAskStatus("preparing", "searching")).toBe("searching");
    expect(advanceAskStatus("searching", "preparing")).toBe("searching");
    expect(advanceAskStatus("writing", "searching")).toBe("writing");
    expect(advanceAskStatus("writing", "visual")).toBe("visual");
    expect(advanceAskStatus("visual", "writing")).toBe("visual");
  });

  it("maps the agent's real error bodies", () => {
    const kinds = Object.fromEntries(
      Object.entries(AGENT_ERRORS).map(([name, { status, body }]) => [
        name,
        askErrorKindFor(status, body),
      ]),
    );
    expect(kinds).toEqual({
      // A wrong proxy secret: the proxy answers 502 instead (see ask-route).
      forbidden: "generic",
      invalidSession: "session",
      throttled: "rateLimited",
      pendingRun: "busy",
      messageTooLong: "tooLong",
      invalidConversationId: "generic",
      invalidMessage: "tooLong",
      conversationNotFound: "generic",
      conversationFull: "conversationFull",
      budget: "unavailable",
      notProvisioned: "unavailable",
    });
    expect(askErrorKindForEvent(AGENT_STREAM_ERROR)).toBe("generic");
  });

  it("tells the three 429s apart", () => {
    expect(askErrorKindFor(429, { error: "rate_limited" })).toBe("rateLimited");
    expect(
      askErrorKindFor(429, {
        error: "Please wait for your previous question to finish.",
      }),
    ).toBe("busy");
    // Not the agent's JSON: a capacity limit in front of it.
    expect(askErrorKindFor(429, "<html>Rate exceeded.</html>")).toBe(
      "unavailable",
    );
    expect(askErrorKindFor(429, "")).toBe("unavailable");
    expect(askErrorKindFor(429, null)).toBe("unavailable");
  });

  it("finds a conversation the session can't use", () => {
    const { conversationNotFound, invalidConversationId, invalidMessage } =
      AGENT_ERRORS;
    expect(
      isStaleConversation(
        conversationNotFound.status,
        conversationNotFound.body,
      ),
    ).toBe(true);
    expect(
      isStaleConversation(
        invalidConversationId.status,
        invalidConversationId.body,
      ),
    ).toBe(true);
    expect(
      isStaleConversation(invalidMessage.status, invalidMessage.body),
    ).toBe(false);
    expect(isStaleConversation(404, { error: "Run not found." })).toBe(false);
    expect(isStaleConversation(404, "<html>Not Found</html>")).toBe(false);
  });

  it("maps statuses and bodies to error kinds", () => {
    expect(askErrorKindFor(401, null)).toBe("session");
    // 403 is a wrong secret or a refused origin: a new token can't help.
    expect(askErrorKindFor(403, null)).toBe("generic");
    expect(askErrorKindFor(403, { error: "invalid_origin" })).toBe("generic");
    expect(askErrorKindFor(419, null)).toBe("session");
    expect(askErrorKindFor(400, { error: "invalid_session" })).toBe("session");
    expect(askErrorKindFor(503, { error: "ask_not_configured" })).toBe(
      "unavailable",
    );
    expect(askErrorKindFor(502, null)).toBe("unavailable");
    expect(askErrorKindFor(413, null)).toBe("tooLong");
    expect(askErrorKindFor(422, { message: "Message too long" })).toBe(
      "tooLong",
    );
    expect(askErrorKindFor(409, null)).toBe("conversationFull");
    expect(askErrorKindFor(400, { error: "conversation_limit" })).toBe(
      "conversationFull",
    );
    expect(askErrorKindFor(500, "accurate limit")).toBe("generic");
  });

  it("maps stream error events", () => {
    expect(askErrorKindForEvent({ message: "stream error" })).toBe("generic");
    expect(askErrorKindForEvent({ error: "rate_limited" })).toBe("rateLimited");
    expect(askErrorKindForEvent({ error: "invalid_session" })).toBe("generic");
  });

  it("keeps our codes' kinds when they arrive as stream events", () => {
    // nous refuses after a template visual already went out (HTTP 200).
    for (const error of ["ask_unavailable", "ask_timeout", "ask_misconfigured"])
      expect(askErrorKindForEvent({ error, message: "x" })).toBe("unavailable");
    expect(askErrorKindForEvent({ error: "ask_failed" })).toBe("incomplete");
    expect(
      askErrorKindForEvent({ error: "rate_limited", message: "busy" }),
    ).toBe("rateLimited");
  });
});
