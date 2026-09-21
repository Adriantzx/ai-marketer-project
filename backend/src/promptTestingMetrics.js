import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metricsDir = path.join(__dirname, "..", "data", "metrics");
const jsonlPath = path.join(metricsDir, "prompt-testing.jsonl");
const summaryPath = path.join(metricsDir, "prompt-testing-summary.json");

let currentThread = null;

function emptyBotStats(bot) {
  return {
    chatbot_key: bot?.key || "",
    chatbot_name: bot?.name || "",
    current_model: bot?.model || "",
    latest_prompt_version: bot?.prompt_version || 1,
    total_conversations: 0,
    total_messages: 0,
    insight_score: null,
    tracked_ai_responses: 0,
    tokens_in: 0,
    tokens_out: 0,
    billed_tokens_in: 0,
    billed_tokens_out: 0,
    response_ms_sum: 0,
    avg_response_time_ms: 0,
  };
}

function loadSummary() {
  if (!fs.existsSync(summaryPath)) {
    return { updated_at: null, overall: emptyBotStats({}), by_chatbot: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  } catch {
    return { updated_at: null, overall: emptyBotStats({}), by_chatbot: {} };
  }
}

function applyTurn(stats, { llmCalled, billedIn, billedOut, reportedIn, reportedOut, ms, isNewConversation, addedMessages }) {
  if (isNewConversation) stats.total_conversations += 1;
  stats.total_messages += addedMessages;
  if (llmCalled) {
    stats.tracked_ai_responses += 1;
    stats.billed_tokens_in += billedIn;
    stats.billed_tokens_out += billedOut;
    stats.response_ms_sum += ms;
    stats.avg_response_time_ms = stats.tracked_ai_responses
      ? Math.round(stats.response_ms_sum / stats.tracked_ai_responses)
      : 0;
  }
  stats.tokens_in += reportedIn;
  stats.tokens_out += reportedOut;
  stats.insight_score = null;
}

export function recordPromptTest({ bot, chatbotKey, locale, model, mode, messages, result }) {
  fs.mkdirSync(metricsDir, { recursive: true });
  const debug = result.debug || {};
  const cache = debug.cache || "skip";
  const llmCalled = cache !== "hit";
  const reportedIn = result.input_tokens || 0;
  const reportedOut = result.output_tokens || 0;
  const billedIn = llmCalled ? reportedIn : 0;
  const billedOut = llmCalled ? reportedOut : 0;
  const ms = result.response_ms || 0;
  const isNewConversation = mode === "initial" && llmCalled;
  const addedMessages = mode === "initial" ? (llmCalled ? 1 : 0) : 2;
  const messagesAfter = mode === "initial" ? 1 : (messages?.length || 0) + 1;

  if (mode === "initial" || !currentThread) {
    currentThread = { id: uuid(), chatbot_key: chatbotKey, prompt_locale: locale, message_index: 0 };
  }
  currentThread.message_index += 1;

  const summary = loadSummary();
  const key = chatbotKey || "unknown";
  if (!summary.by_chatbot[key]) summary.by_chatbot[key] = emptyBotStats(bot);
  const botStats = summary.by_chatbot[key];
  botStats.chatbot_key = key;
  botStats.chatbot_name = bot?.name || key;
  botStats.current_model = model || bot?.model || "";
  botStats.latest_prompt_version = bot?.prompt_version || 1;

  applyTurn(botStats, {
    llmCalled,
    billedIn,
    billedOut,
    reportedIn,
    reportedOut,
    ms,
    isNewConversation,
    addedMessages,
  });
  if (!summary.overall.chatbot_name) summary.overall.chatbot_name = "all";
  applyTurn(summary.overall, {
    llmCalled,
    billedIn,
    billedOut,
    reportedIn,
    reportedOut,
    ms,
    isNewConversation,
    addedMessages,
  });
  summary.overall.current_model = "";
  summary.overall.latest_prompt_version = "";
  summary.updated_at = new Date().toISOString();

  const row = {
    ts: summary.updated_at,
    interaction: mode === "initial" ? "welcome" : "user",
    chatbot_name: bot?.name || key,
    chatbot_key: key,
    current_model: model || bot?.model || "",
    latest_prompt_version: bot?.prompt_version || 1,
    prompt_locale: locale,
    test_thread_id: currentThread.id,
    message_index: currentThread.message_index,
    mode,
    cache,
    compile_stage: debug.compile_stage || null,
    history_dropped: debug.history_dropped || 0,
    fact_card_chars: debug.fact_card_chars || 0,
    compiled_chars: result.compiled_chars || 0,
    llm_called: llmCalled,
    turn_input_tokens: reportedIn,
    turn_output_tokens: reportedOut,
    billed_input_tokens: billedIn,
    billed_output_tokens: billedOut,
    response_ms: ms,
    insight_score: null,
    total_conversations: botStats.total_conversations,
    total_messages: botStats.total_messages,
    thread_messages: messagesAfter,
    tracked_ai_responses: botStats.tracked_ai_responses,
    tokens_in: botStats.billed_tokens_in,
    tokens_out: botStats.billed_tokens_out,
    avg_response_time_ms: botStats.avg_response_time_ms,
  };

  fs.appendFileSync(jsonlPath, JSON.stringify(row) + "\n");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(
    `[PromptTesting][metrics] ${row.interaction} stage=${row.compile_stage} llm=${llmCalled} cache=${cache} in=${reportedIn} out=${reportedOut} billed_in=${billedIn} compiled=${row.compiled_chars} file=${jsonlPath}`
  );
  return row;
}
