import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import { HARD_RULES, mentionsMinor, REFUSAL } from "./safety.js";
import {
  ageFromBirthdate,
  createLoginLimiter,
  createSessions,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  UserStore,
  validateRegistration,
} from "./auth.js";
import { ChatStore } from "./chats.js";
import { readJson, writeJson } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  LLM_BASE_URL = "https://openrouter.ai/api/v1",
  LLM_API_KEY = "",
  LLM_MODEL = "",
  SESSION_SECRET = "",
  PORT = 3000,
} = process.env;

// Der Platzhalter aus .env.example ist öffentlich bekannt und darf nie als Schlüssel dienen.
const secretIsSet = !!SESSION_SECRET && SESSION_SECRET !== "bitte-aendern";
const secret = secretIsSet ? SESSION_SECRET : crypto.randomBytes(32).toString("hex");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const users = new UserStore(path.join(DATA_DIR, "users.json"));
const chats = new ChatStore(path.join(DATA_DIR, "chats.json"));
const sessions = createSessions(secret);
const loginLimiter = createLoginLimiter();

const baseCharacters = JSON.parse(fs.readFileSync(path.join(__dirname, "characters.json"), "utf8"));
for (const c of baseCharacters) {
  if (validateCharacter(c)) {
    throw new Error(`Figur "${c.name}" ist ungültig – bitte characters.json korrigieren.`);
  }
}

// Eigene Figuren, die über die Weboberfläche angelegt werden. Jede gehört einem Konto (ownerId).
const CUSTOM_FILE = path.join(DATA_DIR, "custom-characters.json");
let customCharacters = readJson(CUSTOM_FILE, []).filter((c) => c.ownerId && !validateCharacter(c));
function saveCustom() {
  writeJson(CUSTOM_FILE, customCharacters);
}
const charactersFor = (user) => [...baseCharacters, ...customCharacters.filter((c) => c.ownerId === user.id)];

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

export { ageFromBirthdate };

const app = express();
// Hinter einem HTTPS-Reverse-Proxy (Caddy, nginx, Render, …) TRUST_PROXY=1 setzen,
// damit req.secure stimmt und Cookies als "Secure" markiert werden.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function setSession(req, res, user) {
  res.cookie(SESSION_COOKIE, sessions.issue(user), {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure,
    maxAge: SESSION_MAX_AGE,
  });
}

// Hängt den angemeldeten Benutzer an req.user oder antwortet mit 401.
function requireUser(req, res, next) {
  const user = sessions.read(req.cookies[SESSION_COOKIE], users);
  if (!user) return res.status(401).json({ error: "Bitte melde dich an." });
  req.user = user;
  next();
}

app.get("/api/me", (req, res) => {
  const user = sessions.read(req.cookies[SESSION_COOKIE], users);
  res.json(user ? { loggedIn: true, username: user.username } : { loggedIn: false });
});

app.post("/api/register", (req, res) => {
  const body = req.body || {};
  const error = validateRegistration(body);
  if (error) return res.status(400).json({ error });
  const user = users.create({ username: body.username, password: body.password });
  if (!user) return res.status(409).json({ error: "Dieser Benutzername ist schon vergeben." });
  setSession(req, res, user);
  res.status(201).json({ username: user.username });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const key = `${req.ip}|${String(username).toLowerCase()}`;
  if (loginLimiter.blocked(key)) {
    return res.status(429).json({ error: "Zu viele Fehlversuche. Bitte warte 15 Minuten." });
  }
  const user = users.authenticate(String(username ?? ""), String(password ?? ""));
  if (!user) {
    loginLimiter.fail(key);
    return res.status(401).json({ error: "Benutzername oder Passwort falsch." });
  }
  loginLimiter.reset(key);
  setSession(req, res, user);
  res.json({ username: user.username });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.post("/api/password", requireUser, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!users.authenticate(req.user.username, String(oldPassword ?? ""))) {
    return res.status(401).json({ error: "Aktuelles Passwort ist falsch." });
  }
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 200) {
    return res.status(400).json({ error: "Neues Passwort muss mindestens 8 Zeichen lang sein." });
  }
  users.changePassword(req.user, newPassword);
  setSession(req, res, req.user);
  res.json({ ok: true });
});

app.delete("/api/account", requireUser, (req, res) => {
  const { password } = req.body || {};
  if (!users.authenticate(req.user.username, String(password ?? ""))) {
    return res.status(401).json({ error: "Passwort ist falsch." });
  }
  customCharacters = customCharacters.filter((c) => c.ownerId !== req.user.id);
  saveCustom();
  chats.removeWhere((c) => c.ownerId === req.user.id);
  users.remove(req.user.id);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get("/api/characters", requireUser, (req, res) => {
  res.json(
    charactersFor(req.user).map(({ id, name, age, greeting, persona, custom }) => ({
      id, name, age, greeting, custom: !!custom, ...(custom ? { persona } : {}),
    })),
  );
});

app.post("/api/characters", requireUser, (req, res) => {
  const mine = customCharacters.filter((c) => c.ownerId === req.user.id);
  if (mine.length >= 50) return res.status(400).json({ error: "Maximal 50 eigene Figuren pro Konto." });
  const body = req.body || {};
  const c = {
    name: String(body.name ?? "").trim(),
    age: Number(body.age),
    greeting: String(body.greeting ?? "").trim(),
    persona: String(body.persona ?? "").trim(),
  };
  const error = validateCharacter(c);
  if (error) return res.status(400).json({ error });
  const character = { id: `custom-${crypto.randomUUID()}`, ...c, custom: true, ownerId: req.user.id };
  customCharacters.push(character);
  saveCustom();
  const { ownerId, ...publicFields } = character;
  res.status(201).json(publicFields);
});

app.delete("/api/characters/:id", requireUser, (req, res) => {
  const before = customCharacters.length;
  customCharacters = customCharacters.filter((c) => !(c.id === req.params.id && c.ownerId === req.user.id));
  if (customCharacters.length === before) return res.status(404).json({ error: "Eigene Figur nicht gefunden." });
  saveCustom();
  chats.removeWhere((c) => c.ownerId === req.user.id && c.characterId === req.params.id);
  res.json({ ok: true });
});

// ---- Gespräche ----

const chatSummary = (chat, user) => {
  const character = charactersFor(user).find((c) => c.id === chat.characterId);
  return {
    id: chat.id,
    characterId: chat.characterId,
    characterName: character?.name ?? "(gelöschte Figur)",
    title: chat.title,
    updatedAt: chat.updatedAt,
  };
};

app.get("/api/chats", requireUser, (req, res) => {
  res.json(chats.listFor(req.user.id).map((c) => chatSummary(c, req.user)));
});

app.post("/api/chats", requireUser, (req, res) => {
  const character = charactersFor(req.user).find((c) => c.id === req.body?.characterId);
  if (!character) return res.status(400).json({ error: "Unbekannte Figur." });
  const chat = chats.create(req.user.id, character);
  if (!chat) return res.status(400).json({ error: "Maximal 100 Gespräche – bitte lösche alte Gespräche." });
  res.status(201).json({ ...chatSummary(chat, req.user), messages: chat.messages });
});

app.get("/api/chats/:id", requireUser, (req, res) => {
  const chat = chats.get(req.user.id, req.params.id);
  if (!chat) return res.status(404).json({ error: "Gespräch nicht gefunden." });
  res.json({ ...chatSummary(chat, req.user), messages: chat.messages });
});

app.delete("/api/chats/:id", requireUser, (req, res) => {
  if (!chats.remove(req.user.id, req.params.id)) return res.status(404).json({ error: "Gespräch nicht gefunden." });
  res.json({ ok: true });
});

async function askLLM(character, history) {
  const system = [
    `Du spielst die Figur ${character.name} (${character.age} Jahre) in einem Rollenspiel mit einem erwachsenen Nutzer.`,
    character.persona,
    "Bleib in der Rolle, schreibe lebendig auf Deutsch, in der Ich-Form der Figur.",
    HARD_RULES,
  ].join("\n\n");

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
    throw new Error(`KI-Anbieter antwortete mit Status ${r.status}.`);
  }
  const data = await r.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || "…";
  return mentionsMinor(reply) ? REFUSAL : reply;
}

app.post("/api/chats/:id/messages", requireUser, async (req, res) => {
  const chat = chats.get(req.user.id, req.params.id);
  if (!chat) return res.status(404).json({ error: "Gespräch nicht gefunden." });
  const character = charactersFor(req.user).find((c) => c.id === chat.characterId);
  if (!character) return res.status(400).json({ error: "Die Figur dieses Gesprächs wurde gelöscht." });

  const content = typeof req.body?.content === "string" ? req.body.content.trim().slice(0, 4000) : "";
  if (!content) return res.status(400).json({ error: "Leere Nachricht." });

  const userMsg = { role: "user", content };
  if (mentionsMinor(content)) {
    const reply = { role: "assistant", content: REFUSAL };
    chats.append(chat, userMsg, reply);
    return res.json({ reply: reply.content, blocked: true, title: chat.title });
  }

  if (!LLM_API_KEY || !LLM_MODEL) {
    return res.status(500).json({ error: "LLM_API_KEY und LLM_MODEL müssen in .env gesetzt sein." });
  }

  chats.append(chat, userMsg);
  try {
    const history = chat.messages.slice(-40).map(({ role, content }) => ({ role, content }));
    const reply = await askLLM(character, history);
    chats.append(chat, { role: "assistant", content: reply });
    res.json({ reply, title: chat.title });
  } catch (err) {
    console.error(err);
    chats.removeMessage(chat, userMsg); // Nutzernachricht zurücknehmen, damit man es erneut versuchen kann
    res.status(502).json({ error: err.message.startsWith("KI-Anbieter") ? err.message : "KI-Anbieter nicht erreichbar." });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!secretIsSet) {
    console.warn(
      "WARNUNG: SESSION_SECRET ist nicht gesetzt – nach jedem Neustart müssen sich alle neu anmelden.\n" +
        "         Abhilfe: npm run setup  (oder SESSION_SECRET in .env eintragen)",
    );
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Chatbot läuft auf http://localhost:${PORT}`);
    // Adressen im lokalen Netz, z. B. zum Öffnen auf dem iPhone im selben WLAN.
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === "IPv4" && !i.internal)
      .map((i) => `http://${i.address}:${PORT}`);
    if (lan.length) console.log(`Im WLAN (z. B. iPhone):  ${lan.join("  ")}`);
  });
}

export default app;
