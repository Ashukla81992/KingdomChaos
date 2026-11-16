import { expect, test } from '@playwright/test';

test.describe('online play (HTTP)', () => {
  test('main menu offers Play Online and Play on This Device', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Play Online/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Play on This Device/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Practice vs AI/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Learn to Play/i })).toBeVisible();
  });

  test('online page shows sign-in without RealtimeNotice gating', async ({ page }) => {
    await page.goto('/online');
    await expect(page.getByRole('heading', { name: /Sign in|Create an account/i })).toBeVisible();
    await expect(page.getByText(/cannot run|Realtime|Socket/i)).toHaveCount(0);
  });

  test('hot-seat setup is reachable as Play on This Device', async ({ page }) => {
    await page.goto('/hotseat');
    await expect(page.getByText(/Take turns on one screen/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Start game/i })).toBeVisible();
  });
});
