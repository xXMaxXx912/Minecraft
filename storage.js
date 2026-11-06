// Lesen/Schreiben der JSON-Datendateien.
import fs from "node:fs";
import path from "node:path";

// Liest eine JSON-Datei. Fehlt sie, gibt es den Standardwert.
// Ist sie beschädigt, wird NICHT mit leeren Daten weitergemacht (das würde beim nächsten
// Speichern alles überschreiben), sondern der Start mit einer klaren Meldung abgebrochen.
export function readJson(file, fallback = []) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Datendatei ist beschädigt: ${file}\n` +
        `(${err.message})\n` +
        `Bitte aus einer Sicherung wiederherstellen oder reparieren. Der Server startet nicht, damit keine Daten überschrieben werden.`,
    );
  }
}

// Schreibt atomar: erst in eine temporäre Datei, dann umbenennen.
// So bleibt bei einem Absturz mitten im Schreiben die alte Datei intakt.
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}
