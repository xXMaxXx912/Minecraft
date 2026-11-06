const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const r = await fetch(path, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data;
}

async function loadList() {
  const all = await api("/api/characters");
  const mine = all.filter((c) => c.custom);
  const list = $("list");
  list.innerHTML = "";
  if (mine.length === 0) {
    const li = document.createElement("li");
    li.className = "hint";
    li.textContent = "Noch keine eigenen Figuren.";
    list.append(li);
  }
  for (const c of mine) {
    const li = document.createElement("li");
    li.className = "card wide char";
    const h = document.createElement("strong");
    h.textContent = `${c.name} (${c.age})`;
    const p = document.createElement("p");
    p.textContent = c.persona;
    const chat = document.createElement("a");
    chat.className = "button";
    chat.href = `/?figur=${encodeURIComponent(c.id)}`;
    chat.textContent = "Chatten";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "secondary";
    del.textContent = "Löschen";
    del.addEventListener("click", async () => {
      if (!confirm(`„${c.name}“ wirklich löschen?`)) return;
      await api(`/api/characters/${encodeURIComponent(c.id)}`, { method: "DELETE" });
      loadList();
    });
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(chat, del);
    li.append(h, p, actions);
    list.append(li);
  }
}

$("persona").addEventListener("input", () => ($("count").textContent = $("persona").value.length));

$("char-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("form-msg");
  msg.className = "";
  msg.textContent = "";
  try {
    const c = await api("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("name").value,
        age: Number($("age").value),
        greeting: $("greeting").value,
        persona: $("persona").value,
      }),
    });
    e.target.reset();
    $("count").textContent = "0";
    msg.className = "ok";
    msg.textContent = `„${c.name}“ wurde gespeichert.`;
    loadList();
  } catch (err) {
    msg.className = "error";
    msg.textContent = err.message;
  }
});

api("/api/status").then(({ verified }) => {
  if (!verified) return ($("locked").hidden = false);
  $("editor").hidden = false;
  $("list-wrap").hidden = false;
  loadList();
});
