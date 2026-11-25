import "dotenv/config";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";

// --------------------------------------------------------------------------
// 1. ENVIRONMENT & INITIALIZATION
// --------------------------------------------------------------------------
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const ai = new GoogleGenAI({ apiKey });

// --------------------------------------------------------------------------
// 2. THE CONTRACT: TypeScript & Zod Schema
// --------------------------------------------------------------------------
// In Morrow, we don't want raw unstructured text strings. We want an object 
// that our frontend components (cards, lists, badges) can render reliably.
export const LinkedInPostSchema = z.object({
  headline: z.string().describe("A provocative, punchy 1-line headline"),
  hook: z.string().describe("The opening 1-2 sentences that stop the reader from scrolling"),
  problem: z.string().describe("The core mistake or struggle developers make"),
  takeaways: z.array(z.string()).min(2).max(4).describe("2-4 concise, actionable bullet points"),
  cta: z.string().describe("A question or call to action to spark comments"),
  estimatedReadTimeSec: z.number().describe("Estimated reading time in seconds"),
});

// Infer the TypeScript type directly from our Zod schema
export type LinkedInPost = z.infer<typeof LinkedInPostSchema>;

// --------------------------------------------------------------------------
// HELPER: Resilience Wrapper (handles transient 503 / 429)
// --------------------------------------------------------------------------
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 10, baseDelayMs = 1500): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isTransient = err?.status === 503 || err?.status === 429;
      if (isTransient && attempt < maxRetries) {
        const delay = baseDelayMs * attempt;
        console.warn(`⚠️ [Attempt ${attempt}] Temporary capacity spike (Status ${err.status}). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted retries");
}

// --------------------------------------------------------------------------
// 3. THE LAB FUNCTION
// --------------------------------------------------------------------------
async function runStructuredOutputLesson() {
  console.log("=================================================");
  console.log(" LESSON 1: STRUCTURED OUTPUTS (The AI Contract)  ");
  console.log("=================================================\n");

  const rawUserIdea = `
    "Developers often spend too much time perfecting portfolios 
     instead of actually applying for jobs."
  `;

  console.log("📥 Raw Input Idea:\n", rawUserIdea.trim());
  console.log("\n⏳ Requesting structured JSON from Gemini (gemini-4-hydrogen)...\n");

  const start = performance.now();

  // We pass `responseMimeType` and `responseSchema` in the config.
  // This instructs Gemini's token sampler to enforce valid JSON matching our keys.
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Transform this rough idea into a structured LinkedIn post:\n${rawUserIdea}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            hook: { type: Type.STRING },
            problem: { type: Type.STRING },
            takeaways: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            cta: { type: Type.STRING },
            estimatedReadTimeSec: { type: Type.INTEGER },
          },
          required: ["headline", "hook", "problem", "takeaways", "cta", "estimatedReadTimeSec"],
        },
      },
    })
  );

  const latency = Math.round(performance.now() - start);

  // ------------------------------------------------------------------------
  // 4. PARSING & RUNTIME VALIDATION
  // ------------------------------------------------------------------------
  const rawJsonText = response.text;
  if (!rawJsonText) {
    throw new Error("Model returned empty response text");
  }

  console.log("📦 Raw JSON returned by LLM:\n", rawJsonText);

  // Step A: Parse raw JSON string to a JavaScript object
  const parsedJson = JSON.parse(rawJsonText);

  // Step B: Validate with Zod!
  // If the LLM omitted a field or returned a wrong type, Zod throws an informative error.
  const post: LinkedInPost = LinkedInPostSchema.parse(parsedJson);

  console.log("\n✅ Zod Validation Succeeded!");
  console.log("🎯 Strongly-Typed Object ready for Morrow's UI:\n");
  console.log(`Headline: "${post.headline}"`);
  console.log(`Hook:     ${post.hook}`);
  console.log(`Problem:  ${post.problem}`);
  console.log(`Takeaways (${post.takeaways.length}):`);
  post.takeaways.forEach((point, i) => console.log(`   ${i + 1}. ${point}`));
  console.log(`CTA:      ${post.cta}`);
  console.log(`Read time: ~${post.estimatedReadTimeSec} seconds`);

  console.log("\n📊 Execution Metrics:");
  console.log({
    latencyMs: latency,
    inputTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
    totalTokens: response.usageMetadata?.totalTokenCount,
  });
}

runStructuredOutputLesson().catch(console.error);
