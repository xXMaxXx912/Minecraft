const $ = (id) => document.getElementById(id);
let characters = [];
let chatList = [];
// Aktuelles Gespräch. Ohne id ist es ein Entwurf, der erst mit der ersten Nachricht gespeichert wird.
let chat = null;

async function api(path, body, method) {
  const r = await fetch(path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data;
}

const characterById = (id) => characters.find((c) => c.id === id);
const formatDate = (iso) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function rememberChat(id) {
  try {
    if (id) localStorage.setItem("lastChat", id);
  } catch {}
}

function renderChatSelect() {
  const sel = $("chat");
  sel.innerHTML = "";
  if (chat && !chat.id) sel.add(new Option(`✎ Neues Gespräch mit ${chat.characterName}`, ""));
  for (const c of chatList) sel.add(new Option(`${c.characterName} – ${c.title} · ${formatDate(c.updatedAt)}`, c.id));
  sel.value = chat?.id ?? "";
  $("delete-chat").disabled = !chat?.id;
}

function renderMessages() {
  const log = $("log");
  log.innerHTML = "";
  for (const m of chat?.messages ?? []) {
    const div = document.createElement("div");
    div.className = `msg ${m.role}${m.error ? " error-msg" : ""}`;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = m.role === "user" ? "Du" : chat.characterName;
    div.append(who, document.createTextNode(m.content));
    log.append(div);
  }
  log.scrollTop = log.scrollHeight;
}

function render() {
  renderChatSelect();
  renderMessages();
}

function newDraft(characterId) {
  const c = characterById(characterId) || characters[0];
  if (!c) return;
  chat = { id: null, characterId: c.id, characterName: c.name, messages: [{ role: "assistant", content: c.greeting }] };
  $("character").value = c.id;
  render();
  $("input").focus();
}

async function openChat(id) {
  try {
    chat = await api(`/api/chats/${encodeURIComponent(id)}`);
    rememberChat(id);
  } catch (err) {
    alert(err.message);
  }
  render();
}

async function refreshList() {
  chatList = await api("/api/chats");
}

async function openApp() {
  $("gate").hidden = true;
  $("app").hidden = false;
  document.body.classList.add("chat-open");
  const me = await api("/api/me");
  $("account-link").textContent = `👤 ${me.username}`;
  [characters] = await Promise.all([api("/api/characters"), refreshList()]);
  $("character").innerHTML = "";
  for (const c of characters) $("character").add(new Option(`${c.name} (${c.age})${c.custom ? " ★" : ""}`, c.id));

  const wanted = new URLSearchParams(location.search).get("figur");
  if (wanted) history.replaceState(null, "", "/");
  let last = null;
  try {
    last = localStorage.getItem("lastChat");
  } catch {}

  if (wanted && characterById(wanted)) newDraft(wanted);
  else if (chatList.some((c) => c.id === last)) await openChat(last);
  else if (chatList.length) await openChat(chatList[0].id);
  else newDraft(characters[0]?.id);
}

// ---- Anmeldung / Registrierung ----

function showTab(register) {
  $("register-form").hidden = !register;
  $("login-form").hidden = register;
  $("tab-register").classList.toggle("active", register);
  $("tab-login").classList.toggle("active", !register);
  $("gate-error").textContent = "";
}
$("tab-login").addEventListener("click", () => showTab(false));
$("tab-register").addEventListener("click", () => showTab(true));

async function submitAuth(e, path, body) {
  e.preventDefault();
  $("gate-error").textContent = "";
  try {
    await api(path, body);
    await openApp();
  } catch (err) {
    $("gate-error").textContent = err.message;
  }
}

$("login-form").addEventListener("submit", (e) =>
  submitAuth(e, "/api/login", { username: $("login-user").value, password: $("login-pass").value }),
);
$("register-form").addEventListener("submit", (e) =>
  submitAuth(e, "/api/register", {
    username: $("reg-user").value,
    password: $("reg-pass").value,
    birthdate: $("birthdate").value,
    confirm: $("confirm").checked,
  }),
);

// ---- Gespräche ----

$("chat").addEventListener("change", () => {
  if ($("chat").value) openChat($("chat").value);
});

$("new-chat").addEventListener("click", () => newDraft($("character").value));

$("delete-chat").addEventListener("click", async () => {
  if (!chat?.id || !confirm("Dieses Gespräch endgültig löschen?")) return;
  try {
    await api(`/api/chats/${encodeURIComponent(chat.id)}`, null, "DELETE");
    await refreshList();
    if (chatList.length) await openChat(chatList[0].id);
    else newDraft(chat.characterId);
  } catch (err) {
    alert(err.message);
  }
});

// Eingabefeld wächst mit dem Text mit (bis max. 30 % der Höhe, siehe CSS).
function autoGrow() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight + 2}px`;
}
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
  chat.messages = chat.messages.filter((m) => !m.error);
  chat.messages.push({ role: "user", content: text });
  renderMessages();
  try {
    if (!chat.id) {
      const created = await api("/api/chats", { characterId: chat.characterId });
      chat.id = created.id;
      rememberChat(chat.id);
    }
    const { reply } = await api(`/api/chats/${encodeURIComponent(chat.id)}/messages`, { content: text });
    chat.messages.push({ role: "assistant", content: reply });
    await refreshList();
  } catch (err) {
    // Nachricht wurde nicht gespeichert: zurück ins Eingabefeld, damit man es erneut versuchen kann.
    chat.messages.pop();
    chat.messages.push({ role: "assistant", content: `⚠️ ${err.message}`, error: true });
    $("input").value = text;
    autoGrow();
  } finally {
    btn.disabled = false;
    render();
  }
});

api("/api/me")
  .then(({ loggedIn }) => (loggedIn ? openApp() : ($("gate").hidden = false)))
  .catch(() => ($("gate").hidden = false));
