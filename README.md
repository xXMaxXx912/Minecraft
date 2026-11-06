# Rollenspiel-Chatbot 18+

Web-App für fiktive Rollenspiel-Chats mit KI-Figuren – ausschließlich für Erwachsene.

## Funktionen
- **Benutzerkonten**: Registrieren (mit Altersprüfung), Anmelden, Abmelden, Passwort ändern, Konto löschen
  - Passwörter werden mit scrypt gehasht, Sitzungen per signiertem Cookie (30 Tage)
  - Das Geburtsdatum wird nur geprüft, **nicht gespeichert** – gespeichert wird nur, wann die Volljährigkeit bestätigt wurde
  - Nach 5 falschen Passwörtern wird der Login 15 Minuten gesperrt
  - Passwort ändern meldet alle anderen Geräte ab
- **Figuren** frei definierbar in `characters.json` (Server startet nicht, wenn eine Figur nicht eindeutig volljährig ist)
- **Beliebiger KI-Anbieter** über ein OpenAI-kompatibles API (OpenRouter, OpenAI, Ollama, LM Studio, …)
- **Feste Schutzregeln** (`safety.js`), die der Nutzer nicht aushebeln kann: nur Erwachsene, keine realen Personen, Einvernehmlichkeit/„Stopp“, Krisenhinweis
- Filter für Bezüge zu Minderjährigen – auf Eingabe **und** Ausgabe

## Start
```bash
npm install
cp .env.example .env   # API-URL, Key, Modell und SESSION_SECRET eintragen
npm start              # http://localhost:3000
npm test
```

## Eigene Figuren anlegen
- **Im Browser:** Im Chat auf „Eigene Figuren“ klicken (oder `/figuren.html` öffnen). Dort Name, Alter (≥ 18),
  Begrüßung und Beschreibung eingeben, speichern und mit „Chatten“ direkt loslegen. Eigene Figuren
  gehören zum jeweiligen Konto – andere Nutzer sehen sie nicht. Im Chat sind sie mit ★ markiert.
  Alle Eingaben werden serverseitig geprüft (Alter, Länge, Bezüge zu Minderjährigen). Max. 50 pro Konto.
- **Fest eingebaut (für alle):** In `characters.json` einen Eintrag ergänzen: `id`, `name`, `age` (≥ 18), `greeting`, `persona`.

## Daten
Konten und eigene Figuren liegen als JSON-Dateien in `data/` (Pfad änderbar über `DATA_DIR`):
`users.json` und `custom-characters.json`. Diesen Ordner regelmäßig sichern.
Chatverläufe werden nicht gespeichert – sie existieren nur im Browser, solange die Seite offen ist.

## Wichtig vor einer Veröffentlichung
- **HTTPS:** Im Internet nur hinter HTTPS betreiben (z. B. mit einem Reverse-Proxy wie Caddy oder nginx),
  sonst werden Passwörter unverschlüsselt übertragen. Bei einem Proxy in Express `app.set("trust proxy", 1)` setzen.
- **Rechtliches:** In Deutschland verlangt der JMStV für pornografische Inhalte ein von der KJM anerkanntes
  **Altersverifikationssystem** (z. B. Ausweis-/VideoIdent). Die eingebaute Abfrage reicht dafür **nicht** –
  sie ist nur für den privaten Einsatz bzw. als Platzhalter gedacht. Außerdem: Impressum, Datenschutzerklärung (DSGVO).
- **Anbieter-Richtlinien:** Prüfe die Nutzungsbedingungen deines KI-Anbieters – viele erlauben keine expliziten Inhalte.
- Der Minderjährigen-Filter ist absichtlich streng und kann Fehlalarme auslösen (z. B. „15 Jahre Erfahrung“).
