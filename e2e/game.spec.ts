import { expect, test, type Locator, type Page } from '@playwright/test';
import { CROWN_QUEST } from '../src/engine/board';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

const dice = (page: Page) => page.locator('[data-dice]');
const space = (page: Page, node: string) => page.locator(`g[data-node="${node}"]:not([data-piece])`);
const piece = (page: Page, id: string) => page.locator(`[data-piece="${id}"]`);
const status = (page: Page) => page.locator('[data-status]').first();
const center = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** The centre of a space (its first circle is the hit area, centred on the space). */
const spot = (page: Page, node: string) => space(page, node).locator('circle').first();

/** Preview a move to `node` (unless it is already previewed) and confirm it. */
async function moveTo(page: Page, node?: string) {
  const target = node ? space(page, node) : page.locator('g[data-end="true"]').first();
  if ((await page.locator('g[data-chosen="true"]').count()) === 0 || (node && (await target.getAttribute('data-chosen')) !== 'true')) await target.click();
  await page.locator('[data-confirm]').click();
}

async function tutorialStep(page: Page, n: number) {
  await page.goto(n > 1 ? `/tutorial?step=${n}` : '/tutorial');
  const card = page.getByTestId('tutorial-card');
  await expect(card.getByText(new RegExp(`Step ${n} of 11`))).toBeVisible();
  return card;
}

test('practice: roll, pick a piece, preview, move, and the turn passes to the AI', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Kingdom Chaos/i }).first()).toBeVisible();
  await page.getByRole('link', { name: /Practice vs AI/ }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();

  await expect(page.locator('[data-art="island"]')).toBeVisible();
  await expect(dice(page)).toBeEnabled({ timeout: 45_000 });
  await expect(page.locator('[data-turn-banner]')).toContainText(/Your turn/i);
  await expect(status(page)).toContainText('Roll the die');
  await dice(page).click();

  const mine = page.locator('[data-piece][data-owner="you"][data-movable="true"]');
  await expect(mine.first()).toBeVisible();
  await mine.first().click();
  await expect(page.locator('g[data-end="true"]').first()).toBeVisible();
  if ((await page.locator('g[data-chosen="true"]').count()) === 0) await page.locator('g[data-end="true"]').first().click();
  await expect(page.locator('[data-move-preview]')).toBeVisible();
  await expect(status(page)).toContainText(/^Move your .* to /);
  await page.locator('[data-confirm]').click();
  await expect(page.getByLabel('Actions this turn').or(page.locator('[data-turn-banner]', { hasText: /'s turn/ })).first()).toBeVisible();
  // Finish the turn, and any extra turns a 6 or a cut earned.
  for (let i = 0; i < 8 && /Your turn/i.test((await page.locator('[data-turn-banner]').textContent()) ?? ''); i++) {
    const endTurn = page.locator('[data-end-turn]');
    if (await endTurn.isVisible()) await endTurn.click();
    else if (await dice(page).isEnabled()) {
      await dice(page).click();
      const next = page.locator('[data-piece][data-owner="you"][data-movable="true"]');
      if (await next.first().isVisible().catch(() => false)) {
        await next.first().click();
        await moveTo(page);
      }
    }
    await page.waitForTimeout(400);
  }
  await expect(page.locator('[data-turn-banner]')).not.toContainText(/Your turn/i);
  await expect(dice(page)).toBeDisabled();
  // The AI plays its turn and hands back.
  await expect(page.locator('[data-turn-banner]')).toContainText(/Your turn/i, { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('rolling and moving: a piece leaves the castle with the whole roll, passes a gem station and carries the gem', async ({ page }) => {
  const card = await tutorialStep(page, 2);
  await dice(page).click();
  await expect(status(page)).toContainText('You rolled 4 — choose a piece');
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(card.getByText(/Step 3 of 11/)).toBeVisible();

  await piece(page, 'you-witch').click();
  // Roads run both ways and branch: several ends glow, each using the whole roll.
  await expect(page.locator('g[data-end="true"]')).toHaveCount(4);
  await space(page, 'c3').click();
  await expect(status(page)).toContainText('Move your Witch to');
  await expect(page.locator('[data-move-preview]')).toBeVisible();
  await expect(page.locator('[data-status-sub]')).toContainText('Picks up the Ruby');

  // A space that is not a legal end explains why and changes nothing.
  await space(page, 'c2').click();
  await expect(page.locator('[data-toast]')).toContainText(/all 4 steps|whole roll/);
  await expect(piece(page, 'you-witch')).toHaveAttribute('data-node', 'home-red');

  await expect(page.locator('g[data-chosen="true"][data-node="c3"]')).toHaveCount(1);
  await page.locator('[data-confirm-move]').click();
  await expect(piece(page, 'you-witch')).toHaveAttribute('data-node', 'c3');
  await expect(piece(page, 'you-witch').locator('[data-carrying="ruby"]')).toHaveCount(1);
  await expect(page.locator('[data-gem-kind="ruby"]')).toHaveAttribute('data-gem-state', 'carrying');
  await expect(card.getByRole('status')).toContainText('picked up a Ruby');
});

test('collect and bank: reaching your gate banks the gem and touching its plate finishes the lap', async ({ page }) => {
  const card = await tutorialStep(page, 4);
  await dice(page).click();
  await piece(page, 'you-witch').click();
  await space(page, 'c0').click();
  await expect(page.locator('[data-status-sub]')).toContainText('Banks the Ruby');
  await expect(page.locator('[data-status-sub]')).toContainText('Touches the Red plate — lap complete!');
  await space(page, 'c0').click();
  await expect(page.locator('[data-gem-kind="ruby"]')).toHaveAttribute('data-gem-state', 'banked');
  await expect(page.locator('[data-lap="4"]')).toBeVisible();
  await expect(card.getByRole('status')).toContainText('RUBY BANKED');
});

test('cut and steal: landing on a rival sends it home and takes its gem', async ({ page }) => {
  const card = await tutorialStep(page, 5);
  await dice(page).click();
  await piece(page, 'you-knight').click();
  await space(page, 'c4').click();
  await expect(page.locator('[data-status-sub]')).toContainText("Cuts Alex's Witch");
  await expect(page.locator('[data-status-sub]')).toContainText('extra turn');
  await page.locator('[data-confirm]').click();
  await expect(piece(page, 'foe-witch')).toHaveAttribute('data-node', 'home-purple');
  await expect(page.locator('[data-extra-status]')).toBeVisible();
  await expect(piece(page, 'you-knight').locator('[data-carrying="sapphire"]')).toHaveCount(1);
  await expect(page.locator('[data-cut="done"]')).toBeVisible();
  await expect(card.getByRole('status')).toContainText('CUT!');
});

test('drag a piece to a glowing space to move; an invalid drop sends it back with a reason', async ({ page }) => {
  await tutorialStep(page, 5);
  await dice(page).click();
  const from = await center(piece(page, 'you-knight'));
  const bad = await center(spot(page, 'c6'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(bad.x, bad.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('[data-toast]')).toContainText(/went back/);
  await expect(piece(page, 'you-knight')).toHaveAttribute('data-node', 'c7');

  const again = await center(piece(page, 'you-knight'));
  const good = await center(spot(page, 'c4'));
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.move(good.x, good.y, { steps: 12 });
  await page.mouse.up();
  await expect(piece(page, 'you-knight')).toHaveAttribute('data-node', 'c4');
});

test('dungeon: walk to the Dragon Gate, enter, see the dungeon map, and climb back out', async ({ page }) => {
  const card = await tutorialStep(page, 8);
  await dice(page).click();
  await piece(page, 'you-witch').click();
  await moveTo(page, 'c16');
  await page.locator('[data-adventure-option="enterDungeon"]').click();
  await expect(page.locator('[data-art="dungeon"]')).toBeVisible();
  await expect(piece(page, 'you-witch')).toHaveAttribute('data-node', 'd-entrance');
  // Alex (AI) takes a turn, then it is yours again.
  await expect(page.locator('[data-turn-banner]')).toContainText(/Your turn/i, { timeout: 15_000 });
  await page.getByRole('button', { name: 'Island' }).click();
  await expect(page.locator('[data-dungeon-indicator="1"]')).toBeVisible();
  await page.locator('[data-adventure-option="leaveDungeon"]').click();
  await expect(page.locator('[data-art="island"]')).toBeVisible();
  await expect(piece(page, 'you-witch')).toHaveAttribute('data-node', 'c16');
  await expect(card.getByRole('status')).toContainText('Back on the island');
});

test('cards: Shield a piece, then rebuild the Broken Bridge with a map card', async ({ page }) => {
  let card = await tutorialStep(page, 6);
  await page.locator('[data-card="shield"]').click();
  await page.locator('[data-highlight="target"]', { hasText: /Queen/ }).click();
  await expect(piece(page, 'you-queen')).toHaveAttribute('aria-label', /Shield/);
  await expect(card.getByRole('status')).toContainText('Shielded');
  card = await tutorialStep(page, 7);
  await page.locator('[data-card="build_bridge"]').click();
  await page.locator('[data-highlight="target"]').first().click();
  await expect(card.getByRole('status')).toContainText('Rope Bridge is open');
});

test('Royal Path and an exact landing on the Crown Temple win', async ({ page }) => {
  let card = await tutorialStep(page, 9);
  await expect(page.locator('[data-final="open"]')).toBeVisible();
  await expect(page.locator('[data-royal-path]')).toHaveCount(0);
  await dice(page).click();
  await piece(page, 'you-king').click();
  await expect(page.locator('[data-royal-path="play"]')).toHaveCount(0);
  await space(page, 'f-red-1').click();
  await expect(page.locator('[data-announcer]')).toContainText(/touched 0 of 4 house plates/);
  await expect(space(page, 'f-red-1')).not.toHaveAttribute('data-end', 'true');
  await expect(piece(page, 'you-king')).toHaveAttribute('data-node', 'home-red');
  await piece(page, 'you-queen').click();
  await expect(page.locator('[data-royal-path="play"]')).not.toHaveCount(0);
  await expect(page.locator('[data-royal-house="1"], [data-royal-house="2"], [data-royal-house="3"]')).toHaveCount(0);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-royal-path="play"]')).toHaveCount(0);
  await piece(page, 'you-queen').click();
  await expect(page.locator('g[data-end="true"]')).toHaveCount(3);
  await space(page, 'f-red-1').click();
  await expect(page.locator('[data-status-sub]')).toContainText('Turns onto your Royal Path');
  await page.locator('[data-confirm]').click();
  await expect(page.locator('[data-royal-path="play"]')).toHaveCount(0);
  await expect(card.getByRole('status')).toContainText('On the Royal Path');
  card = await tutorialStep(page, 10);
  await dice(page).click();
  await piece(page, 'you-queen').click();
  await moveTo(page, 'temple');
  await expect(card.getByRole('status')).toContainText('The Red house wins');
});

test('the keyboard alone can roll, choose a piece, preview and confirm', async ({ page }) => {
  const card = await tutorialStep(page, 2);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('r');
  await expect(dice(page)).toBeDisabled();
  await card.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('[data-character="you-witch"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-announcer]')).toContainText(/4 places to go/);
  await space(page, 'c3').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-status-sub]')).toContainText('Picks up the Ruby');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('m');
  await expect(piece(page, 'you-witch')).toHaveAttribute('data-node', 'c3');
});

test('spaces stay on the painted roads after resizing and zooming', async ({ page }) => {
  await page.goto('/tutorial');
  const image = page.locator('[data-art="island"]');
  await expect(image).toBeVisible();
  const ids = ['c0', 'c10', 'c20', 'c30', 'c5', 'temple', 'c4'];
  const check = async () => {
    const box = (await image.boundingBox())!;
    for (const id of ids) {
      const n = CROWN_QUEST.nodes.find((x) => x.id === id)!;
      const c = await center(spot(page, id));
      expect(Math.abs(((c.x - box.x) / box.width) * 1024 - n.xy[0]), `${id} x`).toBeLessThan(8);
      expect(Math.abs(((c.y - box.y) / box.height) * 1024 - n.xy[1]), `${id} y`).toBeLessThan(8);
    }
  };
  await check();
  await page.getByRole('button', { name: 'Legend' }).click();
  await page.getByRole('checkbox', { name: /Show Royal Paths/ }).check();
  await page.getByRole('button', { name: 'Close' }).click();
  ids.push('f-blue-3');
  await expect(page.locator('[data-royal-path="inspect"]')).not.toHaveCount(0);
  await expect(page.locator('[data-royal-playable="true"]')).toHaveCount(0);
  await check();
  await page.setViewportSize({ width: 1000, height: 720 });
  await check();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('svg[data-board]')).not.toHaveAttribute('data-zoom', '1.00');
  await page.waitForTimeout(400);
  await check();
  await page.getByRole('button', { name: 'Reset zoom' }).click();
  await expect(page.locator('svg[data-board]')).toHaveAttribute('data-zoom', '1.00');
});

test('Royal Paths stay hidden until unlocked, and inspection cannot make one playable', async ({ page }) => {
  await tutorialStep(page, 1);
  await expect(page.locator('[data-royal-path]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Legend' }).click();
  await page.getByRole('checkbox', { name: /Show Royal Paths/ }).check();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-royal-path="inspect"]')).not.toHaveCount(0);
  await expect(page.locator('[data-royal-playable="true"]')).toHaveCount(0);
  await expect(page.locator('g[data-end="true"]')).toHaveCount(0);
  await space(page, 'f-red-1').click();
  await expect(page.getByRole('region', { name: 'Details' })).toContainText(/Not a shortcut/);
  await expect(piece(page, 'you-witch')).toHaveAttribute('data-node', 'home-red');
  await page.getByRole('button', { name: 'Hide Royal Paths' }).click();
  await expect(page.locator('[data-royal-path]')).toHaveCount(0);
});

test('banking the last gem after a cut announces that the temple path is unlocked', async ({ page }) => {
  await page.goto('/tutorial?fixture=unlock');
  await expect(page.locator('[data-fixture="unlock"]')).toBeAttached();
  await expect(page.locator('[data-royal-path="play"]')).toHaveCount(0);
  await dice(page).click();
  await piece(page, 'you-witch').click();
  await moveTo(page, 'c0');
  await expect(page.getByText('Temple path unlocked!')).toBeVisible();
  await expect(page.locator('[data-royal-path="play"]')).toHaveCount(0);
  await expect(piece(page, 'you-witch')).toHaveAttribute('data-node', 'c0');
});

test('tap a space to explain it, and the legend lists every marker', async ({ page }) => {
  await tutorialStep(page, 1);
  const details = page.getByRole('region', { name: 'Details' });
  await space(page, 'c2').click();
  await expect(details).toContainText(/Ruby/);
  await space(page, 'c13').click();
  await expect(details).toContainText(/Magic Lift/);
  await space(page, 'temple').click();
  await expect(details).toContainText(/Crown Temple/);
  await page.locator('[data-glyph$="-bridge"]').first().click();
  await expect(details).toContainText(/Bridge/);
  await page.getByRole('button', { name: 'Legend' }).click();
  const guide = page.locator('[data-map-guide]');
  for (const t of ['Pieces', 'Safe space', 'House gate', 'Fork', 'Royal Path', 'Gem stations', 'Trap', 'Shortcut', 'Dig site', 'Dragon Gate', 'Boat', 'Plane', 'Broken bridge', 'Dragon']) await expect(guide).toContainText(t);
});

test('rules open mid-game without stopping the match timer', async ({ page }) => {
  await page.goto('/practice');
  await page.getByRole('radio', { name: 'Timed' }).click();
  await page.getByRole('button', { name: 'Start practice' }).click();
  const timer = page.getByLabel(/Match time left/);
  await expect(timer).toBeVisible();
  const before = await timer.getAttribute('aria-label');
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /House plates and the lap/ })).toBeVisible();
  await dialog.getByRole('searchbox').fill('portal');
  await expect(dialog.getByText(/Witch/).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(timer).not.toHaveAttribute('aria-label', before!);
});

test('rules sit left of the board, and the turn and cards sit on the right', async ({ page }) => {
  await tutorialStep(page, 4);
  const rules = page.locator('[data-rules-rail]');
  const board = page.locator('[data-play-column="board"]');
  const turn = page.locator('[data-play-column="turn"]');
  await expect(rules).toBeVisible();
  await expect(page.locator('[data-final="locked"]')).toBeVisible();
  await expect(page.locator('[data-gem-state="needed"]').first()).toBeVisible();
  const [rulesBox, boardBox, turnBox] = await Promise.all([rules.boundingBox(), board.boundingBox(), turn.boundingBox()]);
  expect(rulesBox!.x + rulesBox!.width).toBeLessThanOrEqual(boardBox!.x + 4);
  expect(turnBox!.x).toBeGreaterThanOrEqual(boardBox!.x + boardBox!.width - 4);
  await piece(page, 'you-witch').click();
  await expect(page.locator('[data-character="you-witch"] [data-plate-check="blue"]')).toHaveAttribute('data-done', 'true');
  await expect(page.locator('[data-character="you-witch"] [data-plate-check="red"]')).toHaveAttribute('data-done', 'false');
  await rules.getByRole('searchbox').fill('dragon');
  await expect(rules.locator('[data-guide-section="dragon"]')).toBeVisible();
  await rules.getByRole('searchbox').fill('extra turn');
  await expect(rules.locator('[data-guide-section="cuts"]')).toBeVisible();
  await expect(rules.locator('[data-guide-section="dragon"]')).toHaveCount(0);
  await expect(turn.locator('[data-tutorial="actions"]')).toBeVisible();
  await expect(turn.locator('[data-tutorial="hand"]')).toBeVisible();
});

test('on a phone the guide opens as a Rules & Guide drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await tutorialStep(page, 1);
  await page.locator('[data-guide-open]').click();
  const dialog = page.getByRole('dialog', { name: 'Rules & Guide' });
  await expect(dialog.locator('[data-guide-progress]')).toBeVisible();
  await dialog.locator('[data-guide-tab="rules"]').click();
  await dialog.getByRole('searchbox').fill('plate');
  await expect(dialog.locator('[data-guide-section="plates"]')).toBeVisible();
});

test('the full tutorial can be skipped and is remembered', async ({ page }) => {
  const errors = trackErrors(page);
  const card = await tutorialStep(page, 1);
  await expect(page.locator('[data-final="locked"]')).toBeVisible();
  await card.getByRole('button', { name: /Skip tutorial/ }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('kc:tutorialDone'))).toBe('1');
  expect(errors).toEqual([]);
});

test('two players can create, join and start a private room, and only the active player can roll', async ({ browser }) => {
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

  await host.getByRole('radio', { name: 'Timed' }).click();
  await host.getByRole('button', { name: 'Start match' }).click();
  await expect(host.getByLabel(/Match time left/)).toBeVisible();
  await expect(guest.getByLabel(/Match time left/)).toBeVisible();

  await expect(host.locator('[data-turn-banner]')).toBeVisible();
  const hostTurn = /Your turn/i.test((await host.locator('[data-turn-banner]').textContent()) ?? '');
  const active = hostTurn ? host : guest;
  const waiting = hostTurn ? guest : host;
  await expect(waiting.locator('[data-turn-banner]')).toContainText(/'s turn/);
  await expect(dice(waiting)).toBeDisabled();
  await expect(waiting.locator('[data-piece][data-movable="true"]')).toHaveCount(0);
  await dice(active).click();
  await expect(active.getByLabel('Actions this turn')).toContainText(/rolled \d/);
  await expect(waiting.locator('[data-feed]')).toContainText(/rolled \d/);

  const mover = active.locator('[data-piece][data-movable="true"]').first();
  const id = (await mover.getAttribute('data-piece'))!;
  await mover.click();
  await moveTo(active);
  await expect(active.locator(`[data-piece="${id}"]`)).not.toHaveAttribute('data-node', /^home-/);
  const landed = (await active.locator(`[data-piece="${id}"]`).getAttribute('data-node'))!;
  await expect(waiting.locator(`[data-piece="${id}"]`)).toHaveAttribute('data-node', landed);

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
