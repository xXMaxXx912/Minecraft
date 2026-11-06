# Rollenspiel-Chatbot 18+

Web-App für fiktive Rollenspiel-Chats mit KI-Figuren – ausschließlich für Erwachsene.

## Funktionen
- **Altersabfrage** (Geburtsdatum + Bestätigung), serverseitig per signiertem Cookie geprüft
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

## Eigene Figur anlegen
In `characters.json` einen Eintrag ergänzen: `id`, `name`, `age` (≥ 18), `greeting`, `persona`.

## Wichtig vor einer Veröffentlichung
- **Rechtliches:** In Deutschland verlangt der JMStV für pornografische Inhalte ein von der KJM anerkanntes
  **Altersverifikationssystem** (z. B. Ausweis-/VideoIdent). Die eingebaute Abfrage reicht dafür **nicht** –
  sie ist nur für den privaten Einsatz bzw. als Platzhalter gedacht. Außerdem: Impressum, Datenschutzerklärung (DSGVO).
- **Anbieter-Richtlinien:** Prüfe die Nutzungsbedingungen deines KI-Anbieters – viele erlauben keine expliziten Inhalte.
- Der Minderjährigen-Filter ist absichtlich streng und kann Fehlalarme auslösen (z. B. „15 Jahre Erfahrung“).
