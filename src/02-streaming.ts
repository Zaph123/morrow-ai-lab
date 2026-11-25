import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

// --------------------------------------------------------------------------
// 1. ENVIRONMENT & INITIALIZATION
// --------------------------------------------------------------------------
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const ai = new GoogleGenAI({ apiKey });

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
        console.warn(`\n⚠️ [Attempt ${attempt}] High demand (Status ${err.status}). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exhausted retries");
}

// --------------------------------------------------------------------------
// 2. THE STREAMING EXPERIMENT
// --------------------------------------------------------------------------
async function runStreamingLesson() {
  console.log("=================================================");
  console.log(" LESSON 2: STREAMING & THE PERCEPTION OF SPEED   ");
  console.log("=================================================\n");

  const prompt = `
    Write a 3-paragraph essay for Morrow Studio:
    "Why building in public is the best resume for modern software engineers."
    Keep it punchy, practical, and inspiring.
  `;

  console.log("📝 Prompt Sent to Gemini:\n", prompt.trim());
  console.log("\n⏳ Establishing stream connection...\n");

  const requestStartTime = performance.now();
  let timeToFirstTokenMs: number | null = null;
  let chunkCount = 0;
  let fullAccumulatedText = "";

  // `ai.models.generateContentStream` returns an AsyncIterable
  const stream = await withRetry(() =>
    ai.models.generateContentStream({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
    })
  );

  console.log("🟢 [STREAM STARTED] - Receiving chunks:\n");
  console.log("-------------------------------------------------");

  // `for await (... of ...)` iterates over each packet as it arrives from Google's servers
  for await (const chunk of stream) {
    const chunkText = chunk.text ?? "";

    if (chunkText.length > 0) {
      // Record Time-to-First-Token (TTFT) on the first received chunk
      if (timeToFirstTokenMs === null) {
        timeToFirstTokenMs = Math.round(performance.now() - requestStartTime);
      }

      chunkCount++;
      fullAccumulatedText += chunkText;

      // In Node.js, process.stdout.write prints characters WITHOUT adding a new line!
      // This mimics real-time typing in Morrow's text editor.
      process.stdout.write(chunkText);
    }
  }

  console.log("\n-------------------------------------------------");
  console.log("🔴 [STREAM FINISHED]\n");

  const totalTimeMs = Math.round(performance.now() - requestStartTime);
  const streamDurationMs = totalTimeMs - (timeToFirstTokenMs ?? 0);

  // ------------------------------------------------------------------------
  // 3. AI ENGINEERING METRICS: WHY STREAMING MATTERS
  // ------------------------------------------------------------------------
  console.log("📊 Critical AI Engineering Metrics:");
  console.log({
    "1_TimeToFirstToken (TTFT)": `${timeToFirstTokenMs}ms  <-- What the user feels!`,
    "2_TotalLatency": `${totalTimeMs}ms`,
    "3_StreamingChunksReceived": chunkCount,
    "4_AverageChunkInterval": `${Math.round(streamDurationMs / Math.max(1, chunkCount))}ms`,
    "5_CharacterCount": fullAccumulatedText.length,
    "6_Stream": stream,
  });

  console.log("\n💡 MENTOR INSIGHT:");
  console.log(`Without streaming, the user would stare at a blank spinner for ${(totalTimeMs / 1000).toFixed(1)} seconds.`);
  console.log(`With streaming, the user started reading in ${(timeToFirstTokenMs! / 1000).toFixed(2)} seconds!`);
}

runStreamingLesson().catch(console.error);
