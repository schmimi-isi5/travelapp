#!/usr/bin/env node
// Doc 07 G1/G2: sucht Technikbegriffe und Textfehler in UI-Quelltexten (JSX-Strings).
// Aufruf: node scripts/design-audit/check-forbidden-strings.mjs [srcDirs…]
import fs from "node:fs";
import path from "node:path";

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["app", "src", "components"];
const rules = [
  { id: "G1", re: />[^<{]*\b(user_entered|unknown|running|Supabase|Row-Level-Security|Provider|Datensätze|Demo-Daten)\b[^<]*</ },
  { id: "G1", re: /["'`](unknown|owner|members)["'`]\s*[})]?\s*<\// },
  { id: "G2", re: /\b1 Nächte\b|\{\s*\w+\s*\}\s*Nächte/ },
  { id: "G2", re: /Min\.\./ },
  { id: "G3", re: /ca\.\s*\?\s*km|Quelle unbekannt/ },
  { id: "B3", re: /\b(text|bg|border)-(slate|blue|amber)-\d{2,3}\b/ },
  { id: "B2", re: /\btext-gold\b(?!-)/ },
  { id: "A3", re: /text-\[(10|11)px\]/ },
];
const skip = /node_modules|\.next|dist|build|\.test\.|\.spec\.|labels\.ts$/;
const hits = [];
function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (skip.test(p)) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx|jsx)$/.test(p)) {
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        for (const r of rules) if (r.re.test(line)) hits.push(`${r.id}  ${p}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
    }
  }
}
dirs.forEach(walk);
console.log(hits.length ? hits.join("\n") : "Keine Treffer.");
console.log(`\n${hits.length} Treffer (Hinweis: Regex-Heuristik – Treffer manuell bewerten).`);
process.exitCode = hits.length && process.env.STRICT === "1" ? 1 : 0;
