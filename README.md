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

## Eigene Figuren anlegen
- **Im Browser:** Im Chat auf „Eigene Figuren“ klicken (oder `/figuren.html` öffnen). Dort Name, Alter (≥ 18),
  Begrüßung und Beschreibung eingeben, speichern und mit „Chatten“ direkt loslegen. Eigene Figuren
  lassen sich dort auch wieder löschen und sind im Chat mit ★ markiert.
  Gespeichert werden sie in `data/custom-characters.json` (Pfad änderbar über `CUSTOM_CHARACTERS_FILE`).
  Alle Eingaben werden serverseitig geprüft (Alter, Länge, Bezüge zu Minderjährigen).
- **Fest eingebaut:** In `characters.json` einen Eintrag ergänzen: `id`, `name`, `age` (≥ 18), `greeting`, `persona`.

> Hinweis: Eigene Figuren gelten für alle Nutzer dieser Installation (es gibt noch keine Benutzerkonten).

## Wichtig vor einer Veröffentlichung
- **Rechtliches:** In Deutschland verlangt der JMStV für pornografische Inhalte ein von der KJM anerkanntes
  **Altersverifikationssystem** (z. B. Ausweis-/VideoIdent). Die eingebaute Abfrage reicht dafür **nicht** –
  sie ist nur für den privaten Einsatz bzw. als Platzhalter gedacht. Außerdem: Impressum, Datenschutzerklärung (DSGVO).
- **Anbieter-Richtlinien:** Prüfe die Nutzungsbedingungen deines KI-Anbieters – viele erlauben keine expliziten Inhalte.
- Der Minderjährigen-Filter ist absichtlich streng und kann Fehlalarme auslösen (z. B. „15 Jahre Erfahrung“).
