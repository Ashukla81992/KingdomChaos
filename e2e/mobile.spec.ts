import { expect, test } from '@playwright/test';

test('touch: tap the die, tap the Witch, tap the glowing space, confirm', async ({ page }) => {
  await page.goto('/tutorial?step=2');
  const card = page.getByTestId('tutorial-card');
  await expect(card.getByText(/Step 2 of/)).toBeVisible();
  await card.getByRole('button', { name: 'Hide' }).tap();
  await expect(page.getByRole('button', { name: /Show tip/ })).toBeVisible();

  await page.locator('[data-dice]').tap();
  await page.getByRole('button', { name: /Show tip/ }).tap();
  await card.getByRole('button', { name: 'Next', exact: true }).tap();
  await expect(card.getByText(/Step 3 of/)).toBeVisible();
  await card.getByRole('button', { name: 'Hide' }).tap();

  await page.locator('[data-piece="you-witch"]').tap();
  await page.locator('g[data-node="c3"]:not([data-piece])').tap();
  await expect(page.locator('g[data-chosen="true"][data-node="c3"]')).toHaveCount(1);
  await expect(page.locator('[data-move-preview]')).toBeVisible();
  await page.locator('[data-confirm-move]').tap();
  await expect(page.locator('[data-piece="you-witch"]')).toHaveAttribute('data-node', 'c3');
  await page.getByRole('button', { name: /Show tip/ }).tap();
  await expect(card.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
});

test('practice game fits a phone: board, die and turn without sideways scrolling', async ({ page }) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Start practice' }).click();
  await expect(page.locator('[data-tutorial="board"]')).toBeVisible();
  await expect(page.locator('[data-art="island"]')).toBeVisible();
  const dice = page.locator('[data-dice]');
  await expect(dice).toBeEnabled({ timeout: 45_000 });
  await dice.tap();
  await expect(page.getByLabel('Actions this turn')).toContainText(/rolled \d/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
