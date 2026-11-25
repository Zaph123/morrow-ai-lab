import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY");
}

const ai = new GoogleGenAI({ apiKey });

async function main() {
  const start = performance.now();

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: `
      You are a writing assistant.

      Turn this rough idea into a concise
      LinkedIn post outline:

      "Developers often spend too much time
      perfecting portfolios instead of
      applying for jobs."
    `,
  });

  console.log("\nAI Response:\n");
  console.log(response.text);

  console.log("\nMetrics:");
  console.log({
    latencyMs: Math.round(performance.now() - start),
    inputTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
    totalTokens: response.usageMetadata?.totalTokenCount,
  });
}

main().catch(console.error);
