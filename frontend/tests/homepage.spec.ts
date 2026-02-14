import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const artifactsDir = path.resolve(process.cwd(), 'test-artifacts');

test('homepage shows projects and links to moire simulator', async ({ page }) => {
  fs.mkdirSync(artifactsDir, { recursive: true });
  await page.goto('/');

  await expect(page.locator('#whoami-section')).toBeVisible();
  await expect(page.locator('#projects-section')).toBeVisible({ timeout: 12_000 });

  const moireCard = page.locator('.project-card', {
    has: page.locator('.card-name', { hasText: 'moire-simulator' }),
  });
  await expect(moireCard).toBeVisible();
  await expect(moireCard).toHaveAttribute('href', '/projects/moire-simulator');
  await page.screenshot({ path: path.join(artifactsDir, 'homepage-projects.png'), fullPage: true });

  await moireCard.click();
  await expect(page).toHaveURL(/\/projects\/moire-simulator$/);
  await expect(page.locator('.eyebrow')).toHaveText('Moiré Simulator');
  await expect(page.locator('[data-testid="control-panel"]')).toBeVisible();
  await page.screenshot({ path: path.join(artifactsDir, 'homepage-to-moire.png'), fullPage: true });
});

test('homepage instant mode still renders projects', async ({ page }) => {
  await page.goto('/?instant=1');
  await expect(page.locator('#projects-section')).toBeVisible();
});
