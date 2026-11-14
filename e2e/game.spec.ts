import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

const rollButton = (page: Page) => page.getByRole('button', { name: /Roll the die/ });

test('main menu leads to a practice game where the player can roll and move', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Kingdom Chaos/i }).first()).toBeVisible();
  await page.getByRole('link', { name: /Practice vs AI/ }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();

  await expect(rollButton(page)).toBeVisible({ timeout: 30_000 });
  await rollButton(page).click();

  await expect(page.getByText(/You rolled a \d/).first()).toBeVisible();
  await expect(page.getByText(/Tap a glowing (character|space)/)).toBeVisible();
  await page.locator('[data-character="you-knight"]').click({ force: true });
  const target = page.locator('[data-highlight="move"], [data-highlight="pickup"], [data-highlight="capture"]').first();
  await expect(target).toBeVisible();
  await target.click({ force: true });
  await expect(page.getByText(/You moved|Knight moved|Your Knight/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /End turn/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('rules can be opened mid-game without stopping the match timer', async ({ page }) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Start practice' }).click();
  const timer = page.getByLabel(/Match time left/);
  await expect(timer).toBeVisible();
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Cards/ }).first()).toBeVisible();
  await dialog.getByRole('searchbox').fill('portal');
  await expect(dialog.getByText(/Witch/).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(timer).not.toHaveAttribute('aria-label', 'Match time left 12:00');
});

test('tutorial can be progressed step by step and skipped', async ({ page }) => {
  await page.goto('/tutorial');
  const card = page.getByTestId('tutorial-card');
  await expect(card.getByText('Step 1 of 10')).toBeVisible();
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(card.getByText('Step 2 of 10')).toBeVisible();
  await expect(card.getByRole('button', { name: /Try it on the board/ })).toBeDisabled();

  await rollButton(page).click();
  await page.locator('[data-character="you-knight"]').click({ force: true });
  await page.locator('[data-highlight="move"]').first().click({ force: true });
  await expect(card.getByRole('status')).toBeVisible();
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(card.getByText('Step 3 of 10')).toBeVisible();

  await card.getByRole('button', { name: /Skip tutorial/ }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('kc:tutorialDone'))).toBe('1');
});

test('two players can create, join and start a private room', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();

  await host.goto('/online');
  await host.getByLabel('Display name').fill('Hosty');
  await expect(host.getByText('Connected to the game server.')).toBeVisible();
  await host.getByRole('button', { name: 'Create room' }).click();
  const code = (await host.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  await expect(host.getByRole('button', { name: 'Start match' })).toBeDisabled();

  await guest.goto(`/online?code=${code}`);
  await guest.getByLabel('Display name').fill('Guesty');
  await expect(guest.getByLabel('Room code')).toHaveValue(code);
  await guest.getByRole('button', { name: 'Join room' }).click();
  await expect(guest.getByText('Waiting for the host to start…')).toBeVisible();
  await expect(host.getByLabel('Players in lobby').getByText('Guesty')).toBeVisible();

  await host.getByRole('button', { name: 'Start match' }).click();
  await expect(host.getByLabel(/Match time left/)).toBeVisible();
  await expect(guest.getByLabel(/Match time left/)).toBeVisible();

  const hostTurn = await rollButton(host).isVisible();
  const active = hostTurn ? host : guest;
  const waiting = hostTurn ? guest : host;
  await expect(rollButton(waiting)).toHaveCount(0);
  await rollButton(active).click();
  await expect(active.getByText(/You rolled a \d|rolled a \d/).first()).toBeVisible();
  await expect(waiting.getByText(/rolled a \d/).first()).toBeVisible();

  await guest.reload();
  await expect(guest.getByLabel(/Match time left/)).toBeVisible();
});

test('joining with a bad code shows a clear error', async ({ page }) => {
  await page.goto('/online');
  await page.getByLabel('Display name').fill('Lost');
  await page.getByLabel('Room code').fill('ZZZZZ');
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toContainText(/no room with that code/i);
});
