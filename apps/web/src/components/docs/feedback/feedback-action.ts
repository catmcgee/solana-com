"use server";

import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Feedback } from "./rate.client";

/**
 * The page feedback widget's reply (ported from the docs app before the
 * move, apps/docs rate.tsx + inkeep-feedback.ts): an AI thank-you with
 * further reading, streamed back, and the feedback logged to Inkeep
 * analytics. Uses Inkeep's QA model when INKEEP_API_KEY is set, else GLM
 * (NOUS_API_KEY), else just thanks the reader.
 */
const INKEEP_KEY = process.env.INKEEP_API_KEY;
const NOUS_KEY = process.env.NOUS_API_KEY;

function prompt(url: string, feedback: Feedback): string {
  return `Feedback received for URL: ${url}
Rating: ${feedback.opinion}
Message: ${feedback.message}

Instructions:
1. Begin your response with: "Thank you for providing feedback."
2. Do not include any code in your reply.
3. Respond concisely.
4. If the feedback is vague or lacks detail, politely request more specific feedback, explaining that detailed input helps us improve more effectively.
5. When specific topics are mentioned:
   - Only provide links to documentation or resources you are confident will address their concerns.
   - Do NOT reference or link back to the same URL (${url}) related to the feedback.
   - Ensure each link is unique and clearly describes the resource.
   - Omit links if you are unsure about their relevance.

Also, suggest additional, complementary resources that might be helpful while adhering to the above guidelines.`;
}

function model() {
  if (INKEEP_KEY)
    return createOpenAI({
      apiKey: INKEEP_KEY,
      baseURL: "https://api.inkeep.com/v1",
    }).chat("inkeep-qa-sonnet-3-5");
  if (NOUS_KEY)
    return createOpenAI({
      apiKey: NOUS_KEY,
      baseURL: "https://inference-api.nousresearch.com/v1",
    }).chat(process.env.NOUS_MODEL ?? "z-ai/glm-5.3-flash:US");
  return null;
}

function textStream(text: string): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

export async function onRateAction(
  url: string,
  feedback: Feedback,
): Promise<ReadableStream<string>> {
  const llm = model();
  if (!llm) return textStream("Thank you for your feedback.");
  let stream: AsyncIterable<string>;
  try {
    stream = streamText({
      model: llm,
      messages: [{ role: "user", content: prompt(url, feedback) }],
    }).textStream;
  } catch (error) {
    console.error("Feedback reply failed:", error);
    return textStream("Thank you for your feedback.");
  }
  return new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of stream) {
          full += chunk;
          controller.enqueue(chunk);
        }
        await logToInkeep(url, feedback, full).catch((error) =>
          console.error("Feedback logging failed:", error),
        );
      } catch (error) {
        console.error("Feedback reply failed:", error);
        if (!full) controller.enqueue("Thank you for your feedback.");
      }
      controller.close();
    },
  });
}

/** Inkeep analytics: the exchange as a conversation, then the thumb. */
async function logToInkeep(url: string, feedback: Feedback, reply: string) {
  if (!INKEEP_KEY) return;
  const headers = {
    Authorization: `Bearer ${INKEEP_KEY}`,
    "Content-Type": "application/json",
  };
  const conversation = await fetch(
    "https://api.analytics.inkeep.com/conversations",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "openai",
        messages: [
          {
            role: "user",
            content: `• ${feedback.opinion.toUpperCase()} \n• URL: ${url}\n• Message: ${feedback.message}`,
          },
          { role: "assistant", content: reply },
        ],
        properties: { url, opinion: feedback.opinion, source: "solana_docs" },
      }),
    },
  );
  if (!conversation.ok) return;
  const result = (await conversation.json()) as {
    messages?: { id?: string }[];
  };
  const messageId = result.messages?.[1]?.id;
  if (!messageId) return;
  await fetch("https://api.analytics.inkeep.com/feedback", {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: feedback.opinion,
      messageId,
      reasons: [{ label: "user_feedback", details: feedback.message }],
      userProperties: { url },
    }),
  });
}
