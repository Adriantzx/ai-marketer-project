import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { createStore } from "./store.js";
import { compilePrompt, generateReply, improvePrompt } from "./llm.js";
import { recordPromptTest } from "./promptTestingMetrics.js";

const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const store = createStore();
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "4mb" }));

function signUser(user) {
  return jwt.sign({ email: user.email, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: "2h" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const row = store.data.users.find((u) => u.email === req.user.email && u.is_active);
    if (!row) return res.status(401).json({ error: "unauthorizedGoogle" });
    req.user.is_admin = row.is_admin;
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: "admin_only" });
  next();
}

function findUser(email) {
  return store.data.users.find((u) => u.email === String(email || "").toLowerCase());
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/chatbots", auth, (_req, res) => {
  res.json({
    chatbots: store.data.chatbots.map((c) => ({
      key: c.key,
      name: c.name,
      availability: c.availability || "available",
    })),
  });
});

app.post("/api/auth/otp/request", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = findUser(email);
  if (!user || !user.is_active) {
    return res.status(403).json({ error: "unauthorizedGoogle" });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  store.data.otps = store.data.otps.filter((o) => o.email !== email);
  store.data.otps.push({ email, code, expires: Date.now() + 10 * 60 * 1000 });
  store.persist();
  console.log(`OTP for ${email}: ${code}`);
  res.json({
    ok: true,
    // Local rebuild: expose OTP so email provider is not required. Production must not do this.
    ...(process.env.DEV_EXPOSE_OTP === "true" ? { dev_otp: code } : {}),
  });
});

app.post("/api/auth/otp/verify", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "").trim();
  const user = findUser(email);
  if (!user || !user.is_active) return res.status(403).json({ error: "unauthorizedGoogle" });
  const otp = store.data.otps.find((o) => o.email === email && o.code === code && o.expires > Date.now());
  if (!otp) return res.status(400).json({ error: "invalid_otp" });
  store.data.otps = store.data.otps.filter((o) => o.email !== email);
  store.persist();
  res.json({ token: signUser(user), user: { email: user.email, is_admin: user.is_admin } });
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = findUser(req.user.email);
  res.json({ email: user.email, is_admin: user.is_admin });
});

app.post("/api/check-google-access", auth, (req, res) => {
  const user = findUser(req.user.email);
  res.json({ allowed: true, is_admin: user.is_admin, email: user.email });
});

app.post("/api/manage-google-whitelist", auth, adminOnly, (req, res) => {
  const action = req.body.action;
  if (action === "list") {
    return res.json({ users: store.data.users });
  }
  if (action === "upsert") {
    const email = String(req.body.email || "").trim().toLowerCase();
    const is_admin = !!req.body.is_admin;
    if (!email.includes("@")) return res.status(400).json({ error: "invalid_email" });
    const existing = findUser(email);
    if (existing) {
      existing.is_active = true;
      existing.is_admin = is_admin || existing.is_admin;
    } else {
      store.data.users.push({ email, is_admin, is_active: true, created_at: store.now() });
    }
    store.persist();
    return res.json({ ok: true, users: store.data.users });
  }
  if (action === "delete") {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (email === req.user.email) return res.status(400).json({ error: "cannot_delete_self" });
    store.data.users = store.data.users.filter((u) => u.email !== email);
    store.persist();
    return res.json({ ok: true, users: store.data.users });
  }
  return res.status(400).json({ error: "unknown_action" });
});

app.post("/api/manage-system-prompt", auth, adminOnly, (req, res) => {
  const { action } = req.body;
  if (action === "list") return res.json({ chatbots: store.data.chatbots });
  if (action === "models") return res.json({ models: store.data.models });
  if (action === "get") {
    const bot = store.data.chatbots.find((c) => c.key === req.body.chatbot_key);
    return res.json({ chatbot: bot || null });
  }
  if (action === "modules") {
    const rows = store.data.modules.filter(
      (m) => m.chatbot_key === req.body.chatbot_key && m.prompt_locale === (req.body.prompt_locale || "zh-MY")
    );
    return res.json({ modules: rows.sort((a, b) => a.sort_order - b.sort_order) });
  }
  if (action === "stages") {
    const rows = store.data.stages.filter(
      (s) => s.chatbot_key === req.body.chatbot_key && s.prompt_locale === (req.body.prompt_locale || "zh-MY")
    );
    return res.json({ stages: rows.sort((a, b) => a.sort_order - b.sort_order) });
  }
  if (action === "compiled_preview") {
    const { compiled, modules } = compilePrompt(
      store,
      req.body.chatbot_key,
      req.body.prompt_locale || "zh-MY",
      undefined,
      req.body.stage_key
    );
    const stage = req.body.stage_key;
    return res.json({ stage_key: stage, compiled, module_count: modules.length });
  }
  if (action === "module_history") {
    const rows = store.data.moduleHistory.filter(
      (h) => h.chatbot_key === req.body.chatbot_key && h.module_key === req.body.module_key && h.prompt_locale === req.body.prompt_locale
    );
    return res.json({ history: rows.slice(-20).reverse() });
  }
  if (action === "update_module") {
    const mod = store.data.modules.find(
      (m) =>
        m.chatbot_key === req.body.chatbot_key &&
        m.module_key === req.body.module_key &&
        m.prompt_locale === (req.body.prompt_locale || "zh-MY")
    );
    if (!mod) return res.status(404).json({ error: "module_not_found" });
    store.data.moduleHistory.push({
      id: uuid(),
      chatbot_key: mod.chatbot_key,
      module_key: mod.module_key,
      prompt_locale: mod.prompt_locale,
      content: mod.content,
      version: mod.version,
      saved_at: store.now(),
    });
    mod.content = req.body.content ?? mod.content;
    mod.version = (mod.version || 1) + 1;
    mod.updated_at = store.now();
    const bot = store.data.chatbots.find((c) => c.key === mod.chatbot_key);
    if (bot) bot.prompt_version = (bot.prompt_version || 1) + 1;
    store.persist();
    return res.json({ module: mod });
  }
  if (action === "update_metadata") {
    const bot = store.data.chatbots.find((c) => c.key === req.body.chatbot_key);
    if (!bot) return res.status(404).json({ error: "bot_not_found" });
    if (req.body.name) bot.name = req.body.name;
    if (req.body.model) bot.model = req.body.model;
    store.persist();
    return res.json({ chatbot: bot });
  }
  return res.status(400).json({ error: "unknown_action" });
});

app.post("/api/test-system-prompt", auth, adminOnly, async (req, res) => {
  req.setTimeout(180000);
  const action = req.body.action || "test";
  if (action === "improve") {
    const suggestion = await improvePrompt(store, req.body);
    return res.json({ suggestion });
  }
  const chatbotKey = req.body.chatbot_key;
  const locale = req.body.prompt_locale || "zh-MY";
  const bot = store.data.chatbots.find((c) => c.key === chatbotKey);
  const model = req.body.model || bot?.model;
  const messages = req.body.messages || [];
  const mode = messages.length === 0 ? "initial" : "user";
  if (req.body.module_key && req.body.module_content) {
    const mod = store.data.modules.find(
      (m) => m.chatbot_key === chatbotKey && m.module_key === req.body.module_key && m.prompt_locale === locale
    );
    if (mod) mod._draft = req.body.module_content;
  }
  const result = await generateReply({ store, chatbotKey, locale, model, messages, mode });
  const d = result.debug || {};
  console.log(
    `[PromptTesting] ${action} mode=${mode} bot=${chatbotKey} generate=${result.response_ms}ms prompt=${d.prompt_wall_ms ?? "n/a"}ms compiled=${result.compiled_chars} chars in=${result.input_tokens} out=${result.output_tokens}`
  );
  const metrics = recordPromptTest({ bot, chatbotKey, locale, model, mode, messages, result });
  res.json({
    message: { role: "assistant", content: result.text },
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    response_ms: result.response_ms,
    debug: result.debug || null,
    metrics,
  });
});

app.post("/api/create-conversation", auth, (req, res) => {
  const chatbot_key = req.body.chatbot_key;
  const prompt_locale = req.body.prompt_locale || (req.body.ui_lang === "en" ? "en-MY" : "zh-MY");
  const bot = store.data.chatbots.find((c) => c.key === chatbot_key);
  if (!bot) return res.status(400).json({ error: "unknown_bot" });
  const stage = store.data.stages.find((s) => s.chatbot_key === chatbot_key && s.prompt_locale === prompt_locale && s.is_initial);
  const conv = {
    id: uuid(),
    user_email: req.user.email,
    chatbot_key,
    prompt_locale,
    location_id: req.body.location_id || "local",
    title: prompt_locale.startsWith("zh") ? "新对话" : "New Chat",
    stage: stage?.stage_key || "welcome",
    status: "active",
    insight_score: 0,
    created_at: store.now(),
    updated_at: store.now(),
  };
  store.data.conversations.push(conv);
  store.persist();
  res.json({ conversation: conv });
});

app.post("/api/generate-ai-response", auth, async (req, res) => {
  req.setTimeout(180000);
  if (req.body.async_action === "status") {
    const job = store.data.jobs.find((j) => j.id === req.body.job_id);
    return res.json({ job });
  }
  const conv = store.data.conversations.find((c) => c.id === req.body.conversation_id && c.user_email === req.user.email);
  if (!conv) return res.status(404).json({ error: "conversation_not_found" });
  const messages = req.body.messages || store.data.messages.filter((m) => m.conversation_id === conv.id);
  const userText = req.body.content;
  const mode = req.body.mode || (userText ? "user" : "initial");
  if (userText) {
    store.data.messages.push({
      id: uuid(),
      conversation_id: conv.id,
      role: "user",
      content: userText,
      created_at: store.now(),
    });
    messages.push({ role: "user", content: userText });
  }
  const bot = store.data.chatbots.find((c) => c.key === conv.chatbot_key);
  const result = await generateReply({
    store,
    chatbotKey: conv.chatbot_key,
    locale: conv.prompt_locale,
    model: bot.model,
    messages,
    mode,
  });
  const aiMsg = {
    id: uuid(),
    conversation_id: conv.id,
    role: "assistant",
    content: result.text,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    response_ms: result.response_ms,
    created_at: store.now(),
  };
  store.data.messages.push(aiMsg);
  conv.updated_at = store.now();
  store.persist();
  res.json({ message: aiMsg, conversation: conv });
});

app.post("/api/rename-conversation", auth, (req, res) => {
  const conv = store.data.conversations.find((c) => c.id === req.body.conversation_id && c.user_email === req.user.email);
  if (!conv) return res.status(404).json({ error: "not_found" });
  conv.title = String(req.body.title || "").slice(0, 60);
  conv.updated_at = store.now();
  store.persist();
  res.json({ conversation: conv });
});

app.post("/api/update-conversation-status", auth, (req, res) => {
  const conv = store.data.conversations.find((c) => c.id === req.body.conversation_id && c.user_email === req.user.email);
  if (!conv) return res.status(404).json({ error: "not_found" });
  conv.status = req.body.status || conv.status;
  conv.updated_at = store.now();
  store.persist();
  res.json({ conversation: conv });
});

app.get("/api/conversations", auth, (req, res) => {
  const rows = store.data.conversations
    .filter((c) => c.user_email === req.user.email)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  res.json({ conversations: rows });
});

app.get("/api/conversations/:id/messages", auth, (req, res) => {
  const conv = store.data.conversations.find((c) => c.id === req.params.id && c.user_email === req.user.email);
  if (!conv) return res.status(404).json({ error: "not_found" });
  res.json({
    conversation: conv,
    messages: store.data.messages.filter((m) => m.conversation_id === conv.id),
  });
});

app.post("/api/admin-report-analysis", auth, adminOnly, (req, res) => {
  const from = new Date(req.body.date_from || Date.now() - 30 * 86400000);
  const to = new Date(req.body.date_to || Date.now());
  const chatbotKey = req.body.chatbot_key || null;
  let convs = store.data.conversations.filter((c) => {
    const t = new Date(c.updated_at);
    return t >= from && t <= to && (!chatbotKey || c.chatbot_key === chatbotKey);
  });
  const convIds = new Set(convs.map((c) => c.id));
  let msgs = store.data.messages.filter((m) => convIds.has(m.conversation_id));
  const ai = msgs.filter((m) => m.role === "assistant");
  const uniqueUsers = new Set(convs.map((c) => c.user_email)).size;
  const overview = {
    conversations: convs.length,
    unique_users: uniqueUsers,
    messages: msgs.length,
    active_conversations: convs.filter((c) => c.status === "active").length,
    average_insight_score: convs.length ? Math.round(convs.reduce((s, c) => s + (c.insight_score || 0), 0) / convs.length) : 0,
    tracked_ai_responses: ai.length,
    input_tokens: ai.reduce((s, m) => s + (m.input_tokens || 0), 0),
    output_tokens: ai.reduce((s, m) => s + (m.output_tokens || 0), 0),
    average_response_ms: ai.length ? Math.round(ai.reduce((s, m) => s + (m.response_ms || 0), 0) / ai.length) : 0,
    identity_guard_hits: 0,
  };
  const stageMap = {};
  const statusMap = {};
  for (const c of convs) {
    stageMap[c.stage] = (stageMap[c.stage] || 0) + 1;
    statusMap[c.status] = (statusMap[c.status] || 0) + 1;
  }
  const chatbot_performance = store.data.chatbots.map((bot) => {
    const bconvs = convs.filter((c) => c.chatbot_key === bot.key);
    const ids = new Set(bconvs.map((c) => c.id));
    const bmsgs = msgs.filter((m) => ids.has(m.conversation_id));
    const bai = bmsgs.filter((m) => m.role === "assistant");
    return {
      chatbot_key: bot.key,
      name: bot.name,
      model: bot.model,
      prompt_version: bot.prompt_version || 1,
      conversations: bconvs.length,
      messages: bmsgs.length,
      avg_insight: bconvs.length ? Math.round((bconvs.reduce((s, c) => s + (c.insight_score || 0), 0) / bconvs.length) * 10) / 10 : 0,
      ai_replies: bai.length,
      input_tokens: bai.reduce((s, m) => s + (m.input_tokens || 0), 0),
      output_tokens: bai.reduce((s, m) => s + (m.output_tokens || 0), 0),
      avg_ms: bai.length ? Math.round(bai.reduce((s, m) => s + (m.response_ms || 0), 0) / bai.length) : 0,
    };
  });
  const gmail = {};
  for (const c of convs) {
    gmail[c.user_email] ||= { email: c.user_email, conversations: 0, messages: 0, last_active: c.updated_at };
    gmail[c.user_email].conversations += 1;
    if (c.updated_at > gmail[c.user_email].last_active) gmail[c.user_email].last_active = c.updated_at;
  }
  for (const m of msgs) {
    const c = convs.find((x) => x.id === m.conversation_id);
    if (c && gmail[c.user_email]) gmail[c.user_email].messages += 1;
  }
  const gmail_activity = Object.values(gmail).sort((a, b) => b.messages - a.messages);
  const recent = convs
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 20)
    .map((c) => ({
      ...c,
      chatbot_name: store.data.chatbots.find((b) => b.key === c.chatbot_key)?.name,
      message_count: store.data.messages.filter((m) => m.conversation_id === c.id).length,
    }));
  if (req.body.action === "conversation_detail") {
    const c = store.data.conversations.find((x) => x.id === req.body.conversation_id);
    return res.json({
      conversation: c,
      messages: store.data.messages.filter((m) => m.conversation_id === req.body.conversation_id),
    });
  }
  res.json({
    generated_at: store.now(),
    date_from: from.toISOString(),
    date_to: to.toISOString(),
    overview,
    stage_distribution: Object.entries(stageMap).map(([key, count]) => ({ key, count })),
    status_distribution: Object.entries(statusMap).map(([key, count]) => ({ key, count })),
    chatbot_performance,
    gmail_activity,
    recent_conversations: recent,
    data_notes: { runtime_metrics_are_partial: false },
  });
});

app.listen(PORT, () => {
  console.log(`AI Marketer API on http://localhost:${PORT}`);
});
