import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.join(__dirname, "..", "data", "cursor-workspace");

const MODEL_ALIASES = {
  "claude-sonnet-5": ["claude-sonnet-5", "claude-4.5-sonnet", "claude-sonnet-4-5", "anthropic/claude-sonnet-4.5"],
  "gpt-5.5": ["gpt-5.5", "gpt-5"],
  "gpt-5.6-sol": ["gpt-5.6-sol", "gpt-5.6", "gpt-5"],
  "gpt-5.6-terra": ["gpt-5.6-terra", "gpt-5.6", "gpt-5"],
  "gpt-5.6-luna": ["gpt-5.6-luna", "gpt-5.6", "gpt-5"],
};

let catalogCache = null;

export function cursorEnabled() {
  return Boolean(process.env.CURSOR_API_KEY?.trim()) && process.env.LLM_BACKEND !== "off";
}

function ensureWorkspace() {
  fs.mkdirSync(WORKSPACE, { recursive: true });
  const keep = path.join(WORKSPACE, ".keep");
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, "local Cursor SDK workspace — do not use as the product repo\n");
}

async function resolveModelId(requested) {
  const { Cursor } = await import("@cursor/sdk");
  try {
    if (!catalogCache) {
      const tList = Date.now();
      catalogCache = await Cursor.models.list({ apiKey: process.env.CURSOR_API_KEY });
      console.log(`[PromptTesting] Cursor.models.list cold ${Date.now() - tList}ms count=${catalogCache?.length}`);
    }
  } catch (err) {
    console.warn("Cursor.models.list failed:", err.message);
    catalogCache = [];
  }
  const ids = (catalogCache || []).map((m) => m.id);
  const aliases = MODEL_ALIASES[requested] || [requested];
  for (const alias of aliases) {
    const exact = ids.find((id) => id === alias);
    if (exact) return exact;
    const partial = ids.find((id) => id.toLowerCase().includes(alias.toLowerCase()) || alias.toLowerCase().includes(id.toLowerCase()));
    if (partial) return partial;
  }
  if (ids.includes("composer-2.5")) return "composer-2.5";
  if (ids.includes("auto")) return "auto";
  return requested || "composer-2.5";
}

function transcriptBlock(messages) {
  if (!messages?.length) return "Send only the opening welcome.";
  return messages.map((m) => `${m.role === "assistant" ? "Kael" : "Student"}: ${m.content}`).join("\n\n");
}

export async function callCursor({ compiled, messages, model, mode, factCard }) {
  if (!cursorEnabled()) return null;
  ensureWorkspace();
  const { Agent } = await import("@cursor/sdk");
  const modelId = await resolveModelId(model);
  const instructions = [
    "Kael: student-visible chat only. No tools or files. Short paragraphs separated by a line that is only a period.",
    compiled,
    factCard || "",
    mode === "initial" ? "Send only the opening welcome." : transcriptBlock(messages),
  ]
    .filter(Boolean)
    .join("\n\n");

  const options = {
    apiKey: process.env.CURSOR_API_KEY.trim(),
    model: { id: modelId },
    tools: [],
    local: { cwd: WORKSPACE, settingSources: [] },
  };

  const tPrompt = Date.now();
  const agent = await Agent.create(options);
  let result;
  try {
    const run = await agent.send(instructions);
    result = await run.wait();
  } finally {
    try {
      agent.close();
    } catch {
      /* ignore */
    }
  }
  console.log(
    `[PromptTesting] Agent.send ${Date.now() - tPrompt}ms (sdk ${result.durationMs ?? "n/a"}ms) reused=false model=${modelId} compiled=${compiled?.length} chars instructions=${instructions.length} status=${result.status}`
  );

  if (result.status !== "finished" || !result.result) {
    throw new Error(result.error?.message || `Cursor run ${result.status}`);
  }
  console.log("Cursor generation ok", result.model?.id || modelId, "chars", String(result.result).length);
  return {
    text: String(result.result).trim(),
    input_tokens: result.usage?.inputTokens,
    output_tokens: result.usage?.outputTokens,
    cursor_model: result.model?.id || modelId,
    debug: {
      compiled_chars: compiled?.length,
      instructions_chars: instructions.length,
      modelId,
      prompt_wall_ms: Date.now() - tPrompt,
      sdk_durationMs: result.durationMs,
      streamed: false,
      newAgentEachCall: true,
      reused: false,
    },
  };
}
