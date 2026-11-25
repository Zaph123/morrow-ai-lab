import "dotenv/config";
import { Type } from "@google/genai";
import { z } from "zod";
import { MorrowAIClient } from "./client/morrow-ai.js";

// ============================================================================
// 1. INITIALIZE THE PRODUCTION CLIENT
// ============================================================================
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("Missing GEMINI_API_KEY in .env");
}

const morrow = new MorrowAIClient({
  apiKey,
  defaultModel: "gemini-3.5-flash-lite", // Fast, low-latency, generous free-tier quota
  fallbackModel: "gemini-3.1-flash-lite", // Reliable instant failover
  maxRetries: 3,
  baseRetryDelayMs: 1500,
});

// ============================================================================
// 2. DEFINE THE MORROW WORKSPACE SCHEMAS
// ============================================================================

// Schema for Morrow's "Multi-Platform Repurposing Matrix"
const ContentPlanSchema = z.object({
  coreIdea: z.string().describe("1-sentence summary of the core philosophical idea"),
  targetAudience: z.string().describe("The primary reader profile"),
  formats: z.object({
    twitterHook: z.string().max(280).describe("A high-impact hook tweet under 280 characters"),
    linkedinHeadline: z.string().describe("Professional LinkedIn post title"),
    newsletterAngle: z.string().describe("The in-depth storytelling angle for email subscribers"),
  }),
  estimatedProductionEffortMinutes: z.number().describe("Estimated minutes to write full drafts"),
});

type ContentPlan = z.infer<typeof ContentPlanSchema>;

// ============================================================================
// 3. RUN THE LAB EXPERIMENTS
// ============================================================================
async function runProductionClientDemo() {
  console.log("==========================================================");
  console.log(" LESSON 3: THE RESILIENT MORROW AI CLIENT ARCHITECTURE    ");
  console.log("==========================================================\n");

  const rawIdea = `
    "Most indie developers fail not because their code is bad, 
     but because they build in secret for 6 months without ever talking to a customer."
  `;

  console.log("💡 Raw Thought from Morrow Studio:\n", rawIdea.trim());

  // ------------------------------------------------------------------------
  // PART A: Structured Repurposing Matrix
  // ------------------------------------------------------------------------
  console.log("\n--- [PART A] Generating Structured Content Plan ---");

  const structuredResult = await morrow.generateStructured<ContentPlan>({
    prompt: `Analyze and adapt this creator thought:\n${rawIdea}`,
    systemInstruction: "You are the Lead Editorial Director at Morrow Studio. You value authenticity, directness, and tactical clarity.",
    temperature: 0.1, // Strict determinism
    schema: ContentPlanSchema,
    geminiSchema: {
      type: Type.OBJECT,
      properties: {
        coreIdea: { type: Type.STRING },
        targetAudience: { type: Type.STRING },
        formats: {
          type: Type.OBJECT,
          properties: {
            twitterHook: { type: Type.STRING },
            linkedinHeadline: { type: Type.STRING },
            newsletterAngle: { type: Type.STRING },
          },
          required: ["twitterHook", "linkedinHeadline", "newsletterAngle"],
        },
        estimatedProductionEffortMinutes: { type: Type.INTEGER },
      },
      required: ["coreIdea", "targetAudience", "formats", "estimatedProductionEffortMinutes"],
    },
  });

  console.log("\n✅ Structured Data Validated & Ready for Morrow State:");
  console.log(JSON.stringify(structuredResult.data, null, 2));

  console.log("\n📊 Structured Call Telemetry:");
  console.log(structuredResult.metrics);

  // ------------------------------------------------------------------------
  // PART B: Real-Time Streamed Draft with Editorial Persona
  // ------------------------------------------------------------------------
  console.log("\n--- [PART B] Streaming Full Draft with Editorial Voice ---");
  console.log("🟢 [STREAMING DRAFT TO UI]:\n");

  const streamResult = await morrow.streamText({
    prompt: `Write a compelling 2-paragraph essay draft based on this core insight:\n"${structuredResult.data.coreIdea}"`,
    systemInstruction: "You write for Morrow Studio. Short sentences. Punchy. No corporate buzzwords. Human and honest.",
    temperature: 0.7, // Creative drafting
    onChunk: (text) => process.stdout.write(text),
  });

  console.log("\n\n🔴 [STREAM COMPLETE]");
  console.log("\n📊 Stream Telemetry:");
  console.log(streamResult.metrics);
}

runProductionClientDemo().catch(console.error);
