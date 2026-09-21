// Visual QA helper: boots the game headless, teleports to landmarks, and
// saves screenshots into shots/. Run with the dev server on TIW_PORT:
//   TIW_PORT=4190 node scripts/qa-shots.js
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const port = process.env.TIW_PORT || 4190;
const base = `http://127.0.0.1:${port}`;

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base);
await page.waitForFunction(() => window.__tropicalIsland);
await page.click('#startBtn');
await page.waitForTimeout(800);

const shots = [
  { name: 'qa-spawn', t: 0.4, pos: null, wait: 600 },
  { name: 'qa-crater', t: 0.45, pos: [-62, -58], wait: 1500 },
  { name: 'qa-lagoon', t: 0.4, pos: [74, 70], wait: 1800 },
  { name: 'qa-beach-palms', t: 0.45, pos: [0, 60], wait: 900 },
  { name: 'qa-night', t: 0.0, pos: [0, 60], wait: 1200 }
];

for (const s of shots) {
  await page.evaluate((t) => window.__tropicalIsland.setTimeOfDay(t), s.t);
  if (s.pos) {
    await page.evaluate((p) => window.__tropicalIsland.setPlayerPosition(p[0], p[1]), s.pos);
  }
  if (s.move) {
    await page.evaluate((m) => window.__tropicalIsland.simulateMove(m[0], m[1], 0.4), s.move);
  }
  await page.waitForTimeout(s.wait);
  await page.screenshot({ path: `shots/${s.name}.png` });
  console.log('saved', s.name);
}
await browser.close();
