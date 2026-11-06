// Startet die iPhone-App lokal zum Ausprobieren: npm run iphone
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "iphone");
const port = Number(process.env.PORT) || 8080;
const app = express();
app.use(express.static(dir, { extensions: ["html"] }));
app.listen(port, "0.0.0.0", () => {
  console.log(`iPhone-App: http://localhost:${port}`);
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal);
  for (const i of lan) console.log(`Im WLAN:    http://${i.address}:${port}`);
});
