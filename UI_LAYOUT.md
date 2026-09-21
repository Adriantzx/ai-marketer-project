# Joanne AI Admin — UI layout reference

**Source:** live [https://ai.coachjoannek.com/](https://ai.coachjoannek.com/) captured 20 September 2026.  
**Purpose:** reuse this **same shell and page layouts** for a rebuild or restyle. Behaviour is in [FUNCTIONAL_REQUIREMENTS_AND_SPEC.md](FUNCTIONAL_REQUIREMENTS_AND_SPEC.md); this file is **visual structure only**.

**Screenshots (canonical):**

| Screen | File |
| --- | --- |
| Gmail Access | [ui-reference/gmail-access.png](ui-reference/gmail-access.png) |
| AI Prompt Management | [ui-reference/ai-prompt-management.png](ui-reference/ai-prompt-management.png) |
| Prompt Testing | [ui-reference/prompt-testing.png](ui-reference/prompt-testing.png) |
| Report Analysis | [ui-reference/report-analysis.png](ui-reference/report-analysis.png) |

Stack cue from production: **Ant Design** `Layout` (Header + Sider + Content), `Table`, `Card`, `Select`, `Input`, `Button`, `Tag`, `Statistic`. Theme tokens used in the client: `colorPrimary: #1f2937`; selected menu `itemSelectedColor: #d97706`, `itemSelectedBg: #fffbeb`.

---

## 1. Shared admin chrome (all four pages)

Keep this frame identical on every Joanne AI Admin route.

```
+------------------------------------------------------------------+
| HEADER (~64px, white, bottom border)                             |
| [K. logo] Joanne AI Admin          [English v] [avatar] [Logout] |
+--------+---------------------------------------------------------+
| SIDER  | CONTENT (white card area, padded)                       |
| ~200px |                                                         |
| white  |  Page title + page-specific body                        |
|        |                                                         |
+--------+---------------------------------------------------------+
```

### Header (left → right)

- Far left: small **K.** wordmark (Coaching With K.) + title **Joanne AI Admin**
- Far right cluster: **English** (or Chinese) dropdown → orange circular **avatar** with initial + truncated email (`adriantzx251…`) → **Logout** with exit icon
- No extra toolbar in the header besides language + identity + logout

### Left sider

- Vertical nav, four items, **top-aligned**, no icons:
  1. Gmail Access
  2. AI Prompt
  3. Prompt Testing
  4. Report Analysis
- **Selected item:** amber/gold text (`#d97706`) on cream/yellow background (`#fffbeb`), full sider width
- Unselected: dark gray text on white
- Sider is a **light column**; content is a **white panel** to the right with generous padding

### Global rules

- Background of the app shell: very light gray behind the content card
- Primary actions: **black / gray-900 filled buttons** (`#1f2937`), white label (Save Bot Info, Save Current Module, New Test Chat, Refresh)
- Destructive text: **red** `DELETE`
- Tags: Admin = **gold/amber outline**; Student = **gray outline**
- Tables: light gray header row, hairline row borders, no heavy zebra
- Desktop-first; sider may overlay on small screens (existing CSS pins sider under the header)

---

## 2. Gmail Access

Match [ui-reference/gmail-access.png](ui-reference/gmail-access.png).

**Page title:** `Gmail Access` (H2, left)

**Toolbar (stacked, full width of content):**

1. Single-line input `Enter Google email...` with **Add** on the **same row, right** (short button, not full-width)
2. Below: `Search email...` with a **search icon button** on the right of that row

**Section 1:** heading `Admin Accounts (N)` then table:

| Checkbox | Email (flex grow, wrap) | Admin (tag) | Action (DELETE) |

**Section 2:** heading `Student Accounts (N)` then the **same columns**. Student tag instead of gold Admin tag.

- Row checkboxes for batch select
- Current user’s DELETE may be disabled (own account)
- No pagination in the screenshot; list scrolls in the page

---

## 3. AI Prompt Management

Match [ui-reference/ai-prompt-management.png](ui-reference/ai-prompt-management.png).

**Page title:** `AI Prompt Management`

**Top bar (one row):**

- Label **Select Chatbot** + dropdown (bot display name)
- Label **Chatbot Name** + text field
- Label **Model** + dropdown (e.g. Claude Sonnet 5)
- **Save Bot Info** — black button, **right-aligned** on the same row

**Main split (below): ~1/3 left, ~2/3 right** (stacks on mobile).

**Left card — Included Modules**

- Card title `Included Modules`
- Vertical list of selectable rows:
  - Title (e.g. 核心身份与最高原则)
  - Subline: type (`core` / `stage` / `output`) left, `v{n}` right
- **Selected module:** light gray fill + stronger border
- List scrolls if taller than the viewport

**Right column (stacked cards)**

1. **Editor card**
   - Title = selected module display name
   - Extra top-right: **Module History** (ghost/default small button)
   - Meta line: description, `Module Key: …`, `Version: n`, `Last Updated: …`
   - Large **textarea** (monospace-friendly, full width, tall)
   - **Save Current Module** — black button, **bottom-right of this card**
2. **Stage Compilation Preview** card (below editor)
   - Title `Stage Compilation Preview`
   - `Select Stage` + empty dropdown placeholder
   - Empty state: `No Data`

Do not put Prompt Testing on this page; it is a **separate nav item**.

---

## 4. Prompt Testing

Match [ui-reference/prompt-testing.png](ui-reference/prompt-testing.png).

**Page title:** `Prompt Testing` (left of content)

**Right of the title row (same horizontal band):**

- Chatbot dropdown (e.g. 高 ROAS 广告…)
- Static/disabled-looking **Test model (testing only)**
- Model dropdown (Claude Sonnet…)
- **New Test Chat** black button

**Body:** full-width **chat transcript**, centered column of bubbles

- Assistant: circular avatar + Kael message
- Breathing space: lone `.` between short paragraphs (product formatting)
- Large empty white area; conversation is the hero, not a sidebar

**Footer (sticky bottom of content, two rows):**

1. **AI Improve** row: label `AI Improve`, placeholder `What should be improved about the response?`, button **Improve with AI** (right)
2. **Composer:** rounded input `Type a message...`, trailing **attachment**, **mic**, **send** (circular dark send)

No left module list on this page.

---

## 5. Report Analysis

Match [ui-reference/report-analysis.png](ui-reference/report-analysis.png).

**Title row:** `Report Analysis` left; **right:** date range `YYYY-MM-DD` – `YYYY-MM-DD`, **All Chatbots** dropdown, **Refresh**

**Overview:** five **equal statistic columns** (not a dense table):

| Total Conversations | Unique Users | Total Messages | Active Conversations | Avg Insight Score |

Large numbers; small gray labels above.

**Second row: three cards**

| Operational Metrics (list) | Stage Distribution (bar) | Status Distribution (bar) |

Operational Metrics rows (label left, value right):

- Tracked AI Responses
- Input Tokens
- Output Tokens
- Avg Response Time (ms)
- Identity Guard Hits

Bars: orange/gold fill; caption under/over (e.g. `insight`, `active`).

**Chatbot Performance** — full-width table:

Chatbot Name | Current Model | Latest Prompt Version | Total Conversations | Total Messages | Insight Score | Tracked AI Responses | Tokens (In/Out) | Avg Response Time (ms)

**Gmail Activity** — table + **pagination** bottom-right (`< 1 2 3 4 >`)

Columns: Email (Most Active gold tag on top row) | Conversations | Messages | Last Active

**Recent Conversations** — table + **Search** on the right of the section header

Email | Chatbot Name | Title | Stage | Status | Insight Score | Message Count | Updated Date | Action (`View` link)

---

## 6. Implementation notes for reuse

- Recreate **chrome first** (header + 4-item sider + selected cream/gold), then drop each page into Content.
- Prefer Ant Design (or equivalent) so tables, tags, and stats stay visually aligned with production.
- Keep **black primary / gold selected nav / red delete / gold admin tag**.
- Prompt Management **must** stay split: module list left, editor + stage preview right.
- Prompt Testing **must** stay chat-first with Improve + composer docked at the bottom.
- Do not merge Gmail Access filters into a single toolbar icon row; keep **Add email** and **Search** as two stacked full-width fields.

When implementing UI, treat the four PNGs in `ui-reference/` as the source of truth if this text and a screenshot disagree.
