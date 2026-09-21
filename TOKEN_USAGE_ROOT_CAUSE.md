# Excessive LLM token usage — root cause and mitigation

**Product:** Coach Joanne AI Marketer ([https://ai.coachjoannek.com/](https://ai.coachjoannek.com/))  
**Scope:** All student/admin chatbots that call a large language model  
**Date of analysis:** 19 September 2026  
**Status:** Analysis only. No production changes were made as part of this investigation.

---

## 1. Symptom

Admin Report Analysis showed **abnormally high input and output token** consumption for **every chatbot / LLM**, not only one model.

Typical 30-day operational picture (all chatbots, 20 Aug–19 Sep 2026):

| Metric | Value |
| --- | --- |
| Input tokens | 6,708,943 |
| Output tokens | 699,757 |
| Tracked AI responses | 521 |
| Avg input per AI reply | ~12,900 |
| Avg output per AI reply | ~1,300 |
| Input : output ratio | ~9.6 : 1 |

Copy bot (高 ROAS 广告 - 文案 / `ai_chatbot`) accounted for **~88% of input tokens** (5.89M in / 0.57M out, 443 replies). The other three bots used the same generation pipeline, so they also look expensive, at lower volume.

---

## 2. How tokens are billed

Each LLM call is billed as:

- **Input tokens:** everything sent **into** the model (compiled system prompt + chat history + current user turn + any fetched materials).
- **Output tokens:** the **model-written reply** (Kael’s text, including possible rewrites).

The student’s latest question is only a small part of input. Tokens are **not** “one token per chat bubble.”

Models in use at the time of analysis:

| Chatbot | Key | Model |
| --- | --- | --- |
| 高 ROAS 广告 - 文案 | `ai_chatbot` | `claude-sonnet-5` (Anthropic) |
| 高效率养 Leads - 内容 | `lead_nurture_chatbot` | `claude-sonnet-5` |
| 高 ROAS 广告 - 单图 | `image_chatbot` | `gpt-5.6-sol` (OpenAI) |
| 高效率养 Leads - 单图 | `lead_nurture_image_chatbot` | `gpt-5.6-sol` |

Selectable but not assigned on those four bots: `gpt-5.5`, `gpt-5.6-terra`, `gpt-5.6-luna`.

Student replies go through Supabase function **`generate-ai-response`**. Admin Prompt Testing uses **`test-system-prompt`**. Switching Claude vs GPT does **not** change the token architecture.

---

## 3. Root cause

**Each reply is a full LLM call that includes a large compiled system prompt plus the entire conversation so far**, not just the latest student message. Draft/copy turns can also inject websites/docs/reviews and auto-rewrite (Hidden Review), which spikes both input and output.

This is **real LLM spend**, not primarily a broken report counter. Report “Total Messages = 1,000” looks capped; **per-reply `input_tokens` / `output_tokens` on conversation messages still match this architecture.**

---

## 4. Evidence

### 4.1 Client always sends the full transcript

The frontend builds `generate-ai-response` with:

- `messages`: **every** prior user/AI message (content, transcript, attachments)
- `respond_async: true` (job + poll)
- extra modes: `initial` (welcome), `handoff_resume`, plus user turns
- retries on 429/502/503/504 with the **same full payload**

Polling `async_action: "status"` exists. On a sampled thread, there was **one metered AI row per reply**, so status polls are probably **not** the main double-bill. The dominant cost is **one large generation per student turn**.

### 4.2 System prompts are very large

Module body size (approx. tokens ≈ characters / 4):

| Bot | Locale | Modules | Characters | ~Tokens if fully compiled |
| --- | --- | --- | --- | --- |
| 高 ROAS 广告 - 文案 | zh-MY | 13 | 27,689 | ~6,900 |
| 高 ROAS 广告 - 文案 | **en-MY** | 13 | **60,159** | **~15,000** |
| 高效率养 Leads - 内容 | zh-MY | 6 | 10,960 | ~2,700 |
| 高 ROAS 广告 - 单图 | zh-MY | 8 | 6,231 | ~1,600 |

English copy modules are **more than 2×** the Chinese corpus. Anyone on English UI will look “abnormally” expensive for the same behaviour.

Copy workflow stages include welcome, discovery, draft, completion, revision, image_handoff. **Discovery should not need the full ADDA + image-handoff corpus**, but the live meters show input growing far beyond a short user sentence.

### 4.3 History is replayed every turn (quadratic growth)

Sample conversation: **REDFORES CW1 文案** (`claude-sonnet-5`, 49 messages, 25 AI replies):

| Measure | Value |
| --- | --- |
| Sum of metered input tokens | 218,132 |
| Sum of metered output tokens | 40,900 |
| Avg input per AI reply | 8,725 |
| Avg output per AI reply | 1,636 |
| Min → max input on AI turns | 1,066 → 18,228 (spike 27,195) |

Input **rose almost every user turn**. Chat text billed **once** was ~5k tokens; if **full history is resent each turn**, the same text becomes ~**103k** tokens of history *before* the system prompt.

Welcome started smaller (~2.3k input). Later Discovery turns climbed through 4k–15k. Two draft-like turns:

- **27,195 input / 5,044 output / ~60s**
- **19,629 input / 7,917 output / ~95s**

Those spikes match **stage compile + fetched materials + long generation / Hidden Review rewrite**, not a 20-word student question.

### 4.4 Extra LLM calls besides “the user asked something”

- New chat **`initial`** welcome is generated by the LLM.
- **`handoff_resume`** is another generation.
- Copy **Hidden Review** instructs the model to **rewrite automatically** if the checklist fails (second full generation).
- Website/PDF/review extraction is written into the prompt as **raw or near-raw material**.

### 4.5 Why every model looks bad

Same `generate-ai-response` path for Anthropic and OpenAI. Image bots have smaller modules but still send **full history** (and can attach visual context). Lead-nurture bots sit in between.

30-day chatbot split:

| Chatbot | Tracked AI replies | Input tokens | Output tokens |
| --- | --- | --- | --- |
| 高 ROAS 广告 - 文案 | 443 | 5,888,239 | 569,882 |
| 高效率养 Leads - 内容 | 38 | 420,467 | 39,280 |
| 高效率养 Leads - 单图 | 29 | 285,326 | 63,188 |
| 高 ROAS 广告 - 单图 | 11 | 114,911 | 27,407 |

---

## 5. What is *not* the main cause

- **Wrong LLM choice as the sole issue.** All models inherit the same payload shape.
- **Report-only inflation as the sole issue.** Conversation-level `input_tokens` / `output_tokens` confirm large real calls.
- **Status polling as the main double-count.** One stored AI message per reply in the sampled thread.
- **“User question tokens only.”** The user turn is a minority of input.

YTD vs 30-day token totals can look inconsistent because **runtime metrics started 12 July 2026** and wider ranges are marked **partial**.

---

## 6. Solutions (fix / mitigate / optimize)

Do **not** expect long ad copy to become free. A full ADDA draft will still cost hundreds to thousands of **output** tokens. The goal is to stop paying **~13k input per Discovery ping**.

Work belongs in **`generate-ai-response` + prompt compilation**, not only the Report Analysis UI.

### 6.1 Highest impact

| Priority | Change | Effect |
| --- | --- | --- |
| 1 | **Prompt caching** (Anthropic prompt cache / OpenAI cached input) for the stable system prompt | Cuts **cost** of repeated modules every turn |
| 2 | **Stage-only compile** — Discovery omits ADDA + image handoff; draft omits unused stages | Cuts **input tokens** immediately |
| 3 | **History window or rolling summary** — last N turns, not the full `messages` array (server can load from DB instead of the client replaying everything) | Stops input growing without bound |
| 4 | **Do not dump raw websites/docs into the prompt** — extract a short fact card (numbers, quotes, USPs) | Removes 20k–27k **input spikes** |
| 5 | **Hidden Review** — cap rewrites (e.g. 1), use a small model, or checklist-only; do not auto-regenerate an 8k-output draft by default | Cuts **output** and a second **input** |

### 6.2 Additional mitigations

- Welcome / simple handoff: **templates or a cheaper model**, not the flagship copy model.
- Retries: only regenerate if the **first** completion actually failed; status polls must never start a new completion.
- **Trim en-MY modules** so English is not 2× Chinese for the same rules.
- Attachments: send **extracted text**, not whole files, unless the model API requires multimodal input.
- Product: encourage **new chats per CW** so one thread does not accumulate 50+ turns of replay.

### 6.3 What “appropriate” could look like

| Turn type | Today (observed) | Target after 6.1 |
| --- | --- | --- |
| Welcome | ~2k in | Template or cached short prompt |
| Discovery Q&A | Rising 1k → 15k+ in | A few thousand in + short out |
| Draft / rewrite | 20k–27k in, 5k–8k out | Prompt + fact card + recent turns; one draft, optional one rewrite |
| Image brief | ~10k in / call | Stage prompt + brief only |

Prompt caching (6.1.1) mainly reduces **vendor cost**; reported token **counts** may stay similar unless the provider reports cached tokens separately. Stage compile + history cap change the **counts**.

### 6.4 Verification

After a change, compare Report Analysis (same date range, all chatbots) and **per-message** `input_tokens` on a long copy thread:

- Discovery turns should **not** climb into the mid-teens of thousands from history replay alone.
- Draft should **not** routinely exceed ~20k input unless materials were intentionally attached.
- Tracked AI replies per student question should stay near **1** (plus at most one controlled rewrite).

---

## 7. Implementation note

This investigation used the live site and admin APIs. The Git/source repo was **not** present in the local workspace, so the mitigations above were **not implemented**. Apply them in the backend function that compiles prompts and calls the LLM, then in the client if it currently uploads the full transcript on every turn.

---

## 8. Related report caveats

- Default Report Analysis window is **last 30 days**, all chatbots.
- **Messages = 1,000** may be a query cap; do not use it as ground truth for volume.
- **Recent conversations** often show `message_count: 0` even when the thread has messages — a separate reporting bug.
- Almost all conversations were tagged `stage: insight` / `status: active` — stage reporting may not match the six compile stages.
