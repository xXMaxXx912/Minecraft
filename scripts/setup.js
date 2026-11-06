// Einrichtungs-Assistent: npm run setup
// Fragt den API-Key ab, prüft ihn, lässt ein Modell wählen und schreibt die .env-Datei.
// Der Key wird nur in die lokale .env geschrieben und nur an die API-Adresse geschickt.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = process.env.SETUP_ENV_FILE || path.join(root, ".env");
const DEFAULT_BASE_URL = "https://api.x.ai/v1";

export const PROVIDERS = [
  {
    name: "Groq – kostenlos (Konto nötig, keine Kreditkarte)",
    url: "https://api.groq.com/openai/v1",
    keyHelp: "Key holen: https://console.groq.com/keys → „Create API Key“ (beginnt mit gsk_)",
  },
  {
    name: "OpenRouter – kostenlose Modelle (Endung „:free“)",
    url: "https://openrouter.ai/api/v1",
    keyHelp: "Key holen: https://openrouter.ai/keys → „Create Key“ (beginnt mit sk-or-)",
    keyCheckPath: "/key", // /models prüft den Key bei OpenRouter nicht
    onlyFree: true,
  },
  {
    name: "Ollama – kostenlos auf diesem PC, kein Key nötig",
    url: "http://localhost:11434/v1",
    noKey: true,
    offlineHelp: "Ollama läuft nicht. Installieren: https://ollama.com → danach im Terminal z. B. „ollama pull llama3.1“.",
  },
  {
    name: "Grok / xAI – kostenpflichtig",
    url: "https://api.x.ai/v1",
    keyHelp: "Key holen: https://console.x.ai → API Keys (beginnt mit xai-)",
  },
];

// ---- .env lesen/schreiben ----

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export function buildEnv(values) {
  return [
    "# Erstellt mit: npm run setup",
    "",
    "# KI-Anbieter (OpenAI-kompatibel)",
    `LLM_BASE_URL=${values.LLM_BASE_URL}`,
    `LLM_API_KEY=${values.LLM_API_KEY}`,
    `LLM_MODEL=${values.LLM_MODEL}`,
    "",
    "# Geheimer Schlüssel für die Sitzungs-Cookies (nicht weitergeben)",
    `SESSION_SECRET=${values.SESSION_SECRET}`,
    "",
    `PORT=${values.PORT || 3000}`,
    ...(values.DATA_DIR ? [`DATA_DIR=${values.DATA_DIR}`] : []),
    ...(values.TRUST_PROXY ? [`TRUST_PROXY=${values.TRUST_PROXY}`] : []),
    "",
  ].join("\n");
}

// ---- Eingabe ----

let rl;
let lines;
async function ask(question, def = "") {
  process.stdout.write(def ? `${question} [${def}]: ` : `${question}: `);
  const { value, done } = await lines.next();
  if (done) throw new Error("Eingabe beendet.");
  return value.trim() || def;
}

// Verdeckte Eingabe (für den Key) – zeigt * statt der Zeichen, wenn möglich.
async function askHidden(question) {
  if (!process.stdin.isTTY) return ask(question);
  const origWrite = rl._writeToOutput?.bind(rl);
  process.stdout.write(`${question}: `);
  rl._writeToOutput = (s) => {
    if (s.includes("\n") || s.includes("\r")) origWrite("\n");
    else origWrite("*".repeat(s.length));
  };
  try {
    const { value } = await lines.next();
    return value.trim();
  } finally {
    rl._writeToOutput = origWrite;
  }
}

// ---- API ----

async function apiGet(baseUrl, pathName, key, provider) {
  let r;
  try {
    r = await fetch(`${baseUrl.replace(/\/+$/, "")}${pathName}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error(provider?.offlineHelp || `Keine Verbindung zu ${baseUrl} (${err.cause?.code || err.message}). Internet/Firewall prüfen.`);
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    const hint = r.status === 401 || r.status === 400 || /api.?key|unauthori[sz]ed|invalid.*key/i.test(text)
      ? "Der API-Key wurde abgelehnt – bitte prüfen (vollständig kopiert, ohne Leerzeichen?)."
      : r.status === 403 ? "Kein Zugriff – Berechtigungen/Guthaben des Keys prüfen."
      : "Unerwartete Antwort des Anbieters.";
    throw new Error(`${hint} (Status ${r.status})`);
  }
  return r.json();
}

export function pickModels(ids, provider) {
  let list = ids.filter((id) => !/whisper|tts|embed|guard|moderation|audio|image|vision-only/i.test(id));
  if (provider?.onlyFree) list = list.filter((id) => id.endsWith(":free"));
  return [...new Set(list)].sort();
}

async function listModels(baseUrl, key, provider) {
  if (provider?.keyCheckPath) await apiGet(baseUrl, provider.keyCheckPath, key, provider);
  const data = await apiGet(baseUrl, "/models", key, provider);
  return pickModels((data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean), provider);
}

// ---- Ablauf ----

async function main() {
  console.log("\n=== Einrichtung Rollenspiel-Chat 18+ ===\n");
  const existing = fs.existsSync(ENV_FILE) ? parseEnv(fs.readFileSync(ENV_FILE, "utf8")) : {};
  if (fs.existsSync(ENV_FILE)) console.log(`Vorhandene Einstellungen in ${ENV_FILE} werden übernommen bzw. ergänzt.\n`);

  console.log("Welchen KI-Anbieter möchtest du nutzen?");
  PROVIDERS.forEach((p, i) => console.log(`  ${i + 1}) ${p.name}`));
  console.log(`  ${PROVIDERS.length + 1}) Andere Adresse eingeben`);
  const presetIdx = PROVIDERS.findIndex((p) => p.url === existing.LLM_BASE_URL);
  let provider = null;
  let baseUrl = "";
  while (!baseUrl) {
    const n = Number(await ask("Nummer wählen", String(presetIdx >= 0 ? presetIdx + 1 : 1)));
    if (n >= 1 && n <= PROVIDERS.length) {
      provider = PROVIDERS[n - 1];
      baseUrl = provider.url;
    } else if (n === PROVIDERS.length + 1) {
      baseUrl = await ask("API-Adresse (OpenAI-kompatibel, endet meist auf /v1)", existing.LLM_BASE_URL || DEFAULT_BASE_URL);
    } else {
      console.log(`Bitte eine Zahl von 1 bis ${PROVIDERS.length + 1} eingeben.`);
    }
  }

  let key = "";
  let models = [];
  if (provider?.noKey) {
    process.stdout.write("\nPrüfe Verbindung … ");
    try {
      models = await listModels(baseUrl, "", provider);
      console.log(`OK, ${models.length} Modelle installiert.`);
      if (!models.length) throw new Error("Noch kein Modell installiert. Im Terminal z. B. „ollama pull llama3.1“ ausführen und Setup neu starten.");
    } catch (err) {
      throw new Error(err.message);
    }
  } else {
    const sameProvider = existing.LLM_BASE_URL === baseUrl;
    const hasKey = sameProvider && existing.LLM_API_KEY && !/dein-api-key/.test(existing.LLM_API_KEY);
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt === 1) console.log(`\n${provider?.keyHelp || "Den API-Key bekommst du in der Konsole deines Anbieters."}`);
      key = await askHidden(hasKey && attempt === 1 ? "API-Key (Enter = vorhandenen behalten)" : "API-Key einfügen (Rechtsklick oder Strg+V, dann Enter)");
      if (!key && hasKey) key = existing.LLM_API_KEY;
      if (!key) {
        console.log("Kein Key eingegeben.");
        if (attempt === 3) throw new Error("Abgebrochen – kein Key eingegeben.");
        continue;
      }
      process.stdout.write("Prüfe Key … ");
      try {
        models = await listModels(baseUrl, key, provider);
        console.log(`OK, ${models.length} Modelle verfügbar.`);
        break;
      } catch (err) {
        console.log(`\n✖ ${err.message}`);
        key = "";
        if (attempt === 3) throw new Error("Abgebrochen – Key konnte nicht bestätigt werden.");
      }
    }
  }

  let model = "";
  if (models.length) {
    console.log("\nVerfügbare Modelle:");
    models.forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}) ${m}`));
    const preset = models.indexOf(existing.LLM_MODEL) + 1 || 1;
    while (!model) {
      const answer = await ask("Nummer des Modells wählen", String(preset));
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= models.length) model = models[n - 1];
      else if (models.includes(answer)) model = answer;
      else console.log(`Bitte eine Zahl von 1 bis ${models.length} eingeben.`);
    }
  } else {
    model = await ask("Modellname (aus der Anbieter-Konsole)", existing.LLM_MODEL || "");
  }

  const secret = existing.SESSION_SECRET && existing.SESSION_SECRET !== "bitte-aendern"
    ? existing.SESSION_SECRET
    : crypto.randomBytes(32).toString("hex");

  fs.writeFileSync(ENV_FILE, buildEnv({ ...existing, LLM_BASE_URL: baseUrl, LLM_API_KEY: key, LLM_MODEL: model, SESSION_SECRET: secret }));
  console.log(`\n✔ Gespeichert in ${ENV_FILE}`);
  console.log(`  Modell: ${model}`);
  console.log("\nJetzt den Server (neu) starten:  npm start   (in PowerShell: npm.cmd start)\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  lines = rl[Symbol.asyncIterator]();
  main()
  .catch((err) => {
    console.error(`\n✖ ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
}
