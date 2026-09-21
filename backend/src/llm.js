import { callCursor, cursorEnabled } from "./cursorLlm.js";

const HISTORY_MAX_MESSAGES = 10;
const HISTORY_MSG_CHARS = 1200;
const FULL_HISTORY_UNTIL = 12;
const FACT_LINE_CHARS = 280;
const FACT_CARD_MAX_CHARS = 2500;
const DRAFT_AFTER_USER_TURNS = 7;
const LAST_DRAFT_CHARS = 12000;
const HIDDEN_REVIEW_ONCE =
  "Hidden Review: apply the checklist once in this same reply. Do not start a second generation or rewrite the draft again after sending.";
const FIRST_COPY_ONCE =
  "Write ONE complete ADDA ad in this reply (Attention, Demand, Description, Action), then A/B/C/D. Do not stop after a single layer. Do not emit headlines until the student chooses D.";
const REVISE_EXISTING =
  "Revise the existing Kael draft in the transcript. Do not regenerate a second full ad unless the student asked for a new version (A/B/C).";

function clip(text, n) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function keyOf(m) {
  return String(m.module_key || "");
}

export function inferCompileStage(mode, messages) {
  if (mode === "initial" || !messages?.length) return "welcome";
  const userTurns = messages.filter((m) => (m.role === "assistant" || m.role === "ai" ? false : true)).length;
  const lastUser = [...messages].reverse().find((m) => m.role !== "assistant" && m.role !== "ai");
  const lastAsst = [...messages].reverse().find((m) => m.role === "assistant" || m.role === "ai");
  const u = String(lastUser?.content || lastUser?.transcript || "");
  const a = String(lastAsst?.content || "");
  if (/\b[ABCD][\.)、]\s/.test(a) || /^(A|B|C|D)\b/i.test(u.trim())) return "completion";
  if (userTurns >= DRAFT_AFTER_USER_TURNS) return "draft";
  return "discovery";
}

function stripChrome(content) {
  return String(content || "")
    .replace(/<aside>[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^>.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractNumberedItem(content, n) {
  const re = new RegExp(`(?:^|\\n)${n}\\.\\s([\\s\\S]*?)(?=\\n${n + 1}\\.\\s|\\n###|$)`);
  const m = String(content || "").match(re);
  return m ? `${n}. ${m[1].trim()}` : "";
}

function slimDiscoveryQuestions(content, userTurns) {
  const ask = Math.min(7, Math.max(1, userTurns + 1));
  const item = extractNumberedItem(content, ask) || clip(content, 1200);
  return [
    `Discovery: ask ONE question at a time, fixed order 1–7. Current question to ask or confirm: ${ask}.`,
    "Do not skip ahead to copy. Challenge vague audiences. Max 1–2 follow-ups.",
    item,
  ].join("\n\n");
}

function moduleForStage(m, stage) {
  const k = keyOf(m);
  if (m.type === "core" || k === "output_formatting") return true;
  if (stage === "welcome") return k.includes("welcome");
  if (stage === "discovery") {
    return k.includes("discovery") || k.includes("intake") || k.includes("brief");
  }
  if (stage === "draft") {
    return (
      k.includes("adda") ||
      k === "hidden_review" ||
      k.includes("draft") ||
      k.includes("education") ||
      k.includes("angle")
    );
  }
  if (stage === "completion") return k.includes("completion") || k.includes("complete") || k.includes("revision");
  if (stage === "image_handoff") return m.type === "handoff" || k.includes("handoff") || k.includes("image");
  return false;
}

function isFirstCopyTurn(userTurns) {
  return Math.max(0, userTurns - DRAFT_AFTER_USER_TURNS) === 0;
}

function filterDraftLayer(modules, userTurns) {
  const firstCopy = isFirstCopyTurn(userTurns);
  return modules.filter((m) => {
    const k = keyOf(m);
    if (m.type === "core" || k === "output_formatting") return true;
    if (firstCopy) {
      if (k.startsWith("adda") || k === "hidden_review") return true;
      if (k.includes("draft") || k.includes("education") || k.includes("angle")) return true;
      return false;
    }
    return k === "adda_overview" || k === "hidden_review";
  });
}

export function compilePrompt(store, chatbotKey, locale, mode, stageKey, messages) {
  let modules = store.data.modules
    .filter((m) => m.chatbot_key === chatbotKey && m.prompt_locale === locale && m.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const stage = stageKey || (mode === "initial" ? "welcome" : null);
  const userTurns = (messages || []).filter((m) => m.role !== "assistant" && m.role !== "ai").length;
  if (stage) {
    modules = modules.filter((m) => moduleForStage(m, stage));
    if (stage === "discovery") {
      const hasQuestions = modules.some((m) => keyOf(m).includes("questions"));
      if (hasQuestions) {
        modules = modules.filter((m) => !keyOf(m).includes("policy"));
      }
    }
    if (stage === "draft") modules = filterDraftLayer(modules, userTurns);
  }
  const parts = modules.map((m) => {
    let c = stripChrome(m._draft || m.content);
    if (stage === "discovery" && keyOf(m).includes("questions")) c = slimDiscoveryQuestions(c, userTurns);
    return c;
  });
  let compiled = parts.filter(Boolean).join("\n\n");
  if (stage === "draft") {
    compiled = compiled + "\n\n" + HIDDEN_REVIEW_ONCE;
    compiled =
      compiled + "\n\n" + (isFirstCopyTurn(userTurns) ? FIRST_COPY_ONCE : REVISE_EXISTING);
  }
  return { compiled, modules, compile_stage: stage || "full" };
}

function buildFactCard(older) {
  if (!older?.length) return "";
  const lines = [];
  for (const m of older) {
    const who = m.role === "assistant" ? "Kael" : "Student";
    if (who === "Student") lines.push(`- Student: ${clip(m.content, FACT_LINE_CHARS)}`);
    else lines.push(`- Kael asked/said: ${clip(m.content, 160)}`);
  }
  let card = "Known facts from earlier in this same conversation (do not re-ask; keep continuity):\n" + lines.join("\n");
  if (card.length > FACT_CARD_MAX_CHARS) card = card.slice(0, FACT_CARD_MAX_CHARS - 1) + "…";
  return card;
}

function slimRecent(recent, keepLastDraft) {
  let lastAsst = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].role === "assistant") {
      lastAsst = i;
      break;
    }
  }
  const lastCap = keepLastDraft ? LAST_DRAFT_CHARS : 800;
  return recent.map((m, i) => {
    if (m.role === "user") return { ...m, content: m.content.slice(0, HISTORY_MSG_CHARS) };
    if (i === lastAsst) return { ...m, content: m.content.slice(0, lastCap) };
    return { ...m, content: clip(m.content, 120) };
  });
}

function windowTranscript(messages, keepLastDraft) {
  const raw = (messages || []).map((m) => ({
    role: m.role === "assistant" || m.role === "ai" ? "assistant" : "user",
    content: String(m.content || m.transcript || ""),
  }));
  if (raw.length <= FULL_HISTORY_UNTIL) {
    return { transcript: slimRecent(raw, keepLastDraft), history_dropped: 0, fact_card: "" };
  }
  const dropped = raw.length - HISTORY_MAX_MESSAGES;
  const older = raw.slice(0, dropped);
  const recent = slimRecent(raw.slice(-HISTORY_MAX_MESSAGES), keepLastDraft);
  return {
    transcript: recent,
    history_dropped: dropped,
    fact_card: buildFactCard(older),
  };
}

function approxTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

const welcomeCache = new Map();
const welcomeInflight = new Map();

function welcomeCacheKey(chatbotKey, locale, model, compiled) {
  let h = 2166136261;
  for (let i = 0; i < compiled.length; i += 97) h = Math.imul(h ^ compiled.charCodeAt(i), 16777619);
  h = Math.imul(h ^ compiled.length, 16777619);
  return `${chatbotKey}|${locale}|${model}|${compiled.length}|${h >>> 0}`;
}

function welcomeOnly(store, chatbotKey, locale) {
  const welcome = store.data.modules.find(
    (m) => m.chatbot_key === chatbotKey && m.prompt_locale === locale && (m.module_key === "welcome_message" || m.module_key === "welcome")
  );
  if (!welcome) return null;
  const body = welcome.content
    .replace(/<aside>[\s\S]*?<\/aside>/g, "")
    .replace(/^#.*$/gm, "")
    .replace(/^>.*$/gm, "")
    .trim();
  return body.slice(0, 2500);
}

function mockReply(store, chatbotKey, locale, compiled, messages, mode) {
  if (mode === "initial") {
    return (
      welcomeOnly(store, chatbotKey, locale) ||
      "Hi, I'm Kael 👋\n\n.\n\nSet CURSOR_API_KEY in backend/.env for live Prompt Testing."
    );
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return [
    "I can keep going once a live model is connected.",
    ".",
    lastUser?.content ? `(You said: ${lastUser.content.slice(0, 200)})` : "",
    ".",
    "Live generation failed. Check the API terminal for the Cursor SDK error.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function callAnthropic(model, system, messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.replace("claude-sonnet-5", "claude-sonnet-4-5"),
      max_tokens: 8192,
      system,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const json = await res.json();
  return json.content?.map((c) => c.text).join("\n") || "";
}

async function callOpenAI(model, system, messages) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const mapped = model.startsWith("gpt-5.6") ? "gpt-4.1" : model === "gpt-5.5" ? "gpt-4.1" : model;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: mapped,
      messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

export async function generateReply({ store, chatbotKey, locale, model, messages, mode }) {
  const compile_stage = inferCompileStage(mode, messages);
  const { compiled } = compilePrompt(store, chatbotKey, locale, mode, compile_stage, messages);
  const keepLastDraft = compile_stage === "draft" || compile_stage === "completion";
  const { transcript, history_dropped, fact_card } = windowTranscript(messages, keepLastDraft);
  const packedSystem = fact_card ? `${compiled}\n\n${fact_card}` : compiled;
  const provider = (store.data.models.find((m) => m.value === model) || {}).provider;
  const started = Date.now();
  const wKey = mode === "initial" ? welcomeCacheKey(chatbotKey, locale, model, compiled) : null;

  const cachedPayload = (cached, cache) => ({
    text: cached.text,
    input_tokens: cached.input_tokens || 0,
    output_tokens: cached.output_tokens || approxTokens(cached.text),
    response_ms: Date.now() - started,
    compiled_chars: compiled.length,
    debug: {
      cache,
      compiled_chars: compiled.length,
      compile_stage,
      history_dropped,
      fact_card_chars: fact_card?.length || 0,
      wall_ms: Date.now() - started,
    },
  });

  if (wKey && welcomeCache.has(wKey)) {
    console.log(`[PromptTesting] welcome cache HIT bot=${chatbotKey} locale=${locale} compiled=${compiled.length} chars`);
    return cachedPayload(welcomeCache.get(wKey), "hit");
  }
  if (wKey && welcomeInflight.has(wKey)) {
    const shared = await welcomeInflight.get(wKey);
    console.log(`[PromptTesting] welcome cache COALESCE bot=${chatbotKey} locale=${locale}`);
    return cachedPayload(
      { text: shared.text, input_tokens: shared.input_tokens, output_tokens: shared.output_tokens },
      "hit"
    );
  }

  const run = (async () => {
    let text;
    let usage = {};
    try {
      if (cursorEnabled() && process.env.LLM_BACKEND !== "direct") {
        const cursor = await callCursor({ compiled, messages: transcript, model, mode, factCard: fact_card });
        if (cursor?.text) {
          text = cursor.text;
          usage = cursor;
        }
      }
      if (!text && provider === "anthropic") text = await callAnthropic(model, packedSystem, transcript);
      else if (!text && provider === "openai") text = await callOpenAI(model, packedSystem, transcript);
    } catch (err) {
      console.error("LLM call failed:", err.message);
      text = null;
    }
    if (!text) text = mockReply(store, chatbotKey, locale, compiled, transcript, mode);
    const inputTokens = usage.input_tokens || approxTokens(packedSystem + transcript.map((m) => m.content).join("\n"));
    const outputTokens = usage.output_tokens || approxTokens(text);
    const payload = {
      text,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      response_ms: Date.now() - started,
      compiled_chars: compiled.length,
      debug: {
        used_cursor: Boolean(usage.cursor_model),
        wall_ms: Date.now() - started,
        compiled_chars: compiled.length,
        compile_stage,
        history_dropped,
        fact_card_chars: fact_card?.length || 0,
        cache: wKey ? "store" : "skip",
        ...(usage.debug || {}),
      },
    };
    if (wKey && text) {
      welcomeCache.set(wKey, { text, input_tokens: inputTokens, output_tokens: outputTokens });
      console.log(`[PromptTesting] welcome cache STORE bot=${chatbotKey} locale=${locale} compiled=${compiled.length} chars`);
    }
    console.log(
      `[PromptTesting] compile_stage=${compile_stage} compiled=${compiled.length} chars history=${transcript.length} dropped=${history_dropped} fact_card=${fact_card?.length || 0}`
    );
    return payload;
  })();

  if (wKey) {
    welcomeInflight.set(wKey, run);
    try {
      return await run;
    } finally {
      welcomeInflight.delete(wKey);
    }
  }
  return run;
}

export async function improvePrompt(store, { chatbotKey, locale, model, moduleContent, feedback }) {
  const { compiled } = compilePrompt(store, chatbotKey, locale);
  if (cursorEnabled()) {
    const cursor = await callCursor({
      compiled,
      model,
      mode: "user",
      messages: [
        {
          role: "user",
          content: `AI Improve. Current draft:\n${moduleContent || ""}\n\nAdmin feedback: ${feedback}\n\nReturn only improved student-visible copy or the revised module text.`,
        },
      ],
    });
    if (cursor?.text) return cursor.text;
  }
  return `Could not reach Cursor for AI Improve. Feedback was: ${feedback}`;
}
