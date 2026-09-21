import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const seedPath = path.join(dataDir, "seed.json");
const storePath = path.join(dataDir, "app.json");

function now() {
  return new Date().toISOString();
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function createStore() {
  const seed = loadJson(seedPath, { models: [], chatbots: [], whitelist: [], stages: [], modules: [] });
  let data = loadJson(storePath, null);
  if (!data) {
    data = {
      users: seed.whitelist.map((u) => ({
        email: u.email.toLowerCase(),
        is_admin: !!u.is_admin,
        is_active: u.is_active !== false,
        created_at: u.created_at || now(),
      })),
      models: seed.models,
      chatbots: seed.chatbots.map((c) => ({ ...c, prompt_version: 1 })),
      stages: seed.stages,
      modules: seed.modules.map((m, idx) => ({ id: idx + 1, ...m })),
      moduleHistory: [],
      otps: [],
      conversations: [],
      messages: [],
      jobs: [],
    };
    persist();
  }

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
  }

  return {
    data,
    persist,
    now,
    seed,
  };
}
