import test from "node:test";
import assert from "node:assert/strict";
import { buildEnv, parseEnv, pickModels, PROVIDERS } from "../scripts/setup.js";

test("Modelle filtern: keine Audio/Embedding-Modelle, bei OpenRouter nur kostenlose", () => {
  const ids = ["b-model", "whisper-large-v3", "nomic-embed-text", "a-model:free", "c-model:free", "llama-guard-3"];
  assert.deepEqual(pickModels(ids, {}), ["a-model:free", "b-model", "c-model:free"]);
  const openrouter = PROVIDERS.find((p) => p.url.includes("openrouter"));
  assert.deepEqual(pickModels(ids, openrouter), ["a-model:free", "c-model:free"]);
});

test(".env schreiben und lesen", () => {
  const v = { LLM_BASE_URL: "http://localhost:11434/v1", LLM_API_KEY: "", LLM_MODEL: "llama3.1", SESSION_SECRET: "abc", PORT: "3005" };
  const back = parseEnv(buildEnv(v));
  for (const k of Object.keys(v)) assert.equal(back[k], v[k], k);
  assert.equal(parseEnv('X="mit Anführungszeichen"\r\nY=2').X, "mit Anführungszeichen", "Windows-Zeilenenden + Quotes");
});

test("Kostenlose Anbieter stehen zur Auswahl", () => {
  assert.ok(PROVIDERS.some((p) => p.noKey), "lokaler Anbieter ohne Key");
  assert.ok(PROVIDERS.every((p) => /^https:\/\//.test(p.url) || p.noKey), "Cloud-Anbieter nur per HTTPS");
});
