// End-to-end coverage: boot, renderer, nonblank canvas, movement, jump,
// swim, joystick UI, shell collection + cave unlock + treasure, time of day,
// and audio state. Runs on desktop and mobile Playwright projects.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const STATE = () => page => page.evaluate(() => window.__tropicalIsland.getState());

async function boot(page) {
  // Tolerate a transient dev-server restart between tests.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await page.goto('/', { timeout: 15_000 });
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await page.waitForTimeout(1500);
    }
  }
  await page.waitForFunction(() => window.__tropicalIsland, null, { timeout: 20_000 });
}

async function startGame(page) {
  await page.locator('#startBtn').click();
  await expect(page.locator('#loading')).toHaveClass(/hidden/);
  await page.waitForTimeout(400);
}

test('boot: overlay, start, renderer alive, wildlife counts', async ({ page }, testInfo) => {
  await boot(page);
  await expect(page.locator('#startBtn')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Tropical Island');

  // Pre-start: audio must not be unlocked and must not error.
  let state = await STATE()(page);
  expect(state.started).toBe(false);
  expect(state.audio.unlocked).toBe(false);

  await startGame(page);
  state = await STATE()(page);
  expect(state.started).toBe(true);
  expect(state.renderer.type).toBe('webgl');
  expect(state.renderer.drawCalls).toBeGreaterThan(12);
  expect(state.renderer.triangles).toBeGreaterThan(20_000);
  expect(state.wildlife.gulls).toBe(12);
  expect(state.wildlife.fishSchools).toBeGreaterThanOrEqual(2);
  expect(state.wildlife.crabs).toBeGreaterThanOrEqual(6);
  expect(state.audio.unlocked).toBe(true);
  expect(['high', 'medium', 'low']).toContain(state.quality.tier);

  // Visual QA screenshot for the iterative loop.
  mkdirSync('shots', { recursive: true });
  await page.screenshot({ path: `shots/${testInfo.project.name}-day.png` });
});

test('canvas renders a nonblank, colorful scene', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.waitForTimeout(600);
  const stats = await page.evaluate(() => {
    const gl = document.getElementById('scene');
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 60;
    const g = c.getContext('2d');
    g.drawImage(gl, 0, 0, 96, 60);
    const d = g.getImageData(0, 0, 96, 60).data;
    const colors = new Set();
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) {
      colors.add(((d[i] >> 3) << 6) | ((d[i + 1] >> 3) << 3) | (d[i + 2] >> 6));
      lum += d[i] + d[i + 1] + d[i + 2];
    }
    return { unique: colors.size, avgLum: lum / (d.length / 4) / 3 };
  });
  expect(stats.unique).toBeGreaterThan(24);
  expect(stats.avgLum).toBeGreaterThan(12);
});

test('movement: keyboard walk + deterministic simulateMove', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => window.__tropicalIsland.setPlayerPosition(0, 0));
  const before = (await STATE()(page)).player;
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  const afterKeys = (await STATE()(page)).player;
  const moved = Math.hypot(afterKeys.x - before.x, afterKeys.z - before.z);
  expect(moved).toBeGreaterThan(1.5);

  const simBefore = (await STATE()(page)).player;
  await page.evaluate(() => window.__tropicalIsland.simulateMove(1, 0, 1));
  const simAfter = (await STATE()(page)).player;
  expect(simAfter.x - simBefore.x).toBeGreaterThan(3);
});

test('jump launches the player and they land again', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => window.__tropicalIsland.setPlayerPosition(0, 0));
  await page.waitForTimeout(300);
  const ground = (await STATE()(page)).player.y;
  await page.evaluate(() => window.__tropicalIsland.simulateJump());
  let peak = ground;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(80);
    const y = (await STATE()(page)).player.y;
    peak = Math.max(peak, y);
    if (peak > ground + 0.4) break;
  }
  expect(peak).toBeGreaterThan(ground + 0.4);
  await page.waitForTimeout(1500);
  const landed = (await STATE()(page)).player;
  expect(Math.abs(landed.y - ground)).toBeLessThan(0.4);
  expect(landed.onGround).toBe(true);
});

test('swimming: slower swim mode engages in deep water and disengages on land', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => window.__tropicalIsland.setPlayerPosition(160, 160));
  await page.waitForTimeout(1500);
  let state = await STATE()(page);
  expect(state.biome).toBe('ocean');
  expect(state.player.swimming).toBe(true);
  // Swim forward and confirm the capped swim speed.
  await page.evaluate(() => window.__tropicalIsland.simulateMove(1, 0, 1.2));
  state = await STATE()(page);
  const swimSpeed = Math.hypot(state.player.vx, state.player.vz);
  expect(swimSpeed).toBeLessThan(3.2);
  expect(state.player.swimming).toBe(true);

  await page.evaluate(() => window.__tropicalIsland.setPlayerPosition(0, 0));
  await page.waitForTimeout(600);
  state = await STATE()(page);
  expect(state.player.swimming).toBe(false);
});

test('touch joystick UI drives the player', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#jumpBtn')).toBeVisible();

  await page.evaluate(() => window.__tropicalIsland.setPlayerPosition(0, 0));
  await page.waitForTimeout(200);
  const before = (await STATE()(page)).player;

  const box = await page.locator('#joystick').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(({ cx, cy }) => {
    const el = document.getElementById('joystick');
    el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: cx, clientY: cy, bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: cx, clientY: cy - 40, bubbles: true }));
  }, { cx, cy });
  // Frame-rate independent: poll until the player has been pushed along.
  let after = before;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    after = (await STATE()(page)).player;
    if (Math.hypot(after.x - before.x, after.z - before.z) > 1.0) break;
  }
  await page.evaluate(() => {
    document.getElementById('joystick').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }));
  });
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1.0);

  // Jump button queues a jump too; poll so slow emulated frames cannot miss it.
  await page.locator('#jumpBtn').dispatchEvent('pointerdown');
  let jumped = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(100);
    const p = (await STATE()(page)).player;
    if (p.vy > 0.5 || !p.onGround) {
      jumped = true;
      break;
    }
  }
  expect(jumped).toBe(true);
});

test('shells: collect all 7, cave unlocks, treasure reveal fires in the cave', async ({ page }) => {
  await boot(page);
  await startGame(page);
  await expect(page.locator('#shells')).toHaveText('🐚 0/7');

  for (let i = 0; i < 7; i++) {
    await page.evaluate((i) => window.__tropicalIsland.teleportToShell(i), i);
    await page.waitForTimeout(180);
  }
  await expect(page.locator('#shells')).toHaveText('🐚 7/7');
  let state = await STATE()(page);
  expect(state.shells.collected).toBe(7);
  expect(state.shells.caveUnlocked).toBe(true);

  await page.evaluate(() => window.__tropicalIsland.enterCave());
  await page.waitForTimeout(400);
  state = await STATE()(page);
  expect(state.shells.treasureRevealed).toBe(true);

  mkdirSync('shots', { recursive: true });
  await page.screenshot({ path: 'shots/treasure.png' });
});

test('time of day: six-minute cycle responds to setTimeOfDay', async ({ page }, testInfo) => {
  await boot(page);
  await startGame(page);
  await page.evaluate(() => window.__tropicalIsland.setTimeOfDay(0.5));
  await page.waitForTimeout(250);
  expect((await STATE()(page)).phase).toBe('day');

  await page.evaluate(() => window.__tropicalIsland.setTimeOfDay(0));
  await page.waitForTimeout(250);
  const night = await STATE()(page);
  expect(night.phase).toBe('night');

  mkdirSync('shots', { recursive: true });
  await page.screenshot({ path: `shots/${testInfo.project.name}-night.png` });

  await page.evaluate(() => window.__tropicalIsland.setTimeOfDay(0.75));
  await page.waitForTimeout(250);
  expect((await STATE()(page)).phase).toBe('sunset');
  await page.screenshot({ path: `shots/${testInfo.project.name}-sunset.png` });
});
