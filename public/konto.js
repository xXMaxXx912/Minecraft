const $ = (id) => document.getElementById(id);

async function api(path, method = "GET", body) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Fehler ${r.status}`);
  return data;
}

$("logout").addEventListener("click", async () => {
  await api("/api/logout", "POST");
  location.href = "/";
});

$("pw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("pw-msg");
  try {
    await api("/api/password", "POST", { oldPassword: $("old-pass").value, newPassword: $("new-pass").value });
    e.target.reset();
    msg.className = "ok";
    msg.textContent = "Passwort geändert.";
  } catch (err) {
    msg.className = "error";
    msg.textContent = err.message;
  }
});

$("delete-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("Konto und alle eigenen Figuren wirklich endgültig löschen?")) return;
  try {
    await api("/api/account", "DELETE", { password: $("del-pass").value });
    location.href = "/";
  } catch (err) {
    $("del-msg").textContent = err.message;
  }
});

api("/api/me").then((me) => {
  if (!me.loggedIn) return ($("locked").hidden = false);
  $("username").textContent = me.username;
  $("content").hidden = false;
});
