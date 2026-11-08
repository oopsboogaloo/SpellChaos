/// <reference lib="dom" />
import { test, expect, type Locator } from '@playwright/test';

// Canvas point for an axial hex at the board's default zoom (0.65) and pan (0,0).
async function clickHex(canvas: Locator, q: number, r: number) {
  const b = (await canvas.boundingBox())!;
  const x = b.x + (32 + Math.sqrt(3) * 18 * (q + r / 2)) * 0.65 * (b.width / 960),
    y = b.y + (32 + 18 * 1.5 * r) * 0.65 * (b.height / 640);
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
  await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
}

test('orders can be given entirely by clicking: move, attack, cast and inspect', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const s = createMatch('click', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[1]!.centre = { q: 8, r: 5 };
  s.creatures[0]!.spellbook = ['Magic Bolt'];
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status').first()).toContainText('Turn 1');
  await game.getByLabel('Load private save').setInputFiles({
    name: 'click.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(s)),
  });
  const canvas = game.getByLabel('Tactical hex arena'),
    commands = game.getByRole('region', { name: 'Commands' }),
    summary = commands.getByLabel('Planned order');
  await clickHex(canvas, 5, 5);
  await expect(commands.getByRole('heading', { name: 'Wizard' })).toBeVisible();

  // Click-to-move: the route is planned and saved.
  await commands.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(commands.getByLabel('Board instruction')).toContainText('Click a bright hex to move there');
  await clickHex(canvas, 7, 5);
  await expect(summary).toContainText('Move: 2 hexes');

  // Attack after moving by clicking the enemy wizard.
  await commands.getByRole('button', { name: 'Act after moving' }).click();
  await commands.getByRole('button', { name: /^Attack:/ }).click();
  await clickHex(canvas, 8, 5);
  await expect(summary).toContainText('After moving: Staff Wizard');

  // Before moving the enemy is out of reach, so the click is refused with an explanation.
  await commands.getByRole('button', { name: 'Act before moving' }).click();
  await commands.getByRole('button', { name: /^Attack:/ }).click();
  await clickHex(canvas, 8, 5);
  await expect(game.locator('.notice')).toContainText('out of range or sight');
  await page.keyboard.press('Escape');

  // Cast Magic Bolt before moving by clicking the target.
  await commands.getByRole('button', { name: 'Magic Bolt', exact: true }).click();
  await commands.getByRole('button', { name: 'Choose target for Magic Bolt' }).click();
  await clickHex(canvas, 8, 5);
  await expect(summary).toContainText('Before moving: cast Magic Bolt (level 1) on Wizard');
  await expect(summary).toContainText('After moving: nothing');
  await expect(game.getByText('one action a turn')).toBeVisible();
  await expect(summary).toContainText('Move: 2 hexes');

  // Esc cancels a pending command.
  await commands.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(commands.getByLabel('Board instruction')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(commands.getByLabel('Board instruction')).toHaveCount(0);

  // With nothing pending, clicking an enemy shows its details.
  await clickHex(canvas, 8, 5);
  await expect(game.getByRole('region', { name: 'Inspect' })).toContainText('Player 2');
  await expect(game.getByRole('region', { name: 'Inspect' })).toContainText('spellcaster');

  // The roster marks the creature as having orders.
  await expect(game.getByRole('region', { name: 'Roster' }).or(game.getByLabel('Roster'))).toContainText('✓ Wizard');
});

test('summoning by clicking: only legal hexes are accepted, and the result is reported', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const s = createMatch('summon', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[1]!.centre = { q: 15, r: 12 };
  s.creatures[0]!.spellbook = ['Summon Cat'];
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status').first()).toContainText('Turn 1');
  await game.getByLabel('Load private save').setInputFiles({
    name: 'summon.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(s)),
  });
  const canvas = game.getByLabel('Tactical hex arena'),
    commands = game.getByRole('region', { name: 'Commands' }),
    summary = commands.getByLabel('Planned order');
  await clickHex(canvas, 5, 5);
  await commands.getByRole('button', { name: 'Summon Cat', exact: true }).click();
  await commands.getByLabel('Summon variant').selectOption('illusion');
  await commands.getByRole('button', { name: 'Choose where to summon' }).click();
  await expect(commands.getByLabel('Board instruction')).toContainText('within 4 hexes');
  // Too far away: refused, and nothing is saved.
  await clickHex(canvas, 12, 5);
  await expect(game.locator('.notice')).toContainText('out of range');
  await expect(summary).toContainText('Before moving: nothing');
  // Close by: saved.
  await clickHex(canvas, 7, 5);
  await expect(summary).toContainText('Before moving: cast Summon Cat (level 1) at a hex');
  await game.getByRole('button', { name: 'Lock turn' }).click();
  await game.getByRole('button', { name: 'Resolve turn' }).click();
  const last = game.getByRole('region', { name: 'Last turn' });
  await expect(last).toContainText('Cat familiar appears');
  // The new creature can be inspected, with a plain description.
  await clickHex(canvas, 7, 5);
  await expect(commands.getByRole('heading', { name: 'Cat familiar' })).toBeVisible();
  await expect(commands.locator('.description')).not.toBeEmpty();
});
