// Prüft vor "npm start"/"npm test", ob "npm install" gelaufen ist,
// und gibt sonst eine verständliche Anleitung statt eines langen Fehlers aus.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const pkg = require("./package.json");

const missing = Object.keys(pkg.dependencies || {}).filter((name) => {
  try {
    require.resolve(`${name}/package.json`);
    return false;
  } catch {
    return true;
  }
});

if (missing.length) {
  const ps = process.platform === "win32" ? "\n   (in PowerShell:  npm.cmd install)" : "";
  console.error(
    `\n✖ Es fehlen Pakete: ${missing.join(", ")}\n\n` +
      `   Bitte zuerst in diesem Ordner ausführen:\n\n      npm install${ps}\n\n` +
      `   Ordner: ${root}\n` +
      `   Tipp: Jeder neu heruntergeladene/entpackte Ordner braucht einmal "npm install".\n`,
  );
  process.exit(1);
}
