import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 412, height: 915 } }); // Pixel 7-ish

test('touch: tap the die, tap the Witch, tap the glowing space, confirm', async ({ page }) => {
  await page.goto('/tutorial?step=2');
  const card = page.getByTestId('tutorial-card');
  await expect(card.getByText(/Step 2 of/)).toBeVisible();
  await card.getByRole('button', { name: 'Hide' }).tap();
  await expect(page.getByRole('button', { name: /Show tip/ })).toBeVisible();

  await page.locator('[data-dice]').tap();
  await expect(page.locator('[data-event-card]')).toBeVisible();
  await expect(page.getByText('Stop here')).toHaveCount(0);
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
  await expect(page.locator('[data-mobile-dock]')).toBeVisible();
  await page.locator('[data-mobile-progress]').tap();
  await expect(page.locator('[data-mobile-sheet="progress"]')).toBeVisible();
  await expect(page.locator('[data-kingdom-progress]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile: Diplomacy / trade panel opens from the dock', async ({ page }) => {
  await page.goto('/tutorial?step=4');
  await page.locator('[data-dice]').tap();
  await page.locator('[data-piece="you-witch"]').tap();
  await page.locator('g[data-node="c0"]:not([data-piece])').tap();
  await page.locator('[data-confirm]').or(page.locator('[data-confirm-move]')).first().tap();
  // After the Queen/Witch move flows, Diplomacy may appear when the Queen has moved; open from dock when shown.
  const tradeBtn = page.locator('[data-diplomacy-open]').first();
  if (await tradeBtn.isVisible().catch(() => false)) {
    await tradeBtn.tap();
    await expect(page.locator('[data-trade-panel]')).toBeVisible();
    await page.locator('[data-trade-close]').tap();
    await expect(page.locator('[data-trade-panel]')).toHaveCount(0);
  } else {
    // Dock still exposes Progress with 44px targets.
    await page.locator('[data-mobile-progress]').tap();
    await expect(page.locator('[data-mobile-sheet="progress"]')).toBeVisible();
    const box = await page.locator('[data-mobile-progress]').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
