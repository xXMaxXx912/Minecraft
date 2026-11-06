import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createLoginLimiter,
  createSessions,
  hashPassword,
  UserStore,
  validateRegistration,
  verifyPassword,
} from "../auth.js";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-")), "users.json");

test("Passwort-Hashing", () => {
  const h = hashPassword("geheim123");
  assert.ok(!h.includes("geheim123"));
  assert.equal(verifyPassword("geheim123", h), true);
  assert.equal(verifyPassword("falsch", h), false);
});

test("Registrierung prüft Alter und Eingaben", () => {
  const ok = { username: "max_1", password: "12345678", birthdate: "1990-05-01", confirm: true };
  assert.equal(validateRegistration(ok), null);
  assert.match(validateRegistration({ ...ok, birthdate: "2015-01-01" }), /ab 18/);
  assert.match(validateRegistration({ ...ok, confirm: false }), /ab 18/);
  assert.match(validateRegistration({ ...ok, password: "kurz" }), /8 Zeichen/);
  assert.match(validateRegistration({ ...ok, username: "a b" }), /Benutzername/);
});

test("Benutzer anlegen, anmelden, Doppelte verhindern", () => {
  const file = tmpFile();
  const store = new UserStore(file);
  const u = store.create({ username: "Lena", password: "passwort1" });
  assert.ok(u);
  assert.equal(store.create({ username: "lena", password: "x" }), null, "Groß-/Kleinschreibung egal");
  assert.equal(store.authenticate("LENA", "passwort1")?.id, u.id);
  assert.equal(store.authenticate("Lena", "falsch"), null);
  assert.equal(store.authenticate("niemand", "passwort1"), null);
  const saved = fs.readFileSync(file, "utf8");
  assert.ok(!saved.includes("passwort1"), "Klartext-Passwort darf nicht gespeichert werden");
  assert.ok(!saved.includes("birth"), "Geburtsdatum wird nicht gespeichert");
});

test("Sitzungen: Signatur und Abmeldung nach Passwortänderung", () => {
  const store = new UserStore(tmpFile());
  const u = store.create({ username: "tom", password: "passwort1" });
  const s = createSessions("secret");
  const token = s.issue(u);
  assert.equal(s.read(token, store)?.id, u.id);
  assert.equal(s.read(token.slice(0, -1) + "0", store), null, "manipuliertes Token");
  assert.equal(createSessions("anderes").read(token, store), null, "anderer Schlüssel");
  store.changePassword(u, "neuespasswort");
  assert.equal(s.read(token, store), null, "altes Token ungültig");
});

test("Login-Sperre nach 5 Fehlversuchen", () => {
  const l = createLoginLimiter();
  for (let i = 0; i < 5; i++) l.fail("k");
  assert.equal(l.blocked("k"), true);
  l.reset("k");
  assert.equal(l.blocked("k"), false);
});
