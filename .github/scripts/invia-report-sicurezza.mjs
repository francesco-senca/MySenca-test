// Copyright (c) 2026 Giovanni Arborio Mella. All rights reserved.
//
// Eseguito da GitHub Actions dopo `npm audit --json` su backend e frontend: legge
// i due file JSON prodotti, li riduce a un riepilogo compatto (conteggi per
// severità + elenco pacchetti/advisory) e lo invia al backend in produzione.
import { readFileSync, appendFileSync } from "node:fs";

function parseAuditOutput(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { totali: 0, perSeverita: {}, dettagli: [] };
  }

  // `npm audit --json` (npm 9+) mette le vulnerabilità sotto "vulnerabilities",
  // una per pacchetto di primo livello coinvolto, con "via" che elenca gli advisory.
  const vulnerabilities = raw.vulnerabilities || {};
  const perSeverita = {};
  const dettagli = [];

  for (const [pacchetto, info] of Object.entries(vulnerabilities)) {
    const severita = info.severity || "low";
    perSeverita[severita] = (perSeverita[severita] || 0) + 1;

    const via = Array.isArray(info.via) ? info.via : [];
    for (const v of via) {
      if (typeof v === "object" && v.title) {
        dettagli.push({
          pacchetto,
          severita: v.severity || severita,
          titolo: v.title,
          url: v.url || ""
        });
      }
    }
  }

  const totali = Object.values(perSeverita).reduce((a, b) => a + b, 0);
  return { totali, perSeverita, dettagli: dettagli.slice(0, 50) };
}

const report = {
  dataControllo: new Date().toISOString(),
  backend: parseAuditOutput("audit-backend.json"),
  frontend: parseAuditOutput("audit-frontend.json")
};

// Riepilogo leggibile nella pagina della run (GITHUB_STEP_SUMMARY), sempre,
// così il risultato si vede anche quando l'invio al backend non è configurato.
function scriviRiepilogo(nota) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const riga = (nome, r) =>
    `| ${nome} | ${r.totali} | ${["critical", "high", "moderate", "low"].map(s => r.perSeverita[s] || 0).join(" | ")} |`;
  const dettagli = [...report.backend.dettagli.map(d => ({ ...d, parte: "backend" })),
                    ...report.frontend.dettagli.map(d => ({ ...d, parte: "frontend" }))]
    .map(d => `- **${d.parte}** \`${d.pacchetto}\` (${d.severita}): ${d.url ? `[${d.titolo}](${d.url})` : d.titolo}`);
  appendFileSync(file, [
    "## Controllo vulnerabilità dipendenze",
    "",
    "| Parte | Totale | Critical | High | Moderate | Low |",
    "|---|---|---|---|---|---|",
    riga("backend", report.backend),
    riga("frontend", report.frontend),
    "",
    ...(dettagli.length ? dettagli : ["Nessuna vulnerabilità nota."]),
    "",
    nota,
    ""
  ].join("\n"));
}

// Il job fallisce solo per vulnerabilità gravi o per un invio fallito, non per
// la configurazione mancante (es. fork o repository di test senza secret).
const gravi = ["critical", "high"].reduce(
  (n, s) => n + (report.backend.perSeverita[s] || 0) + (report.frontend.perSeverita[s] || 0), 0);
const esitoFinale = () => {
  if (gravi > 0) {
    console.log(`::error::${gravi} vulnerabilità critical/high nelle dipendenze: vedi il riepilogo della run.`);
    process.exit(1);
  }
};

const url = process.env.SECURITY_AUDIT_URL;
const secret = process.env.SECURITY_AUDIT_SECRET;

if (!url || !secret) {
  console.log("::warning::SECURITY_AUDIT_URL o SECURITY_AUDIT_SECRET non impostati: report non inviato al backend.");
  console.log(JSON.stringify(report, null, 2));
  scriviRiepilogo("_Report non inviato al backend: secret SECURITY_AUDIT_URL / SECURITY_AUDIT_SECRET non configurati._");
  esitoFinale();
  process.exit(0);
}

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Audit-Secret": secret },
  body: JSON.stringify(report)
});

if (!res.ok) {
  console.error(`Invio fallito: HTTP ${res.status} — ${await res.text()}`);
  scriviRiepilogo(`_Invio al backend fallito: HTTP ${res.status}._`);
  process.exit(1);
}

console.log(`Report inviato. Totale vulnerabilità — backend: ${report.backend.totali}, frontend: ${report.frontend.totali}.`);
scriviRiepilogo("_Report inviato al backend._");
esitoFinale();
