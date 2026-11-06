// Rollenspiel-Chat 18+ – Version, die komplett auf dem iPhone läuft.
// Alle Daten liegen lokal (IndexedDB); die KI wird direkt vom Gerät aus angesprochen.
import { HARD_RULES, mentionsMinor, REFUSAL } from "./safety.js";
import { kv, chatsDb, clearAll, requestPersistence } from "./db.js";

export const APP_VERSION = "1.0.0";
const DEFAULT_BASE_URL = "https://api.x.ai/v1";
const HISTORY_FOR_AI = 40;
const MAX_MESSAGES = 1000;
const NEW_TITLE = "Neues Gespräch";

const $ = (id) => document.getElementById(id);

let settings = { baseUrl: DEFAULT_BASE_URL, apiKey: "", model: "" };
let baseCharacters = [];
let customCharacters = [];
let chatList = [];
let chat = null; // aktuelles Gespräch; ohne id = Entwurf, der erst mit der 1. Nachricht gespeichert wird

// ---------- Hilfsfunktionen ----------

export function ageFromBirthdate(birthdate, now = new Date()) {
  if (typeof birthdate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

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

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const allCharacters = () => [...baseCharacters, ...customCharacters];
const characterById = (id) => allCharacters().find((c) => c.id === id);
const formatDate = (iso) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const setMsg = (el, text, ok = false) => {
  el.className = ok ? "ok" : "error";
  el.textContent = text;
};

// ---------- KI ----------

export function buildSystemPrompt(character) {
  return [
    `Du spielst die Figur ${character.name} (${character.age} Jahre) in einem Rollenspiel mit einem erwachsenen Nutzer.`,
    character.persona,
    "Bleib in der Rolle, schreibe lebendig auf Deutsch, in der Ich-Form der Figur.",
    HARD_RULES,
  ].join("\n\n");
}

async function apiFetch(path, options = {}, timeoutMs = 120000) {
  if (!settings.apiKey) throw new Error("Bitte zuerst in den Einstellungen einen API-Key eintragen.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}`, ...(options.headers || {}) },
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "Die KI hat zu lange gebraucht – bitte erneut versuchen." : "Keine Verbindung zum KI-Anbieter. Ist das Internet an?");
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    let detail = "";
    try {
      const j = await r.json();
      detail = j.error?.message || j.error || j.message || "";
    } catch {}
    let hint = {
      400: "Anfrage abgelehnt",
      401: "API-Key ungültig",
      403: "Kein Zugriff (Key-Berechtigungen oder Guthaben prüfen)",
      404: "Nicht gefunden – Modellname oder API-Adresse prüfen",
      429: "Zu viele Anfragen oder Guthaben aufgebraucht",
    }[r.status] || "Fehler beim KI-Anbieter";
    if (/api.?key/i.test(String(detail))) hint = "API-Key ungültig";
    throw new Error(`${hint} (Status ${r.status})${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
  }
  return r.json();
}

async function askLLM(character, messages) {
  if (!settings.model) throw new Error("Bitte zuerst in den Einstellungen ein Modell wählen.");
  const history = messages.slice(-HISTORY_FOR_AI).map(({ role, content }) => ({ role, content }));
  const data = await apiFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: "system", content: buildSystemPrompt(character) }, ...history],
      temperature: 0.9,
      max_tokens: 600,
    }),
  });
  const reply = data.choices?.[0]?.message?.content?.trim() || "…";
  return mentionsMinor(reply) ? REFUSAL : reply;
}

// ---------- Ansichten ----------

function showView(name) {
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== `view-${name}`;
  document.body.classList.toggle("chat-open", name === "chat");
  if (name === "figuren") renderCharacterList();
  if (name === "einstellungen") fillSettingsForm();
  if (name === "chat") {
    if (!chat) newDraft(allCharacters()[0]?.id);
    else render();
  }
}

function route() {
  const name = (location.hash.replace(/^#\/?/, "") || "chat").split("?")[0];
  showView(["chat", "figuren", "einstellungen"].includes(name) ? name : "chat");
}

// ---------- Chat ----------

function renderCharacterSelect() {
  const sel = $("character");
  const keep = sel.value;
  sel.innerHTML = "";
  for (const c of allCharacters()) sel.add(new Option(`${c.name} (${c.age})${c.custom ? " ★" : ""}`, c.id));
  if (characterById(keep)) sel.value = keep;
}

function renderChatSelect() {
  const sel = $("chat");
  sel.innerHTML = "";
  if (chat && !chat.id) sel.add(new Option(`✎ Neues Gespräch mit ${chat.characterName}`, ""));
  for (const c of chatList) {
    const name = characterById(c.characterId)?.name ?? "(gelöschte Figur)";
    sel.add(new Option(`${name} – ${c.title} · ${formatDate(c.updatedAt)}`, c.id));
  }
  sel.value = chat?.id ?? "";
  $("delete-chat").disabled = !chat?.id;
}

function renderMessages() {
  const log = $("log");
  log.innerHTML = "";
  for (const m of chat?.messages ?? []) {
    const div = document.createElement("div");
    div.className = `msg ${m.role}${m.error ? " error-msg" : ""}${m.typing ? " typing" : ""}`;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = m.role === "user" ? "Du" : chat.characterName;
    div.append(who, document.createTextNode(m.content));
    log.append(div);
  }
  log.scrollTop = log.scrollHeight;
}

function render() {
  $("no-key").hidden = !!(settings.apiKey && settings.model);
  renderCharacterSelect();
  renderChatSelect();
  renderMessages();
}

async function refreshChatList() {
  chatList = (await chatsDb.all()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function newDraft(characterId) {
  const c = characterById(characterId) || allCharacters()[0];
  if (!c) return;
  chat = { id: null, characterId: c.id, characterName: c.name, title: NEW_TITLE, messages: [{ role: "assistant", content: c.greeting }] };
  $("character").value = c.id;
  render();
}

async function openChat(id) {
  const stored = await chatsDb.get(id);
  if (!stored) return newDraft();
  chat = { ...stored, characterName: characterById(stored.characterId)?.name ?? "(gelöschte Figur)" };
  await kv.set("lastChat", id);
  render();
}

async function saveChat() {
  const { characterName, ...toStore } = chat;
  toStore.messages = toStore.messages.filter((m) => !m.error && !m.typing).slice(-MAX_MESSAGES);
  if (toStore.title === NEW_TITLE) {
    const first = toStore.messages.find((m) => m.role === "user");
    if (first) toStore.title = first.content.replace(/\s+/g, " ").slice(0, 40) + (first.content.length > 40 ? "…" : "");
  }
  toStore.updatedAt = new Date().toISOString();
  await chatsDb.put(toStore);
  Object.assign(chat, { title: toStore.title, updatedAt: toStore.updatedAt });
}

function autoGrow() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight + 2}px`;
}

async function sendMessage(text) {
  const character = characterById(chat.characterId);
  if (!character) throw new Error("Die Figur dieses Gesprächs wurde gelöscht.");
  chat.messages = chat.messages.filter((m) => !m.error);
  const userMsg = { role: "user", content: text.slice(0, 4000) };
  chat.messages.push(userMsg);

  if (mentionsMinor(text)) {
    chat.messages.push({ role: "assistant", content: REFUSAL });
  } else {
    const typing = { role: "assistant", content: "schreibt …", typing: true };
    chat.messages.push(typing);
    renderMessages();
    try {
      const reply = await askLLM(character, chat.messages.filter((m) => !m.typing));
      chat.messages = chat.messages.filter((m) => m !== typing);
      chat.messages.push({ role: "assistant", content: reply });
    } catch (err) {
      // Nichts speichern: Nachricht zurück ins Eingabefeld, Fehler anzeigen.
      chat.messages = chat.messages.filter((m) => m !== typing && m !== userMsg);
      throw err;
    }
  }
  if (!chat.id) chat.id = uid();
  await saveChat();
  await kv.set("lastChat", chat.id);
  await refreshChatList();
}

// ---------- Figuren ----------

async function saveCustomCharacters() {
  await kv.set("customCharacters", customCharacters);
}

function renderCharacterList() {
  const list = $("list");
  list.innerHTML = "";
  if (customCharacters.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Noch keine eigenen Figuren.";
    list.append(li);
  }
  for (const c of customCharacters) {
    const li = document.createElement("li");
    li.className = "card wide char";
    const h = document.createElement("strong");
    h.textContent = `${c.name} (${c.age})`;
    const p = document.createElement("p");
    p.textContent = c.persona;
    const chatBtn = document.createElement("button");
    chatBtn.type = "button";
    chatBtn.textContent = "Chatten";
    chatBtn.addEventListener("click", () => {
      newDraft(c.id);
      location.hash = "#/chat";
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "secondary";
    del.textContent = "Löschen";
    del.addEventListener("click", async () => {
      if (!confirm(`„${c.name}“ und alle Gespräche mit dieser Figur löschen?`)) return;
      customCharacters = customCharacters.filter((x) => x.id !== c.id);
      await saveCustomCharacters();
      for (const ch of chatList.filter((x) => x.characterId === c.id)) await chatsDb.remove(ch.id);
      await refreshChatList();
      if (chat?.characterId === c.id) chat = null;
      renderCharacterList();
    });
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(chatBtn, del);
    li.append(h, p, actions);
    list.append(li);
  }
}

// ---------- Einstellungen ----------

function fillSettingsForm() {
  $("base-url").value = settings.baseUrl;
  $("api-key").value = settings.apiKey;
  $("model").value = settings.model;
  $("version").textContent = `Version ${APP_VERSION}`;
}

async function loadModels() {
  const msg = $("settings-msg");
  const prev = { ...settings };
  settings = { ...settings, baseUrl: $("base-url").value.trim(), apiKey: $("api-key").value.trim() };
  setMsg(msg, "Verbinde …", true);
  try {
    const data = await apiFetch("/models", {}, 20000);
    const ids = (data.data || []).map((m) => m.id).filter(Boolean).sort();
    const sel = $("model-select");
    sel.innerHTML = "";
    sel.add(new Option("– Modell wählen –", ""));
    for (const id of ids) sel.add(new Option(id, id));
    sel.hidden = ids.length === 0;
    if (ids.includes($("model").value)) sel.value = $("model").value;
    setMsg(msg, `Verbindung OK – ${ids.length} Modelle gefunden. Bitte eins wählen und speichern.`, true);
  } catch (err) {
    setMsg(msg, err.message);
  } finally {
    settings = prev; // erst beim Speichern übernehmen
  }
}

// ---------- Sicherung ----------

async function exportBackup() {
  const data = {
    app: "chat18",
    format: 1,
    exportedAt: new Date().toISOString(),
    settings: { baseUrl: settings.baseUrl, model: settings.model }, // API-Key bewusst nicht enthalten
    customCharacters,
    chats: await chatsDb.all(),
  };
  const name = `chat18-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const file = new File([blob], name, { type: "application/json" });
  // iOS: Teilen-Menü („In Dateien sichern“), sonst normaler Download
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return setMsg($("backup-msg"), "Sicherung erstellt.", true);
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  setMsg($("backup-msg"), "Sicherung heruntergeladen.", true);
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Die Datei ist keine gültige Sicherung.");
  }
  if (data?.app !== "chat18" || !Array.isArray(data.chats) || !Array.isArray(data.customCharacters)) {
    throw new Error("Die Datei ist keine Sicherung dieser App.");
  }
  const chars = data.customCharacters.filter((c) => typeof c.id === "string" && !validateCharacter(c));
  const chats = data.chats.filter(
    (c) => typeof c.id === "string" && typeof c.characterId === "string" && Array.isArray(c.messages) &&
      c.messages.every((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string"),
  );
  return { settings: data.settings || {}, customCharacters: chars, chats, skipped: data.customCharacters.length - chars.length + data.chats.length - chats.length };
}

async function importBackup(file) {
  const msg = $("backup-msg");
  try {
    const b = parseBackup(await file.text());
    if (!confirm(`Sicherung mit ${b.customCharacters.length} Figuren und ${b.chats.length} Gesprächen importieren? Vorhandene Einträge mit gleicher ID werden ersetzt.`)) return;
    const byId = new Map(customCharacters.map((c) => [c.id, c]));
    for (const c of b.customCharacters) byId.set(c.id, { ...c, custom: true });
    customCharacters = [...byId.values()];
    await saveCustomCharacters();
    for (const c of b.chats) await chatsDb.put({ title: NEW_TITLE, updatedAt: new Date().toISOString(), ...c });
    if (!settings.model && b.settings.model) {
      settings = { ...settings, model: String(b.settings.model), baseUrl: String(b.settings.baseUrl || settings.baseUrl) };
      await kv.set("settings", settings);
    }
    await refreshChatList();
    fillSettingsForm();
    // Ungespeicherten Entwurf durch das neueste importierte Gespräch ersetzen
    if ((!chat || !chat.id) && chatList.length) await openChat(chatList[0].id);
    setMsg(msg, `Importiert: ${b.customCharacters.length} Figuren, ${b.chats.length} Gespräche${b.skipped ? ` (${b.skipped} ungültige übersprungen)` : ""}.`, true);
  } catch (err) {
    setMsg(msg, err.message);
  }
}

// ---------- Start ----------

async function startApp() {
  $("gate").hidden = true;
  const [stored, custom, last] = await Promise.all([kv.get("settings"), kv.get("customCharacters"), kv.get("lastChat")]);
  settings = { ...settings, ...(stored || {}) };
  customCharacters = (custom || []).filter((c) => !validateCharacter(c));
  await refreshChatList();
  if (chatList.some((c) => c.id === last)) await openChat(last);
  else if (chatList.length) await openChat(chatList[0].id);
  else newDraft(baseCharacters[0]?.id);
  if (!settings.apiKey && !location.hash) location.hash = "#/einstellungen";
  route();
  requestPersistence();
}

function bindEvents() {
  window.addEventListener("hashchange", route);

  $("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const age = ageFromBirthdate($("birthdate").value);
    if (age === null || age < 0 || age > 120) return setMsg($("gate-error"), "Ungültiges Geburtsdatum.");
    if (age < 18 || !$("confirm").checked) return setMsg($("gate-error"), "Dieser Bereich ist nur für Erwachsene ab 18 Jahren.");
    await kv.set("ageConfirmedAt", new Date().toISOString());
    await startApp();
  });

  $("chat").addEventListener("change", () => $("chat").value && openChat($("chat").value));
  $("new-chat").addEventListener("click", () => newDraft($("character").value));
  $("delete-chat").addEventListener("click", async () => {
    if (!chat?.id || !confirm("Dieses Gespräch endgültig löschen?")) return;
    await chatsDb.remove(chat.id);
    await refreshChatList();
    if (chatList.length) await openChat(chatList[0].id);
    else newDraft(chat.characterId);
  });

  $("input").addEventListener("input", autoGrow);
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("chat-form").requestSubmit();
    }
  });
  $("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("input").value.trim();
    if (!text || !chat) return;
    const btn = $("chat-form").querySelector("button");
    btn.disabled = true;
    $("input").value = "";
    autoGrow();
    try {
      await sendMessage(text);
    } catch (err) {
      chat.messages.push({ role: "assistant", content: `⚠️ ${err.message}`, error: true });
      $("input").value = text;
      autoGrow();
    } finally {
      btn.disabled = false;
      render();
    }
  });

  $("persona").addEventListener("input", () => ($("count").textContent = $("persona").value.length));
  $("char-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const c = {
      id: `custom-${uid()}`,
      name: $("name").value.trim(),
      age: Number($("age").value),
      greeting: $("greeting").value.trim(),
      persona: $("persona").value.trim(),
      custom: true,
    };
    const error = validateCharacter(c);
    if (error) return setMsg($("form-msg"), error);
    if (customCharacters.length >= 50) return setMsg($("form-msg"), "Maximal 50 eigene Figuren.");
    customCharacters.push(c);
    await saveCustomCharacters();
    e.target.reset();
    $("count").textContent = "0";
    setMsg($("form-msg"), `„${c.name}“ wurde gespeichert.`, true);
    renderCharacterList();
  });

  $("load-models").addEventListener("click", loadModels);
  $("model-select").addEventListener("change", () => {
    if ($("model-select").value) $("model").value = $("model-select").value;
  });
  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const baseUrl = $("base-url").value.trim();
    if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl)) {
      return setMsg($("settings-msg"), "Die API-Adresse muss mit https:// beginnen.");
    }
    settings = { baseUrl, apiKey: $("api-key").value.trim(), model: $("model").value.trim() };
    await kv.set("settings", settings);
    setMsg($("settings-msg"), "Gespeichert.", true);
  });

  $("export").addEventListener("click", exportBackup);
  $("import").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) importBackup(f);
  });
  $("wipe").addEventListener("click", async () => {
    if (!confirm("Wirklich ALLE Daten auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.")) return;
    await clearAll();
    location.hash = "";
    location.reload();
  });
}

async function init() {
  bindEvents();
  try {
    baseCharacters = await (await fetch("characters.json")).json();
  } catch {
    baseCharacters = [];
  }
  $("loading").hidden = true;
  if (await kv.get("ageConfirmedAt")) await startApp();
  else $("gate").hidden = false;

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

if (typeof document !== "undefined" && document.getElementById("gate")) {
  init().catch((err) => {
    $("loading").hidden = false;
    $("loading").textContent = `Fehler beim Start: ${err.message}`;
  });
}
