import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { HARD_RULES, mentionsMinor, REFUSAL } from "./safety.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  LLM_BASE_URL = "https://openrouter.ai/api/v1",
  LLM_API_KEY = "",
  LLM_MODEL = "",
  SESSION_SECRET = "",
  PORT = 3000,
} = process.env;

if (!SESSION_SECRET || SESSION_SECRET === "bitte-aendern") {
  console.warn("WARNUNG: SESSION_SECRET ist nicht gesetzt – bitte in .env eintragen.");
}
const secret = SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const baseCharacters = JSON.parse(fs.readFileSync(path.join(__dirname, "characters.json"), "utf8"));
for (const c of baseCharacters) {
  if (validateCharacter(c)) {
    throw new Error(`Figur "${c.name}" ist ungültig – bitte characters.json korrigieren.`);
  }
}

// Eigene Figuren, die über die Weboberfläche angelegt werden.
const CUSTOM_FILE = process.env.CUSTOM_CHARACTERS_FILE || path.join(__dirname, "data", "custom-characters.json");
let customCharacters = [];
try {
  customCharacters = JSON.parse(fs.readFileSync(CUSTOM_FILE, "utf8")).filter((c) => !validateCharacter(c));
} catch {
  customCharacters = [];
}
function saveCustom() {
  fs.mkdirSync(path.dirname(CUSTOM_FILE), { recursive: true });
  fs.writeFileSync(CUSTOM_FILE, JSON.stringify(customCharacters, null, 2));
}
const allCharacters = () => [...baseCharacters, ...customCharacters];

// Gibt eine Fehlermeldung zurück oder null, wenn die Figur gültig ist.
export function validateCharacter(c) {
  if (!c || typeof c !== "object") return "Ungültige Daten.";
  const { name, age, greeting, persona } = c;
  if (typeof name !== "string" || !name.trim() || name.length > 40) return "Name fehlt oder ist zu lang (max. 40 Zeichen).";
  if (!Number.isInteger(age) || age < 18 || age > 999) return "Alter muss eine ganze Zahl ab 18 sein.";
  if (typeof greeting !== "string" || !greeting.trim() || greeting.length > 500) return "Begrüßung fehlt oder ist zu lang (max. 500 Zeichen).";
  if (typeof persona !== "string" || persona.trim().length < 20 || persona.length > 2000) return "Beschreibung muss 20–2000 Zeichen lang sein.";
  if ([name, greeting, persona].some(mentionsMinor)) return "Figuren müssen eindeutig erwachsen sein – Bezüge zu Minderjährigen sind nicht erlaubt.";
  return null;
}

const AGE_COOKIE = "age_verified";
const sign = (value) => crypto.createHmac("sha256", secret).update(value).digest("hex");

export function ageFromBirthdate(birthdate, now = new Date()) {
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function isVerified(req) {
  const raw = req.cookies[AGE_COOKIE];
  if (!raw) return false;
  const [value, sig] = raw.split(".");
  if (!value || !sig || sig.length !== 64) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(value)));
}

const app = express();
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => res.json({ verified: isVerified(req) }));

app.post("/api/verify-age", (req, res) => {
  const { birthdate, confirm } = req.body || {};
  const age = ageFromBirthdate(birthdate);
  if (age === null || age > 120) return res.status(400).json({ error: "Ungültiges Geburtsdatum." });
  if (age < 18 || confirm !== true) {
    return res.status(403).json({ error: "Dieser Bereich ist nur für Erwachsene ab 18 Jahren." });
  }
  const value = String(Date.now());
  res.cookie(AGE_COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  res.json({ ok: true });
});

app.get("/api/characters", (req, res) => {
  if (!isVerified(req)) return res.status(403).json({ error: "Altersbestätigung erforderlich." });
  res.json(
    allCharacters().map(({ id, name, age, greeting, persona, custom }) => ({
      id, name, age, greeting, custom: !!custom, ...(custom ? { persona } : {}),
    })),
  );
});

app.post("/api/characters", (req, res) => {
  if (!isVerified(req)) return res.status(403).json({ error: "Altersbestätigung erforderlich." });
  if (customCharacters.length >= 200) return res.status(400).json({ error: "Maximale Anzahl eigener Figuren erreicht." });
  const body = req.body || {};
  const c = {
    name: String(body.name ?? "").trim(),
    age: Number(body.age),
    greeting: String(body.greeting ?? "").trim(),
    persona: String(body.persona ?? "").trim(),
  };
  const error = validateCharacter(c);
  if (error) return res.status(400).json({ error });
  const character = { id: `custom-${crypto.randomUUID()}`, ...c, custom: true };
  customCharacters.push(character);
  saveCustom();
  res.status(201).json(character);
});

app.delete("/api/characters/:id", (req, res) => {
  if (!isVerified(req)) return res.status(403).json({ error: "Altersbestätigung erforderlich." });
  const before = customCharacters.length;
  customCharacters = customCharacters.filter((c) => c.id !== req.params.id);
  if (customCharacters.length === before) return res.status(404).json({ error: "Eigene Figur nicht gefunden." });
  saveCustom();
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  if (!isVerified(req)) return res.status(403).json({ error: "Altersbestätigung erforderlich." });

  const { characterId, messages } = req.body || {};
  const character = allCharacters().find((c) => c.id === characterId);
  if (!character) return res.status(400).json({ error: "Unbekannte Figur." });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Keine Nachrichten." });
  }

  // Nur user/assistant-Rollen vom Client übernehmen, Systemprompt wird serverseitig gesetzt.
  const history = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const last = history.at(-1);
  if (last?.role === "user" && mentionsMinor(last.content)) {
    return res.json({ reply: REFUSAL, blocked: true });
  }

  const system = [
    `Du spielst die Figur ${character.name} (${character.age} Jahre) in einem Rollenspiel mit einem erwachsenen Nutzer.`,
    character.persona,
    "Bleib in der Rolle, schreibe lebendig auf Deutsch, in der Ich-Form der Figur.",
    HARD_RULES,
  ].join("\n\n");

  if (!LLM_API_KEY || !LLM_MODEL) {
    return res.status(500).json({ error: "LLM_API_KEY und LLM_MODEL müssen in .env gesetzt sein." });
  }

  try {
    const r = await fetch(`${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "system", content: system }, ...history],
        temperature: 0.9,
        max_tokens: 600,
      }),
    });
    if (!r.ok) {
      console.error("LLM-Fehler", r.status, await r.text());
      return res.status(502).json({ error: `KI-Anbieter antwortete mit Status ${r.status}.` });
    }
    const data = await r.json();
    let reply = data.choices?.[0]?.message?.content?.trim() || "…";
    if (mentionsMinor(reply)) reply = REFUSAL;
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "KI-Anbieter nicht erreichbar." });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`Chatbot läuft auf http://localhost:${PORT}`));
}

export default app;
