/// <reference lib="dom" />
import { test, expect } from '@playwright/test';
for (const width of [390, 768, 1280])
  test(`local match loop at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const game = page.getByRole('region', { name: 'Local match' });
    await expect(game.getByRole('status')).toContainText('Turn 1');
    await game.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(game.getByText('Draft saved', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await game.getByRole('button', { name: 'Export private save' }).click();
    const file = await download;
    const path = await file.path();
    expect(path).toBeTruthy();
    await game.getByRole('button', { name: 'Lock turn', exact: true }).click();
    await game.getByRole('button', { name: 'Pause', exact: true }).click();
    await game.getByLabel('Playback').selectOption('1');
    await game.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(game.getByRole('status')).toContainText('Turn 2', { timeout: 30000 });
    await game.getByLabel('Load private save').setInputFiles(path!);
    await expect(game.getByRole('status')).toContainText('Turn 1');
    await expect(game.getByText('Draft saved', { exact: true })).toBeVisible();
  });
test('invalid imports preserve the current match', async ({ page }) => {
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await game
    .getByLabel('Load private save')
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(game.getByRole('alert')).toBeVisible();
  await expect(game.getByRole('status')).toContainText('Turn 1');
});
for (const pointerType of ['mouse', 'touch', 'pen'])
  test(`${pointerType} hex targeting draws a draft and pan does not edit it`, async ({ page }) => {
    const { createMatch } = await import('../../packages/engine/src/index.js');
    const state = createMatch('board-input', ['human', 'ai-1'], 123);
    state.creatures[0]!.centre = { q: 5, r: 5 };
    await page.goto('/');
    const game = page.getByRole('region', { name: 'Local match' });
    await expect(game.getByRole('status')).toContainText('Turn 1');
    await game
      .getByLabel('Load private save')
      .setInputFiles({ name: 'board.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
    await game.getByRole('button', { name: 'Draw path', exact: true }).click();
    const canvas = game.getByLabel('Tactical hex arena');
    const box = (await canvas.boundingBox())!;
    const x = box.x + ((32 + Math.sqrt(3) * 18 * (6 + 5 / 2)) * 0.65 * box.width) / 960,
      y = box.y + ((32 + 5 * 27) * 0.65 * box.height) / 640;
    await canvas.dispatchEvent('pointerdown', { pointerId: 1, pointerType, clientX: x, clientY: y, buttons: 1 });
    await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType, clientX: x, clientY: y });
    await expect(game.getByText('Added 6, 5', { exact: true })).toBeVisible();
    await game.getByRole('combobox', { name: 'Action', exact: true }).selectOption('Dash');
    await game.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(game.getByText('Draft saved', { exact: true })).toBeVisible();
    await game.getByRole('button', { name: 'Pan board', exact: true }).click();
    await canvas.dispatchEvent('pointerdown', { pointerId: 1, pointerType, clientX: x, clientY: y });
    await canvas.dispatchEvent('pointermove', { pointerId: 1, pointerType, clientX: x + 30, clientY: y + 20 });
    await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType });
    await expect(game.getByText('Added 6, 5', { exact: true })).toBeVisible();
  });
test('pinch and remaining finger never edit a path', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const s = createMatch('pinch', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await game
    .getByLabel('Load private save')
    .setInputFiles({ name: 'pinch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(s)) });
  await game.getByRole('button', { name: 'Draw path', exact: true }).click();
  const c = game.getByLabel('Tactical hex arena'),
    b = (await c.boundingBox())!,
    x = b.x + ((32 + Math.sqrt(3) * 18 * 8.5) * 0.65 * b.width) / 960,
    y = b.y + (167 * 0.65 * b.height) / 640;
  for (const id of [1, 2])
    await c.dispatchEvent('pointerdown', {
      pointerId: id,
      pointerType: 'touch',
      clientX: x + (id - 1) * 30,
      clientY: y,
    });
  await c.dispatchEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: x + 60, clientY: y });
  await c.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: x + 60, clientY: y });
  await c.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: x + 10, clientY: y });
  await c.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: x + 10, clientY: y });
  await expect(game.getByText('Stay here', { exact: true })).toBeVisible();
});
test('overlapping tokens select the last painted creature', async ({ page }) => {
  const { createMatch, createCreature } = await import('../../packages/engine/src/index.js');
  const s = createMatch('stack', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures.push(createCreature('top', 'human', { q: 5, r: 5 }, { species: 'Top creature', height: 'air' }));
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await game
    .getByLabel('Load private save')
    .setInputFiles({ name: 'stack.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(s)) });
  const c = game.getByLabel('Tactical hex arena'),
    b = (await c.boundingBox())!,
    x = b.x + ((32 + Math.sqrt(3) * 18 * 7.5) * 0.65 * b.width) / 960,
    y = b.y + (167 * 0.65 * b.height) / 640;
  await expect(game.getByRole('button', { name: /Top creature/ })).toBeVisible();
  await c.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
  await c.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
  await expect(game.getByRole('heading', { name: 'Top creature' })).toBeVisible();
});
test('spell editor saves summon variants and connected terrain drafts', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const s = createMatch('spell-ui', ['human', 'ai-1'], 123);
  s.creatures[0]!.centre = { q: 5, r: 5 };
  s.creatures[0]!.spellbook = ['Summon Cat', 'Darkness', 'Wall', 'Tangleweed'];
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await game
    .getByLabel('Load private save')
    .setInputFiles({ name: 'spells.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(s)) });
  await expect(game.getByText('Cast a spell', { exact: true })).toBeVisible();
  await game.getByText('Cast a spell', { exact: true }).click();
  await game.getByLabel('Path hex Q').fill('8');
  await game.getByLabel('Path hex R').fill('5');
  for (const spell of ['Summon Cat', 'Darkness', 'Wall', 'Tangleweed']) {
    await game.getByRole('combobox', { name: 'Spell family', exact: true }).selectOption(spell);
    if (spell === 'Summon Cat')
      await game.getByRole('combobox', { name: 'Summon variant', exact: true }).selectOption('illusion');
    if (spell === 'Wall') await game.getByRole('button', { name: 'Add wall edge', exact: true }).click();
    if (spell === 'Tangleweed') await game.getByRole('button', { name: 'Add spell hex', exact: true }).click();
    await game.getByRole('button', { name: 'Save spell draft', exact: true }).click();
    await expect(game.getByRole('alert')).toHaveCount(0);
    await expect(game.getByText('Draft saved', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await game.getByRole('button', { name: 'Export private save' }).click();
    const file = await download;
    const { readFileSync } = await import('node:fs');
    const saved = JSON.parse(readFileSync((await file.path())!, 'utf8'));
    expect(saved.orders[0].early.spell).toBe(spell);
    expect(saved.orders[0].early.variant).toBe(spell === 'Summon Cat' ? 'illusion' : 'bound');
  }
});
test('phase revision preserves the other phase and clears explicitly', async ({ page }) => {
  const { createMatch } = await import('../../packages/engine/src/index.js');
  const state = createMatch('phase-editor', ['human', 'ai-1'], 123);
  state.creatures[0]!.doubleAction = true;
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await game.getByLabel('Load private save').setInputFiles({
    name: 'double-action.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await game.getByRole('combobox', { name: 'Action', exact: true }).selectOption('Dash');
  await game.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toContainText('Early: Dash');
  await game.getByRole('combobox', { name: 'Timing', exact: true }).selectOption('late');
  await game.getByRole('combobox', { name: 'Action', exact: true }).selectOption('TotalDefence');
  await game.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(game.getByRole('alert')).toBeVisible();
  await expect(game.getByLabel('Saved order')).toContainText('Early: Dash');
  await expect(game.getByLabel('Saved order')).toContainText('Late: None');
  await game.getByRole('combobox', { name: 'Action', exact: true }).selectOption('Defend');
  await game.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toContainText('Late: Defend');
  await expect(game.getByLabel('Saved order')).toContainText('Early: Dash');
  await game.getByRole('button', { name: 'Clear selected phase', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toContainText('Late: None');
  await expect(game.getByLabel('Saved order')).toContainText('Early: Dash');
  await game.getByRole('button', { name: 'Clear whole order', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toHaveCount(0);
  await expect(game.getByText('No saved draft', { exact: true })).toBeVisible();
});
test('autosave resumes after refresh and recovers a corrupt latest checkpoint', async ({ page }) => {
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await game.getByRole('combobox', { name: 'Action', exact: true }).selectOption('Dash');
  await game.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(game.getByLabel('Local save status')).toHaveText('Saved locally.');
  await game.getByRole('combobox', { name: 'Action', exact: true }).selectOption('Defend');
  await game.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toContainText('Early: Defend');
  await page.reload();
  await game.getByRole('button', { name: 'Continue local match', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toContainText('Early: Defend');
  // An aborted write must not replace the committed record.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('spell-chaos-local', 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction('checkpoints', 'readwrite');
          tx.objectStore('checkpoints').put('{}', 'current');
          tx.onabort = () => {
            db.close();
            resolve();
          };
          tx.abort();
        };
      }),
  );
  await page.reload();
  await game.getByRole('button', { name: 'Continue local match', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toContainText('Early: Defend');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('spell-chaos-local', 1);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction('checkpoints', 'readwrite');
          tx.objectStore('checkpoints').put('{}', 'current');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await game.getByRole('button', { name: 'Continue local match', exact: true }).click();
  await expect(game.getByLabel('Saved order')).toContainText('Early: Dash');
  await expect(game.getByLabel('Local save status')).toHaveText('Recovered the previous local checkpoint.');
});
test('autosave restores an atomic resolution checkpoint exactly', async ({ page }) => {
  await page.goto('/');
  const game = page.getByRole('region', { name: 'Local match' });
  await expect(game.getByRole('status')).toContainText('Turn 1');
  await game.getByRole('button', { name: 'Lock turn', exact: true }).click();
  await game.getByRole('button', { name: 'Pause', exact: true }).click();
  await game.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(game.getByLabel('Local save status')).toHaveText('Saved locally.');
  async function snapshot() {
    const pending = page.waitForEvent('download');
    await game.getByRole('button', { name: 'Export private save' }).click();
    const download = await pending;
    const { readFileSync } = await import('node:fs');
    return readFileSync((await download.path())!, 'utf8');
  }
  const before = await snapshot();
  await page.reload();
  await game.getByRole('button', { name: 'Continue local match', exact: true }).click();
  await expect(game.getByLabel('Local save status')).toHaveText('Continued local match.');
  expect(await snapshot()).toBe(before);
});
