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

const characters = JSON.parse(fs.readFileSync(path.join(__dirname, "characters.json"), "utf8"));
for (const c of characters) {
  if (!(c.age >= 18) || mentionsMinor(c.persona)) {
    throw new Error(`Figur "${c.name}" ist nicht eindeutig volljährig – bitte characters.json korrigieren.`);
  }
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
  res.json(characters.map(({ id, name, age, greeting }) => ({ id, name, age, greeting })));
});

app.post("/api/chat", async (req, res) => {
  if (!isVerified(req)) return res.status(403).json({ error: "Altersbestätigung erforderlich." });

  const { characterId, messages } = req.body || {};
  const character = characters.find((c) => c.id === characterId);
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
