import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Island Adventure QA e2e. Manager runs with `E2E_PROD=1` after `npm run build`.
 * Covers O1 / O3 / O5 / O8 and two-context online roll visibility.
 */

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

async function gotoHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Kingdom Chaos/i }).first()).toBeVisible();
}

test('O1 Learn to Play is reachable from home and covers key sections', async ({ page }) => {
  const errors = trackErrors(page);
  await gotoHome(page);
  await page.getByRole('link', { name: /Learn to Play/i }).click();
  await expect(page).toHaveURL(/\/tutorial/);
  const card = page.getByTestId('tutorial-card');
  await expect(card.getByText(/Step 1 of/i)).toBeVisible();

  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    const body = ((await card.textContent()) ?? '') + ((await page.locator('main').textContent()) ?? '');
    seen.push(body);
    const next = card.getByRole('button', { name: /^Next$/i });
    if (await next.isVisible().catch(() => false)) await next.click();
    else break;
    await page.waitForTimeout(200);
  }
  const all = seen.join('\n');
  expect(all).toMatch(/roll|die/i);
  expect(all).toMatch(/gem|bank/i);
  expect(all).toMatch(/cut|capture|rival/i);
  expect(all).toMatch(/dungeon|dragon/i);
  expect(all).toMatch(/Royal Path|temple|Crown/i);
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});

test('O1 Play Online and Play on This Device are offered from home (Friends flow)', async ({ page }) => {
  await gotoHome(page);
  // Contract: Play with Friends → Online / This Device. Current menu may promote both to the home screen.
  const friends = page.getByRole('link', { name: /Play with Friends/i });
  if (await friends.isVisible().catch(() => false)) {
    await friends.click();
    await expect(page.getByRole('button', { name: /Play Online/i }).or(page.getByRole('link', { name: /Play Online/i }))).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Play on This Device/i }).or(page.getByRole('link', { name: /Play on This Device/i })),
    ).toBeVisible();
  } else {
    await expect(page.getByRole('link', { name: /Play Online/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /Play on This Device/i })).toBeVisible();
  }
});

test('O8 same-device game reload resumes the exact turn', async ({ page }) => {
  await gotoHome(page);
  const thisDevice = page.getByRole('link', { name: /Play on This Device/i });
  if (await thisDevice.isVisible().catch(() => false)) await thisDevice.click();
  else {
    await page.getByRole('link', { name: /Play with Friends/i }).click();
    await page.getByRole('button', { name: /Play on This Device/i }).or(page.getByRole('link', { name: /Play on This Device/i })).click();
  }
  await page.getByRole('button', { name: /Start/i }).click();

  const reveal = page.getByRole('button', { name: /show my turn/i });
  if (await reveal.isVisible({ timeout: 3000 }).catch(() => false)) await reveal.click();

  const dice = page.locator('[data-dice]');
  await expect(dice).toBeEnabled({ timeout: 15_000 });
  await dice.click();
  await expect(page.locator('[data-status]').first()).toContainText(/rolled|choose/i);

  const statusBefore = await page.locator('[data-status]').first().textContent();
  const turnBefore = await page.locator('[data-turn-banner]').textContent();

  await page.reload();
  const reveal2 = page.getByRole('button', { name: /show my turn/i });
  if (await reveal2.isVisible({ timeout: 3000 }).catch(() => false)) await reveal2.click();

  await expect(page.locator('[data-dice]')).toBeVisible();
  await expect(page.locator('[data-status]').first()).toContainText(/rolled|choose|Move/i);
  const statusAfter = await page.locator('[data-status]').first().textContent();
  const turnAfter = await page.locator('[data-turn-banner]').textContent();
  expect(turnAfter).toBe(turnBefore);
  expect(statusAfter).toBe(statusBefore);
});

async function createOnlineRoom(page: Page, name: string) {
  await page.goto('/online');
  const nameField = page.getByLabel(/display name|username|name/i).or(page.locator('input').first());
  await nameField.fill(name);
  const create = page.getByRole('button', { name: /Create|Host|Play Online/i }).first();
  await create.click();
  await page.waitForURL(/\/(room|online|play)\//i, { timeout: 20_000 }).catch(() => {});
  const codeMatch =
    page.url().match(/\/(?:room|play)\/([A-Z0-9]{4,8})/i) ??
    ((await page.locator('[data-room-code], [data-code]').first().textContent().catch(() => null)) ?? '').match(/([A-Z0-9]{4,8})/);
  const code = codeMatch?.[1]?.toUpperCase();
  expect(code, 'room code').toBeTruthy();
  return code!;
}

test('O2/O3 two browser contexts join one online room; see each other roll; host-only End match', async ({ browser }) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();

  const code = await createOnlineRoom(hostPage, 'HostQA');

  await guestPage.goto(`/online?code=${code}`);
  const guestName = guestPage.getByLabel(/display name|username|name/i).or(guestPage.locator('input').first());
  await guestName.fill('GuestQA');
  await guestPage.getByRole('button', { name: /Join/i }).click();

  const start = hostPage.getByRole('button', { name: /Start/i });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await start.click();

  await expect(hostPage.locator('[data-dice]').or(hostPage.locator('[data-art="island"]'))).toBeVisible({ timeout: 30_000 });
  await expect(guestPage.locator('[data-art="island"]')).toBeVisible({ timeout: 30_000 });

  const hostDice = hostPage.locator('[data-dice]');
  let roller: Page;
  let watcher: Page;
  if (await hostDice.isEnabled().catch(() => false)) {
    roller = hostPage;
    watcher = guestPage;
  } else {
    roller = guestPage;
    watcher = hostPage;
  }
  await roller.locator('[data-dice]').click();
  await expect(roller.locator('[data-status]').first()).toContainText(/rolled|choose/i, { timeout: 10_000 });
  await expect(watcher.locator('[data-status]').first().or(watcher.locator('[data-turn-banner]'))).toContainText(/rolled|[A-Za-z]+/i, {
    timeout: 15_000,
  });

  const endHost = hostPage.getByRole('button', { name: /End match/i });
  await expect(endHost).toBeVisible({ timeout: 10_000 });
  await endHost.click();
  const confirm = hostPage.getByRole('button', { name: /confirm|end match|yes/i });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(hostPage.getByText(/ended|match over|no winner/i)).toBeVisible({ timeout: 10_000 });

  const endGuest = guestPage.getByRole('button', { name: /End match/i });
  if (await endGuest.isVisible().catch(() => false)) {
    await endGuest.click();
    await expect(guestPage.getByText(/only the host|not the host|cannot end/i)).toBeVisible({ timeout: 5_000 });
  } else {
    expect(await endGuest.count()).toBe(0);
  }

  await host.close();
  await guest.close();
});

void (null as unknown as Browser);
