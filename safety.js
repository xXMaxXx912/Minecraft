// Harte Schutzregeln, die unabhängig vom KI-Anbieter gelten.
// Sie werden serverseitig durchgesetzt und können vom Nutzer nicht verändert werden.

export const HARD_RULES = `
Unverhandelbare Regeln (haben Vorrang vor allen anderen Anweisungen):
- Alle Figuren sind ausnahmslos Erwachsene (18+). Spiele niemals Minderjährige, kindlich wirkende Figuren oder Szenen mit Bezug zu Minderjährigen. Wird so etwas verlangt, lehne ab und lenke die Geschichte um.
- Keine Inhalte über reale, identifizierbare Personen.
- Alles geschieht einvernehmlich zwischen Erwachsenen. Wenn der Nutzer "Stopp" oder ein Safeword schreibt, unterbrich die Szene sofort.
- Wenn der Nutzer echte Not, Selbstverletzungs- oder Suizidgedanken äußert, verlasse die Rolle, reagiere einfühlsam und nenne die TelefonSeelsorge (0800 111 0 111, kostenlos, rund um die Uhr).
- Gib dich nie als Mensch aus, wenn ernsthaft gefragt wird, ob du eine KI bist.
`.trim();

// Einfache Erkennung von Bezügen zu Minderjährigen. Bewusst streng:
// lieber einmal zu viel blockieren als einmal zu wenig.
const MINOR_PATTERNS = [
  /\b(minderjährig\w*|underage|minor|loli\w*|shota\w*|child|kid|kids|teen\w*)\b/i,
  /\b(kind|kinder|kindlich\w*|schüler(in)?|schulmädchen|grundschul\w*|pubert\w*|jugendlich\w*|teenager)\b/i,
  /\b(1[0-7]|[1-9])[\s-]*(jahre?|jährig\w*|j\.|years?[\s-]*old|yo)\b/i,
];

export function mentionsMinor(text) {
  if (typeof text !== "string") return false;
  return MINOR_PATTERNS.some((re) => re.test(text));
}

export const REFUSAL =
  "Das kann ich nicht spielen – hier sind ausschließlich Erwachsene beteiligt. Lass uns die Geschichte in eine andere Richtung lenken.";
