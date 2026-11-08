/// <reference lib="dom" />
import { test, expect, type Locator, type Page } from '@playwright/test';
import type { GameState } from '../../packages/domain/src/state.js';
import { openMenu } from './menu.js';

// Canvas point for an axial hex at the board's default zoom (1) and pan (0,0).
async function clickHex(canvas: Locator, q: number, r: number) {
  const b = (await canvas.boundingBox())!;
  const x = b.x + (32 + Math.sqrt(3) * 18 * (q + r / 2)) * (b.width / 984),
    y = b.y + (32 + 18 * 1.5 * r) * (b.height / 848);
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
}
async function start(page: Page, s: GameState) {
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status').first()).toContainText('Turn 1');
  await openMenu(page);
  await game.getByLabel('Load private save').setInputFiles({
    name: 'click.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await game.getByRole('button', { name: 'Close menu' }).click();
  return {
    game,
    canvas: game.getByLabel('Tactical hex arena'),
    commands: game.getByRole('region', { name: 'Commands' }),
  };
}

test('orders can be given entirely by clicking: move, attack, cast and inspect', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const s = createMatch('click', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[1]!.centre = { q: 8, r: 5 };
  s.creatures[0]!.spellbook = ['Magic Bolt'];
  const { game, canvas, commands } = await start(page, s);
  await clickHex(canvas, 5, 5);
  await expect(commands.getByRole('heading', { name: 'Wizard', exact: true })).toBeVisible();

  // Click-to-move: the route is planned and saved.
  await commands.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(commands.getByLabel('Board instruction')).toContainText('Click a bright hex to move there');
  await clickHex(canvas, 7, 5);
  await expect(commands.getByRole('button', { name: 'Move 2' })).toBeVisible();

  // Attack after moving, chosen from the action menu, by clicking the enemy wizard.
  await commands.getByRole('button', { name: /^After moving/ }).click();
  await commands.getByRole('menuitem', { name: 'Attack (Staff)' }).click();
  await clickHex(canvas, 8, 5);
  await expect(commands.getByRole('button', { name: 'After moving: Staff → Wizard' })).toBeVisible();

  // Before moving the enemy is out of reach, so the click is refused with an explanation.
  await commands.getByRole('button', { name: /^Before moving/ }).click();
  await commands.getByRole('menuitem', { name: 'Attack (Staff)' }).click();
  await clickHex(canvas, 8, 5);
  await expect(commands.locator('.notice')).toContainText('out of range or sight');
  await page.keyboard.press('Escape');

  // Cast Magic Bolt before moving through the nested spell menu; it replaces the one action.
  await commands.getByRole('button', { name: /^Before moving/ }).click();
  await commands.getByRole('menuitem', { name: 'Cast spell ▸' }).click();
  await commands.getByRole('menuitem', { name: 'Magic Bolt' }).click();
  await commands.getByRole('button', { name: 'Choose target' }).click();
  await clickHex(canvas, 8, 5);
  await expect(commands.getByRole('button', { name: 'Before moving: Magic Bolt 1 → Wizard' })).toBeVisible();
  await expect(commands.getByRole('button', { name: 'After moving: Action' })).toBeVisible();
  await expect(commands.getByText('one action a turn')).toBeVisible();
  await expect(commands.getByRole('button', { name: 'Move 2' })).toBeVisible();

  // Esc cancels a pending command.
  await commands.getByRole('button', { name: 'Move 2' }).click();
  await expect(commands.getByLabel('Board instruction')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(commands.getByLabel('Board instruction')).toHaveCount(0);

  // With nothing pending, clicking an enemy shows its details in a darker, read-only header.
  await clickHex(canvas, 8, 5);
  await expect(commands.getByRole('heading', { name: 'Enemy Wizard' })).toBeVisible();
  await expect(commands).toContainText('spellcaster');
  await expect(commands.getByRole('group', { name: 'This turn' })).toHaveCount(0);

  // End turn locks and resolves; the last-turn row reports what actually happened.
  await commands.getByRole('button', { name: 'Next' }).click();
  await commands.getByRole('button', { name: 'End turn' }).click();
  await expect(game.getByRole('status').first()).toContainText('Turn 2', { timeout: 30000 });
  const last = commands.getByRole('group', { name: 'Last turn' });
  await expect(last).toContainText('Cast Magic Bolt');
  await expect(last).toContainText('Moved 2');
});

test('summoning by clicking: only legal hexes are accepted, and the result is reported', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const s = createMatch('summon', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[1]!.centre = { q: 15, r: 12 };
  s.creatures[0]!.spellbook = ['Summon Cat'];
  const { game, canvas, commands } = await start(page, s);
  await clickHex(canvas, 5, 5);
  await commands.getByRole('button', { name: /^Before moving/ }).click();
  await commands.getByRole('menuitem', { name: 'Cast spell ▸' }).click();
  await commands.getByRole('menuitem', { name: 'Summon Cat' }).click();
  await commands.getByLabel('Summon variant').selectOption('illusion');
  await commands.getByRole('button', { name: 'Choose where to summon' }).click();
  await expect(commands.getByLabel('Board instruction')).toContainText('within 4 hexes');
  // Too far away: refused, and nothing is saved.
  await clickHex(canvas, 12, 5);
  await expect(commands.locator('.notice')).toContainText('out of range');
  await expect(commands.getByRole('button', { name: 'Before moving: Action' })).toBeVisible();
  // Close by: saved.
  await clickHex(canvas, 7, 5);
  await expect(commands.getByRole('button', { name: 'Before moving: Summon Cat 1 → hex' })).toBeVisible();
  await commands.getByRole('button', { name: 'End turn' }).click();
  await expect(game.getByRole('status').first()).toContainText('Turn 2', { timeout: 30000 });
  await expect(commands.getByRole('group', { name: 'Last turn' })).toContainText('Cast Summon Cat succeeded');
  // The new creature can be selected, with a plain description, and its last turn reads "Summoned".
  await clickHex(canvas, 7, 5);
  await expect(commands.getByRole('heading', { name: 'Cat familiar' })).toBeVisible();
  await expect(commands.locator('.description')).not.toBeEmpty();
  await expect(commands.getByRole('group', { name: 'Last turn' })).toContainText('Summoned');
});

test('Total Defence fills the whole turn', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const s = createMatch('defence', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  const { canvas, commands } = await start(page, s);
  await clickHex(canvas, 5, 5);
  await commands.getByRole('button', { name: 'Move', exact: true }).click();
  await clickHex(canvas, 6, 5);
  await expect(commands.getByRole('button', { name: 'Move 1' })).toBeVisible();
  await commands.getByRole('button', { name: /^After moving/ }).click();
  await commands.getByRole('menuitem', { name: 'Total Defence (whole turn)' }).click();
  await expect(commands.getByRole('button', { name: 'Whole turn: Total Defence' })).toBeVisible();
  await expect(commands.getByRole('button', { name: /^Move/ })).toHaveCount(0);
});
