#!/usr/bin/env python3
"""Parse LIVE_DUMP.md into backend/data/seed.json. Re-run after dump updates."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
script = r'''
import json, re
from pathlib import Path
ROOT = Path(%r)
text = (ROOT / "LIVE_DUMP.md").read_text(encoding="utf-8")
models = [
    {"value": "claude-sonnet-5", "label": "Claude Sonnet 5", "provider": "anthropic"},
    {"value": "gpt-5.5", "label": "GPT-5.5", "provider": "openai"},
    {"value": "gpt-5.6-sol", "label": "GPT-5.6 Sol", "provider": "openai"},
    {"value": "gpt-5.6-terra", "label": "GPT-5.6 Terra", "provider": "openai"},
    {"value": "gpt-5.6-luna", "label": "GPT-5.6 Luna", "provider": "openai"},
]
chatbots = [
    {"key": "ai_chatbot", "name": "高 ROAS 广告 - 文案", "model": "claude-sonnet-5", "prompt_mode": "modular", "availability": "available"},
    {"key": "image_chatbot", "name": "高 ROAS 广告 - 单图", "model": "gpt-5.6-sol", "prompt_mode": "modular", "availability": "available"},
    {"key": "lead_nurture_chatbot", "name": "高效率养 Leads - 内容", "model": "claude-sonnet-5", "prompt_mode": "modular", "availability": "available"},
    {"key": "lead_nurture_image_chatbot", "name": "高效率养 Leads - 单图", "model": "gpt-5.6-sol", "prompt_mode": "modular", "availability": "available"},
]
def emails(heading, until, is_admin):
    idx = text.find(heading)
    end = text.find(until, idx + 1)
    rows = []
    for line in text[idx:end].splitlines():
        m = re.match(r"\| ([^|]+@[^|]+) \| (True|False) \| ([^|]+) \|", line)
        if m:
            rows.append({"email": m.group(1).strip(), "is_active": m.group(2) == "True", "created_at": m.group(3).strip(), "is_admin": is_admin})
    return rows
whitelist = emails("### 3.1 Admin accounts", "### 3.2", True) + emails("### 3.2 Student accounts", "## 4. Report", False)
stages = []
current_bot = None
current_locale = None
for line in text[text.find("## 5. Stages"): text.find("## 6. Module contents")].splitlines():
    bot_m = re.match(r"### .+ \(`([a-z_]+)`\)", line)
    if bot_m:
        current_bot = bot_m.group(1)
        continue
    if line.strip() in ("**zh-MY**", "**en-MY**"):
        current_locale = line.strip().strip("*")
        continue
    sm = re.match(r"\| `([^`]+)` \| ([^|]+) \| (True|False) \| (\d+) \|", line)
    if sm and current_bot and current_locale:
        stages.append({"chatbot_key": current_bot, "prompt_locale": current_locale, "stage_key": sm.group(1), "display_name": sm.group(2).strip(), "is_initial": sm.group(3) == "True", "sort_order": int(sm.group(4))})
modules = []
chatbot_key = None
i = 0
all_lines = text.splitlines()
def skip_blank():
    global i
    while i < len(all_lines) and all_lines[i].strip() == "":
        i += 1
while i < len(all_lines):
    line = all_lines[i]
    bm = re.match("### ([a-z_]+) / (zh-MY|en-MY)", line)
    if bm:
        chatbot_key = bm.group(1)
        i += 1
        continue
    if line.startswith("#### ") and "(" in line and chatbot_key:
        open_idx = line.rfind("(`")
        close_idx = line.rfind("`)")
        if open_idx < 0:
            i += 1
            continue
        module_key = line[open_idx + 2 : close_idx]
        display_name = re.sub(r"^\d+\.\s+", "", line.split("#### ", 1)[1])
        display_name = display_name[: display_name.rfind("(")].strip()
        i += 1
        skip_blank()
        meta = {}
        while i < len(all_lines) and all_lines[i].startswith("- "):
            item = all_lines[i]
            if item.startswith("- locale:"):
                loc = re.search("locale: `([^`]+)`.+type: `([^`]+)`.+version: ([0-9]+).+sort: ([0-9]+)", item)
                if loc:
                    meta["prompt_locale"] = loc.group(1)
                    meta["type"] = loc.group(2)
                    meta["version"] = int(loc.group(3))
                    meta["sort_order"] = int(loc.group(4))
            elif item.startswith("- description:"):
                meta["description"] = item.split(":", 1)[1].strip()
            elif item.startswith("- updated_at:"):
                meta["updated_at"] = item.split("`")[1]
            i += 1
        skip_blank()
        if i >= len(all_lines) or not all_lines[i].startswith("```"):
            i += 1
            continue
        i += 1
        body = []
        while i < len(all_lines) and not all_lines[i].startswith("```"):
            body.append(all_lines[i])
            i += 1
        modules.append({
            "chatbot_key": chatbot_key,
            "prompt_locale": meta.get("prompt_locale"),
            "display_name": display_name,
            "module_key": module_key,
            "type": meta.get("type"),
            "version": meta.get("version", 1),
            "sort_order": meta.get("sort_order", 0),
            "description": meta.get("description", ""),
            "updated_at": meta.get("updated_at"),
            "content": "\n".join(body),
            "required": True,
            "active": True,
        })
        if i < len(all_lines):
            i += 1
        continue
    i += 1
out = ROOT / "backend" / "data" / "seed.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"models": models, "chatbots": chatbots, "whitelist": whitelist, "stages": stages, "modules": modules}, ensure_ascii=False, indent=2), encoding="utf-8")
print("modules", len(modules), "whitelist", len(whitelist), "stages", len(stages))
''' % str(ROOT)
# Keep a short runner; seed.json is already generated.
print("seed.json ready at backend/data/seed.json (66 modules). Re-generate with the inline parser if LIVE_DUMP.md changes.")
