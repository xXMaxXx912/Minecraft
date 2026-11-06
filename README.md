# Rollenspiel-Chatbot 18+

Web-App für fiktive Rollenspiel-Chats mit KI-Figuren – ausschließlich für Erwachsene.

## Funktionen
- **Benutzerkonten**: Registrieren (mit Altersprüfung), Anmelden, Abmelden, Passwort ändern, Konto löschen
  - Passwörter werden mit scrypt gehasht, Sitzungen per signiertem Cookie (30 Tage)
  - Das Geburtsdatum wird nur geprüft, **nicht gespeichert** – gespeichert wird nur, wann die Volljährigkeit bestätigt wurde
  - Nach 5 falschen Passwörtern wird der Login 15 Minuten gesperrt
  - Passwort ändern meldet alle anderen Geräte ab
- **Gespeicherte Gespräche** pro Konto: oben im Chat ein früheres Gespräch auswählen und weiterschreiben,
  mit „+ Neues Gespräch“ ein neues mit einer beliebigen Figur beginnen, mit 🗑 löschen.
  Ein neues Gespräch wird erst mit der ersten Nachricht gespeichert. Die KI bekommt jeweils die letzten
  40 Nachrichten als Gedächtnis. Max. 100 Gespräche pro Konto.
- **Figuren** frei definierbar in `characters.json` (Server startet nicht, wenn eine Figur nicht eindeutig volljährig ist)
- **Beliebiger KI-Anbieter** über ein OpenAI-kompatibles API (OpenRouter, OpenAI, Ollama, LM Studio, …)
- **Feste Schutzregeln** (`safety.js`), die der Nutzer nicht aushebeln kann: nur Erwachsene, keine realen Personen, Einvernehmlichkeit/„Stopp“, Krisenhinweis
- Filter für Bezüge zu Minderjährigen – auf Eingabe **und** Ausgabe

## Start
```bash
npm install
npm run setup          # Assistent: Key einfügen, Modell wählen – schreibt die .env
npm start              # http://localhost:3000
npm test
```

## iPhone-App ohne PC (empfohlen fürs iPhone)
Im Ordner `iphone/` liegt eine Version, die **komplett auf dem iPhone läuft** – ohne eigenen Server:
Figuren, Gespräche und der API-Key werden nur auf dem Gerät gespeichert (IndexedDB), und das iPhone
spricht direkt mit Grok (xAI erlaubt Browser-Zugriffe). Nach dem ersten Öffnen startet sie auch offline.

**Einmalig einrichten (GitHub Pages, kostenlos):**
1. Auf GitHub: Repository → **Settings → Pages** → bei „Source“ **„GitHub Actions“** wählen.
2. Repository → **Actions** → „iPhone-App veröffentlichen“ → **Run workflow** (läuft danach bei jeder Änderung automatisch).
3. Die App ist dann erreichbar unter **https://xxmaxxx912.github.io/Minecraft/**

**Auf dem iPhone:**
1. Die Adresse in **Safari** öffnen → Teilen (□↑) → **„Zum Home-Bildschirm“**.
2. App vom Home-Bildschirm starten, Alter bestätigen.
3. In den Einstellungen den **xAI-API-Key** eintragen (console.x.ai → API Keys) →
   „Verbindung testen & Modelle laden“ → Modell wählen → Speichern.

**Wichtig:**
- Die Daten liegen **nur auf diesem iPhone**. Über Einstellungen → „Sicherung exportieren“ regelmäßig
  eine Sicherung in der Dateien-App ablegen (der API-Key ist darin absichtlich nicht enthalten).
- Immer die App vom **Home-Bildschirm** benutzen: Safari kann Daten normaler Webseiten nach einigen
  Wochen ohne Nutzung löschen, Home-Bildschirm-Apps sind davon ausgenommen.
- Der API-Key wird nur an die eingetragene API-Adresse geschickt. Wer dein entsperrtes iPhone hat,
  kann die App öffnen – nutze bei Bedarf die iOS-Funktion „App sperren“/Bildschirmzeit.

Lokal ausprobieren: `npm run iphone` → http://localhost:8080

## Server-Version auf dem iPhone nutzen
Das iPhone kann den Server nicht selbst ausführen – der Server läuft auf einem PC/Mac oder im Internet,
das iPhone öffnet die App in Safari und kann sie wie eine normale App auf den Home-Bildschirm legen.

**Variante A – zu Hause im WLAN (am einfachsten):**
1. Auf dem PC `npm start` ausführen. Der Server zeigt zwei Adressen an, z. B.
   `Im WLAN (z. B. iPhone): http://192.168.178.23:3000`
2. iPhone im **selben WLAN** → Safari → diese Adresse öffnen.
3. Teilen-Symbol (□↑) → **„Zum Home-Bildschirm“**. Die App startet dann im Vollbild mit eigenem Icon.
4. Falls die Seite nicht lädt: Die Firewall des PCs muss Port 3000 erlauben (Windows fragt beim ersten Start nach).

**Variante B – von überall (Internet):** Auf einem Server oder Hoster (z. B. VPS, Render, Railway) betreiben,
**immer mit HTTPS** (z. B. Caddy oder nginx als Reverse-Proxy) und `TRUST_PROXY=1` in `.env` setzen.

Angepasst für iOS: Notch/Home-Leiste (Safe Areas), Eingabefeld bleibt über der Tastatur, kein Auto-Zoom
in Eingabefelder, Touch-Flächen ≥ 44 px, Querformat, kleine Geräte (iPhone SE).
Hinweis: Die Home-Bildschirm-App hat ihre eigenen Cookies – dort einmal separat anmelden.

> **Windows/PowerShell:** Falls „Ausführung von Skripts deaktiviert“ erscheint, `npm.cmd` statt `npm`
> verwenden (z. B. `npm.cmd run setup`) oder die Eingabeaufforderung (cmd) nutzen.
> Projektordner am besten **nicht** in OneDrive ablegen (z. B. `C:\Projekte\Minecraft`).

## Eigene Figuren anlegen
- **Im Browser:** Im Chat auf „Eigene Figuren“ klicken (oder `/figuren.html` öffnen). Dort Name, Alter (≥ 18),
  Begrüßung und Beschreibung eingeben, speichern und mit „Chatten“ direkt loslegen. Eigene Figuren
  gehören zum jeweiligen Konto – andere Nutzer sehen sie nicht. Im Chat sind sie mit ★ markiert.
  Alle Eingaben werden serverseitig geprüft (Alter, Länge, Bezüge zu Minderjährigen). Max. 50 pro Konto.
- **Fest eingebaut (für alle):** In `characters.json` einen Eintrag ergänzen: `id`, `name`, `age` (≥ 18), `greeting`, `persona`.

## Daten
Alles liegt als JSON-Dateien in `data/` (Pfad änderbar über `DATA_DIR`):
`users.json` (Konten), `custom-characters.json` (eigene Figuren), `chats.json` (Gespräche).
Diesen Ordner regelmäßig sichern. Dateien werden atomar geschrieben; ist eine Datei trotzdem
beschädigt, startet der Server bewusst **nicht** (statt sie mit leeren Daten zu überschreiben) und nennt die Datei. Gespräche werden **unverschlüsselt** gespeichert – wer Zugriff auf den
Server hat, kann sie lesen. Beim Löschen eines Kontos oder einer Figur werden die zugehörigen Gespräche mitgelöscht.

## Wichtig vor einer Veröffentlichung
- **HTTPS:** Im Internet nur hinter HTTPS betreiben (z. B. mit einem Reverse-Proxy wie Caddy oder nginx),
  sonst werden Passwörter unverschlüsselt übertragen. Bei einem Proxy in Express `app.set("trust proxy", 1)` setzen.
- **Rechtliches:** In Deutschland verlangt der JMStV für pornografische Inhalte ein von der KJM anerkanntes
  **Altersverifikationssystem** (z. B. Ausweis-/VideoIdent). Die eingebaute Abfrage reicht dafür **nicht** –
  sie ist nur für den privaten Einsatz bzw. als Platzhalter gedacht. Außerdem: Impressum, Datenschutzerklärung (DSGVO).
- **Anbieter-Richtlinien:** Prüfe die Nutzungsbedingungen deines KI-Anbieters – viele erlauben keine expliziten Inhalte.
- Der Minderjährigen-Filter ist absichtlich streng und kann Fehlalarme auslösen (z. B. „15 Jahre Erfahrung“).
