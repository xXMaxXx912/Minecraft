import test from "node:test";
import assert from "node:assert/strict";
import { mentionsMinor } from "../safety.js";
import { ageFromBirthdate } from "../server.js";

test("erkennt Bezüge zu Minderjährigen", () => {
  for (const t of ["sie ist 16 Jahre alt", "eine Schülerin", "underage", "15-jährig", "ein Teenager"]) {
    assert.equal(mentionsMinor(t), true, t);
  }
});

test("lässt normale Erwachsenen-Texte durch", () => {
  for (const t of ["Sie ist 29 Jahre alt", "Lass uns in die Bar gehen", "Ich bin 18 Jahre alt"]) {
    assert.equal(mentionsMinor(t), false, t);
  }
});

test("Altersberechnung", () => {
  const now = new Date("2026-11-06");
  assert.equal(ageFromBirthdate("2008-11-06", now), 18);
  assert.equal(ageFromBirthdate("2008-11-07", now), 17);
  assert.equal(ageFromBirthdate("quatsch", now), null);
});
