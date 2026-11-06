const $ = (id) => document.getElementById(id);
let characters = [];
let messages = [];

async function api(path, body) {
  const r = await fetch(path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data;
}

function current() {
  return characters.find((c) => c.id === $("character").value);
}

function render() {
  const log = $("log");
  log.innerHTML = "";
  const name = current()?.name ?? "";
  for (const m of messages) {
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = m.role === "user" ? "Du" : name;
    div.append(who, document.createTextNode(m.content));
    log.append(div);
  }
  log.scrollTop = log.scrollHeight;
}

function start() {
  const c = current();
  messages = c ? [{ role: "assistant", content: c.greeting }] : [];
  render();
}

async function openApp() {
  $("gate").hidden = true;
  $("app").hidden = false;
  const me = await api("/api/me");
  $("account-link").textContent = `👤 ${me.username}`;
  characters = await api("/api/characters");
  $("character").innerHTML = "";
  for (const c of characters) $("character").add(new Option(`${c.name} (${c.age})${c.custom ? " ★" : ""}`, c.id));
  const wanted = new URLSearchParams(location.search).get("figur");
  if (wanted && characters.some((c) => c.id === wanted)) $("character").value = wanted;
  start();
}

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

$("character").addEventListener("change", start);
$("reset").addEventListener("click", start);

$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("chat-form").requestSubmit();
  }
});

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text) return;
  $("input").value = "";
  messages.push({ role: "user", content: text });
  render();
  const btn = e.submitter || $("chat-form").querySelector("button");
  btn.disabled = true;
  try {
    const { reply } = await api("/api/chat", { characterId: current().id, messages: messages.filter((m) => !m.error) });
    messages.push({ role: "assistant", content: reply });
  } catch (err) {
    messages.push({ role: "assistant", content: `⚠️ ${err.message}`, error: true });
  } finally {
    btn.disabled = false;
    render();
  }
});

api("/api/me")
  .then(({ loggedIn }) => (loggedIn ? openApp() : ($("gate").hidden = false)))
  .catch(() => ($("gate").hidden = false));
