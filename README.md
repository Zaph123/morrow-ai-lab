# Morrow AI Lab

An isolated laboratory and learning testbed for building resilient, production-grade AI integrations and workflows for **Morrow** (a writing-first creative workspace).

## Project Overview

This repository documents the hands-on engineering progression from raw model inference to autonomous AI agent systems:

- **Stage 1: Core AI Integration**
  - Model APIs, Token Counting & Latency Measurement (`@google/genai`)
  - Grammar-Constrained Decoding & Structured Outputs with `zod`
  - Real-time Token Streaming with `AsyncIterable`
  - Production Resilience Engine (Transient `503` retry with exponential backoff & `429` failover)
  - Custom Gateway Client (`MorrowAIClient`)
- **Stage 2: Context & Memory** *(Upcoming)*
  - Embeddings, Vector Similarity & Semantic Retrieval (RAG)
  - Persona & Brand Brain Ingestion
- **Stage 3: Tool-Using AI** *(Upcoming)*
  - Function Calling, Structured Dispatch & Human-in-the-Loop Approval Gates
- **Stage 4: Autonomous Agents** *(Upcoming)*
  - Multi-step Task Decomposition & Self-Correction

---

## Lab Experiments

| Experiment | File | Description |
|---|---|---|
| **01** | `src/01-structured-output.ts` | Type-safe JSON generation with Zod validation. |
| **02** | `src/02-streaming.ts` | Real-time token streaming & Time-to-First-Token (TTFT) metrics. |
| **03** | `src/03-resilient-client.ts` | Production-grade `MorrowAIClient` demonstrating structured generation, failover, and streaming. |

---

## Getting Started

### 1. Prerequisites
- [pnpm](https://pnpm.io/)
- Node.js (v20+)
- Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### 2. Setup
```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env # Add your GEMINI_API_KEY
```

### 3. Run Experiments
```bash
# Structured Output
pnpm exec tsx src/01-structured-output.ts

# Streaming
pnpm exec tsx src/02-streaming.ts

# Resilient Client
pnpm exec tsx src/03-resilient-client.ts
```
