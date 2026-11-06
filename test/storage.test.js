import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson } from "../storage.js";
import { ChatStore } from "../chats.js";

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "storage-"));

test("Fehlende Datei → Standardwert", () => {
  assert.deepEqual(readJson(path.join(dir(), "fehlt.json"), []), []);
});

test("Beschädigte Datei → Abbruch statt Überschreiben", () => {
  const f = path.join(dir(), "chats.json");
  fs.writeFileSync(f, "{kaputt");
  assert.throws(() => new ChatStore(f), /beschädigt/);
  assert.equal(fs.readFileSync(f, "utf8"), "{kaputt", "Datei unverändert");
});

test("Atomares Schreiben hinterlässt keine Temp-Datei", () => {
  const d = dir(); const f = path.join(d, "x.json");
  writeJson(f, [1, 2]);
  assert.deepEqual(readJson(f), [1, 2]);
  assert.deepEqual(fs.readdirSync(d), ["x.json"]);
});
