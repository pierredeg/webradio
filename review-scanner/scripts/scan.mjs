#!/usr/bin/env node
/**
 * CLI: scan a dataset JSON and print the report.
 *
 *   node scripts/scan.mjs src/fixtures/contaminated.json
 *   node scripts/scan.mjs data/architoi.json --json > report.json
 */
import { readFileSync } from 'node:fs';
import { analyze } from '../src/engine/index.js';

const [, , file, ...flags] = process.argv;
if (!file) {
  console.error('usage: node scripts/scan.mjs <dataset.json> [--json]');
  process.exit(1);
}

const report = analyze(JSON.parse(readFileSync(file, 'utf8')));

if (flags.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

console.log(`\n${report.place.name} — ${report.reviews.length} avis analysés`);
console.log('─'.repeat(64));
console.log(`Indice de signaux d'inauthenticité : ${pct(report.summary.estimate)}`);
console.log(`  intervalle (bootstrap 95%)       : ${pct(report.summary.low)} – ${pct(report.summary.high)}`);
console.log(`  avis au-dessus de 0,5            : ${report.summary.flaggedCount}`);
console.log(`  ${report.summary.interpretation.text}`);
if (!report.summary.sufficientData) console.log('  ⚠ échantillon insuffisant');

console.log('\nDistribution des notes');
for (let i = 5; i >= 1; i--) {
  const share = report.distribution.shares[i];
  const ref = report.distribution.reference[i];
  const bar = '█'.repeat(Math.round(share * 40));
  console.log(`  ${i}★ ${bar.padEnd(40)} ${pct(share).padStart(6)}  (réf ${pct(ref)})`);
}
console.log(`  déficit du milieu : ${pct(report.distribution.middleDeficit)} · anomalie : ${pct(report.distribution.anomaly)}`);

console.log('\nRafales temporelles');
if (!report.bursts.applicable) {
  console.log(`  non applicable (${report.bursts.reason})`);
} else if (report.bursts.windows.length === 0) {
  console.log(`  aucune (base ${report.bursts.baselineWeekly.toFixed(2)} avis/semaine)`);
} else {
  for (const w of report.bursts.windows) {
    console.log(
      `  ${w.startDate} → ${w.endDate} : ${w.count} avis (attendu ${w.expected.toFixed(1)}) ` +
        `· ${pct(w.homogeneity)} de ${w.dominantRating}★ · p=${w.pValue.toExponential(1)}`
    );
  }
}

console.log('\nTextes quasi identiques');
console.log(`  ${report.duplication.clusters.length} groupe(s) sur ${report.duplication.comparedCount} avis comparés`);

console.log('\nTop 5 des avis les plus signalés');
for (const r of report.reviews.slice(0, 5)) {
  const why = r.contributions.slice(0, 3).map((c) => c.label).join(' · ');
  console.log(`  ${pct(r.score).padStart(6)}  ${r.rating}★ ${r.publishedAt.slice(0, 10)}  ${why}`);
}
console.log();
