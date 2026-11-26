import "dotenv/config";
import { Type } from "@google/genai";
import { z } from "zod";
import { MorrowAIClient } from "./client/morrow-ai.js";

// ============================================================================
// 1. INITIALIZE MORROW CLIENT
// ============================================================================
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const morrow = new MorrowAIClient({
  apiKey,
  defaultModel: "gemini-3.5-flash-lite",
  fallbackModel: "gemini-3.1-flash-lite",
  maxRetries: 3,
  baseRetryDelayMs: 1500,
});

// ============================================================================
// 2. THE TWITTER / X POST SCHEMA
// ============================================================================
// We enforce:
// - Strictly under 280 characters (.max(280))
// - 3 different viral angles (Punchy, Story/Behind-the-Scenes, Question/Engagement)
// - Character count verification
export const XPostVariationsSchema = z.object({
  analysis: z.string().describe("Quick 1-sentence breakdown of why this build-in-public update has high signal"),
  variations: z.array(
    z.object({
      style: z.enum(["Punchy & Direct", "Story & Behind-the-Scenes", "Curiosity & High-Engagement"]),
      tweet: z
        .string()
        .max(280, "Tweet must strictly be under 280 characters")
        .describe("The ready-to-post tweet formatted with natural line breaks, under 260 characters for safety"),
      characterCount: z.number().describe("Calculated character count of the tweet"),
      whyItWorks: z.string().describe("Why this angle works well with tech Twitter/X"),
    })
  ).length(3),
});

export type XPostVariations = z.infer<typeof XPostVariationsSchema>;

// ============================================================================
// 3. EXECUTE THE TEST
// ============================================================================
async function runXPostExperiment() {
  console.log("==========================================================");
  console.log(" LAB EXPERIMENT 4: TWITTER/X POST OPTIMIZER               ");
  console.log("==========================================================\n");

  const rawUserDraft = `
    Just finished designing the screens for a little project am building - MORROW

    And no this is not Figma but Stitch (Google's AI design tool)

    Currently building it with codex and will drop the final look
  `;

  console.log("📥 Raw Creator Draft:\n", rawUserDraft.trim());
  console.log("\n⏳ Generating 3 high-signal X variations with MorrowAIClient...\n");

  const result = await morrow.generateStructured<XPostVariations>({
    prompt: `
      You are an expert X (Twitter) ghostwriter for indie builders and engineers.
      Analyze this draft and generate 3 distinctive, high-performing variations.
      
      CRITICAL INSTRUCTIONS:
      1. Keep every single tweet strictly under 260 characters to leave a safety margin under Twitter's 280 limit.
      2. Mention Stitch (Google's AI tool) and Codex naturally—that's the unique tech curiosity hook!
      3. Format with clean line breaks so it's easy to read on mobile.
      
      Draft to optimize:
      "${rawUserDraft}"
    `,
    systemInstruction: "You write for modern software builders on X. Authentic, tech-forward, zero cringe, no hashtags spam.",
    temperature: 0.3, // Slight creativity while maintaining strict schema adherence
    schema: XPostVariationsSchema,
    geminiSchema: {
      type: Type.OBJECT,
      properties: {
        analysis: { 
          type: Type.STRING, 
          description: "Quick 1-sentence breakdown of why this build-in-public update has high signal" 
        },
        variations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              style: { 
                type: Type.STRING, 
                enum: ["Punchy & Direct", "Story & Behind-the-Scenes", "Curiosity & High-Engagement"] 
              },
              tweet: { 
                type: Type.STRING, 
                description: "The ready-to-post tweet formatted with natural line breaks, under 260 characters" 
              },
              characterCount: { 
                type: Type.INTEGER, 
                description: "Calculated character count" 
              },
              whyItWorks: { 
                type: Type.STRING, 
                description: "Why this angle works well with tech Twitter/X" 
              },
            },
            required: ["style", "tweet", "characterCount", "whyItWorks"],
          },
        },
      },
      required: ["analysis", "variations"],
    },
  });

  console.log("💡 Strategy Analysis:", result.data.analysis);
  console.log("----------------------------------------------------------\n");

  result.data.variations.forEach((item, index) => {
    // We compute the true actual character count in JavaScript
    const trueLength = item.tweet.length;
    const isValid = trueLength <= 280;

    console.log(`[Variation ${index + 1}: ${item.style}]`);
    console.log("----------------------------------------------------------");
    console.log(item.tweet);
    console.log("----------------------------------------------------------");
    console.log(`📏 Length: ${trueLength} chars ${isValid ? "✅ (Within 280 limit)" : "❌ (Exceeded)"}`);
    console.log(`🎯 Strategy: ${item.whyItWorks}\n`);
  });

  console.log("📊 Telemetry:");
  console.log(result.metrics);
}

runXPostExperiment().catch(console.error);
