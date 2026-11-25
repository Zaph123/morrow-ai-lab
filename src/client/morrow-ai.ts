import { GoogleGenAI, type Schema } from "@google/genai";
import { z } from "zod";

// ============================================================================
// CONFIGURATION & METRICS TYPES
// ============================================================================

export interface MorrowAIConfig {
  apiKey: string;
  defaultModel?: string;
  fallbackModel?: string;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export interface GenerationMetrics {
  modelUsed: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  retriesAttempted: number;
}

export interface StructuredResult<T> {
  data: T;
  metrics: GenerationMetrics;
}

export interface StreamResult {
  fullText: string;
  metrics: GenerationMetrics;
}

// ============================================================================
// THE PRODUCTION MORROW AI CLIENT
// ============================================================================

export class MorrowAIClient {
  private ai: GoogleGenAI;
  private defaultModel: string;
  private fallbackModel: string;
  private maxRetries: number;
  private baseRetryDelayMs: number;

  constructor(config: MorrowAIConfig) {
    if (!config.apiKey) {
      throw new Error("[MorrowAIClient] API key is required.");
    }
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    // Default to high-throughput models with generous free quotas
    this.defaultModel = config.defaultModel ?? "gemini-3.5-flash-lite";
    this.fallbackModel = config.fallbackModel ?? "gemini-3.1-flash-lite";
    this.maxRetries = config.maxRetries ?? 3;
    this.baseRetryDelayMs = config.baseRetryDelayMs ?? 1500;
  }

  /**
   * Internal Resilience Engine:
   * 1. If 429 (Quota Exhausted) -> Immediately fails over to fallback model.
   * 2. If 503 (Spike in Demand) -> Retries with exponential backoff before attempting fallback.
   */
  private async executeWithResilience<T>(
    operation: (model: string) => Promise<T>,
    preferredModel?: string
  ): Promise<{ result: T; modelUsed: string; retries: number }> {
    const primary = preferredModel ?? this.defaultModel;
    const fallback = this.fallbackModel;
    let retriesCount = 0;

    // Helper to execute an operation on a target model with 503 backoff
    const tryWithBackoff = async (targetModel: string): Promise<T> => {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          return await operation(targetModel);
        } catch (err: any) {
          retriesCount++;
          const isSpike = err?.status === 503;
          const isQuota = err?.status === 429;

          // If daily quota exhausted, do not retry this model — throw immediately so fallback can take over
          if (isQuota) {
            console.warn(`\n[MorrowAIClient] Model '${targetModel}' quota exhausted (429). Triggering immediate failover.`);
            throw err;
          }

          if (isSpike && attempt < this.maxRetries) {
            const delay = this.baseRetryDelayMs * attempt;
            console.warn(`\n[MorrowAIClient] Model '${targetModel}' busy (503). Retrying in ${delay}ms... (Attempt ${attempt}/${this.maxRetries})`);
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }
          throw err;
        }
      }
      throw new Error(`[MorrowAIClient] Retries exhausted for ${targetModel}`);
    };

    // Phase 1: Try Primary Model
    try {
      const result = await tryWithBackoff(primary);
      return { result, modelUsed: primary, retries: retriesCount };
    } catch (primaryErr: any) {
      if (primary === fallback) {
        throw primaryErr;
      }

      // Phase 2: Automatic Fallback
      console.warn(`\n[MorrowAIClient] Primary model '${primary}' unavailable. Failing over to '${fallback}'...`);
      try {
        const result = await tryWithBackoff(fallback);
        return { result, modelUsed: fallback, retries: retriesCount };
      } catch (fallbackErr) {
        console.error(`\n[MorrowAIClient] Both primary (${primary}) and fallback (${fallback}) failed.`);
        throw fallbackErr;
      }
    }
  }

  /**
   * 1. STRUCTURED GENERATION
   * Enforces type-safe schema validation with deterministic JSON output.
   */
  async generateStructured<T>(options: {
    prompt: string;
    systemInstruction?: string;
    schema: z.ZodSchema<T>;
    geminiSchema: Schema;
    model?: string;
    temperature?: number;
  }): Promise<StructuredResult<T>> {
    const start = performance.now();

    const { result: response, modelUsed, retries } = await this.executeWithResilience(
      (model) =>
        this.ai.models.generateContent({
          model,
          contents: options.prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? 0.2, // Low temperature for schema fidelity
            responseMimeType: "application/json",
            responseSchema: options.geminiSchema,
          },
        }),
      options.model
    );

    const rawText = response.text;
    if (!rawText) {
      throw new Error("[MorrowAIClient] Model returned empty response.");
    }

    // Step A: Parse raw JSON
    const parsedJson = JSON.parse(rawText);

    // Step B: Runtime validation with Zod
    const validatedData = options.schema.parse(parsedJson);

    return {
      data: validatedData,
      metrics: {
        modelUsed,
        latencyMs: Math.round(performance.now() - start),
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
        retriesAttempted: retries,
      },
    };
  }

  /**
   * 2. STREAMING GENERATION
   * Streams text chunks in real time, with the resilience engine wrapping BOTH
   * stream initialization AND stream consumption (protecting against mid-stream 503 drops).
   */
  async streamText(options: {
    prompt: string;
    systemInstruction?: string;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    onChunk: (chunkText: string) => void;
  }): Promise<StreamResult> {
    const start = performance.now();

    const { result, modelUsed, retries } = await this.executeWithResilience(
      async (model) => {
        let accumulatedText = "";
        let inputTokens = 0;
        let outputTokens = 0;
        let totalTokens = 0;

        const stream = await this.ai.models.generateContentStream({
          model,
          contents: options.prompt,
          config: {
            systemInstruction: options.systemInstruction,
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxOutputTokens,
          },
        });

        for await (const chunk of stream) {
          const text = chunk.text ?? "";
          if (text.length > 0) {
            accumulatedText += text;
            options.onChunk(text);
          }
          if (chunk.usageMetadata) {
            inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
            outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
            totalTokens = chunk.usageMetadata.totalTokenCount ?? totalTokens;
          }
        }

        return { accumulatedText, inputTokens, outputTokens, totalTokens };
      },
      options.model
    );

    return {
      fullText: result.accumulatedText,
      metrics: {
        modelUsed,
        latencyMs: Math.round(performance.now() - start),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens,
        retriesAttempted: retries,
      },
    };
  }

  /**
   * Direct access to underlying GoogleGenAI instance.
   */
  get sdk(): GoogleGenAI {
    return this.ai;
  }
}
