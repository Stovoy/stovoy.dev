import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const artifactsDir = path.resolve(process.cwd(), 'test-artifacts');

async function setRange(page: Page, selector: string, value: number) {
  await page.locator(selector).evaluate((el, next) => {
    const input = el as HTMLInputElement;
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('moire simulator explorer renders and responds to controls', async ({ page }) => {
  fs.mkdirSync(artifactsDir, { recursive: true });

  await page.goto('/projects/moire-simulator');
  await expect(page.locator('.eyebrow')).toHaveText('Moiré Simulator');
  await expect(page.locator('[data-testid="control-panel"]')).toBeVisible({ timeout: 20_000 });

  const canvas = page.locator('[data-testid="moire-canvas"]');
  await expect(canvas).toBeVisible();

  await page.screenshot({ path: path.join(artifactsDir, 'moire-default.png'), fullPage: true });

  await setRange(page, '[data-testid="ctrl-frequency-a"]', 118);
  await setRange(page, '[data-testid="ctrl-frequency-b"]', 26);
  await setRange(page, '[data-testid="ctrl-resolution"]', 1.25);
  await page.locator('[data-testid="ctrl-blend-mode"]').selectOption('1');
  await page.locator('[data-testid="ctrl-animate"]').uncheck();

  const rangeCount = await page.locator('.grid-controls input[type="range"]').count();
  const numberCount = await page.locator('.grid-controls input[type="number"]').count();
  expect(numberCount).toBe(rangeCount);

  const frequencyANumber = page.locator('label:has([data-testid="ctrl-frequency-a"]) input[type="number"]');
  await frequencyANumber.fill('440');
  await frequencyANumber.blur();

  const widthANumber = page.locator('label:has-text("Width A") input[type="number"]');
  await widthANumber.fill('5');
  await widthANumber.blur();

  await expect(page.locator('text=Frequency A: 440.0')).toBeVisible();
  await expect(page.locator('text=Frequency B: 26.0')).toBeVisible();
  await expect(page.locator('text=Width A: 5.000')).toBeVisible();

  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(artifactsDir, 'moire-tuned.png'), fullPage: true });

  await page.locator('[data-testid="fullscreen-toggle"]').click();
  await expect(page.locator('[data-testid="control-panel"]')).toBeHidden();
  await expect(page.locator('[data-testid="moire-canvas"]')).toBeVisible();
  await page.screenshot({ path: path.join(artifactsDir, 'moire-fullscreen.png'), fullPage: true });

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="control-panel"]')).toBeVisible();
});
