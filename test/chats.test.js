import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ChatStore } from "../chats.js";

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chats-")), "chats.json");
const lena = { id: "lena", name: "Lena", greeting: "Hallo!" };

test("Gespräche anlegen, fortsetzen und neu laden", () => {
  const file = tmpFile();
  const store = new ChatStore(file);
  const chat = store.create("u1", lena);
  assert.equal(chat.messages[0].content, "Hallo!");
  assert.equal(chat.title, "Neues Gespräch");
  store.append(chat, { role: "user", content: "Ein Drink, bitte." }, { role: "assistant", content: "Kommt sofort." });
  assert.equal(chat.title, "Ein Drink, bitte.");

  const reloaded = new ChatStore(file);
  assert.equal(reloaded.get("u1", chat.id).messages.length, 3);
});

test("Gespräche sind pro Konto getrennt", () => {
  const store = new ChatStore(tmpFile());
  const chat = store.create("u1", lena);
  assert.equal(store.get("u2", chat.id), null);
  assert.equal(store.remove("u2", chat.id), false);
  assert.equal(store.listFor("u2").length, 0);
  assert.equal(store.remove("u1", chat.id), true);
});

test("Fehlgeschlagene Nachricht wird zurückgenommen, Titel zurückgesetzt", () => {
  const store = new ChatStore(tmpFile());
  const chat = store.create("u1", lena);
  const msg = { role: "user", content: "Hi" };
  store.append(chat, msg);
  store.removeMessage(chat, msg);
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.title, "Neues Gespräch");
});
