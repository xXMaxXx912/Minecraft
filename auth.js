// Benutzerkonten: Passwort-Hashing (scrypt), Speicherung als JSON-Datei,
// signierte Sitzungs-Cookies und eine einfache Sperre gegen Passwort-Raten.
import crypto from "node:crypto";
import { readJson, writeJson } from "./storage.js";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 Tage

export function ageFromBirthdate(birthdate, now = new Date()) {
  if (typeof birthdate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function validateRegistration({ username, password, birthdate, confirm }) {
  if (typeof username !== "string" || !/^[A-Za-z0-9_.-]{3,24}$/.test(username)) {
    return "Benutzername: 3–24 Zeichen, nur Buchstaben, Ziffern, _ . -";
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    return "Passwort muss mindestens 8 Zeichen lang sein.";
  }
  const age = ageFromBirthdate(birthdate);
  if (age === null || age < 0 || age > 120) return "Ungültiges Geburtsdatum.";
  if (age < 18 || confirm !== true) return "Dieser Bereich ist nur für Erwachsene ab 18 Jahren.";
  return null;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split(":");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Ein Hash, gegen den bei unbekannten Benutzernamen geprüft wird, damit die
// Antwortzeit nicht verrät, ob ein Konto existiert.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

export class UserStore {
  constructor(file) {
    this.file = file;
    this.users = readJson(file, []);
  }

  save() {
    writeJson(this.file, this.users);
  }

  byId(id) {
    return this.users.find((u) => u.id === id);
  }

  byName(username) {
    const key = String(username).toLowerCase();
    return this.users.find((u) => u.username.toLowerCase() === key);
  }

  create({ username, password }) {
    if (this.byName(username)) return null;
    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: hashPassword(password),
      // Gespeichert wird nur, dass und wann die Volljährigkeit bestätigt wurde – nicht das Geburtsdatum.
      ageConfirmedAt: new Date().toISOString(),
      sessionVersion: 1,
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    this.save();
    return user;
  }

  authenticate(username, password) {
    const user = this.byName(username);
    const ok = verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
    return ok && user ? user : null;
  }

  changePassword(user, newPassword) {
    user.passwordHash = hashPassword(newPassword);
    user.sessionVersion++; // meldet alle anderen Sitzungen ab
    this.save();
  }

  remove(id) {
    this.users = this.users.filter((u) => u.id !== id);
    this.save();
  }
}

export function createSessions(secret) {
  const sign = (value) => crypto.createHmac("sha256", secret).update(value).digest("hex");
  return {
    issue(user) {
      const value = `${user.id}.${user.sessionVersion}.${Date.now()}`;
      return `${value}.${sign(value)}`;
    },
    // Gibt die Benutzer-ID zurück, wenn das Token gültig ist.
    read(token, users) {
      if (typeof token !== "string") return null;
      const parts = token.split(".");
      if (parts.length !== 4) return null;
      const [id, version, issued, sig] = parts;
      const value = `${id}.${version}.${issued}`;
      const expected = sign(value);
      if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
      if (Date.now() - Number(issued) > SESSION_MAX_AGE) return null;
      const user = users.byId(id);
      if (!user || String(user.sessionVersion) !== version) return null;
      return user;
    },
  };
}

// Sperrt nach 5 Fehlversuchen für 15 Minuten (pro IP + Benutzername).
export function createLoginLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return {
    blocked(key) {
      const a = attempts.get(key);
      if (!a) return false;
      if (Date.now() - a.first > windowMs) {
        attempts.delete(key);
        return false;
      }
      return a.count >= max;
    },
    fail(key) {
      const a = attempts.get(key);
      if (!a || Date.now() - a.first > windowMs) attempts.set(key, { count: 1, first: Date.now() });
      else a.count++;
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
