import { expect, test } from '@playwright/test';

test('tutorial controls are reachable on a phone', async ({ page }) => {
  await page.goto('/tutorial');
  const card = page.getByTestId('tutorial-card');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(card.getByText('Step 2 of 10')).toBeVisible();
  await page.getByRole('button', { name: /Roll the die/ }).click();
  await page.locator('[data-character="you-knight"]').click({ force: true });
  await page.locator('[data-highlight="move"]').first().click({ force: true });
  await expect(card.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await card.getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByRole('button', { name: /Show tip/ })).toBeVisible();
});

test('practice game is usable on a phone', async ({ page }) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.locator('[data-tutorial="board"]')).toBeVisible();
  const roll = page.getByRole('button', { name: /Roll the die/ });
  await expect(roll).toBeVisible({ timeout: 30_000 });
  await roll.click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
