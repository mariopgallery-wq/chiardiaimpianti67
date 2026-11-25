import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('planned-work and additional-work section bands share the same navy treatment', () => {
  assert.match(css, /\.quote-work-band\s*\{[^}]*background:\s*#19286f[^}]*color:\s*#fff/s);
  assert.match(css, /\.quote-extra-work-band\s*\{[^}]*background:\s*#19286f\s*!important[^}]*color:\s*#fff\s*!important/s);
});

test('description-table headers use a distinct darker blue than the section bands', () => {
  assert.match(css, /\.quote-work-table thead tr\s*\{\s*background:\s*#526B98/s);
  assert.match(css, /\.quote-work-table th\s*\{[^}]*background:\s*#526B98/s);
  assert.notEqual('#526B98'.toLowerCase(), '#19286f'.toLowerCase());
});

test('printed description-table headers keep the same darker blue', () => {
  assert.match(css, /\.quote-work-table thead tr\s*\{\s*background:\s*#526B98\s*!important/s);
  assert.match(css, /\.quote-work-table th\s*\{[^}]*background:\s*#526B98\s*!important/s);
});

test('total, taxable amount and VAT use aligned label and amount columns without horizontal inset', () => {
  assert.match(css, /\.quote-totals\s*>\s*\.quote-total-row\s*\{[^}]*display:\s*grid\s*!important[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content\s*!important/s);
  assert.match(css, /\.quote-totals\s*>\s*\.quote-total-row\s*\{[^}]*padding-left:\s*0\s*!important[^}]*padding-right:\s*0\s*!important/s);
  assert.match(css, /\.quote-totals\s*>\s*\.quote-total-row\s*>\s*strong\s*\{[^}]*justify-self:\s*end\s*!important[^}]*text-align:\s*right\s*!important/s);
});
