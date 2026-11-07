import {test,expect} from '@playwright/test';
for(const width of [390,768,1280])test(`local match loop at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/');const game=page.getByRole('region',{name:'Local match'});
 await expect(game.getByRole('status')).toContainText('Turn 1');
 await game.getByRole('button',{name:'Save draft',exact:true}).click();await expect(game.getByText('Draft saved',{exact:true})).toBeVisible();
 const download=page.waitForEvent('download');await game.getByRole('button',{name:'Export private save'}).click();const file=await download;const path=await file.path();expect(path).toBeTruthy();
 await game.getByRole('button',{name:'Lock turn',exact:true}).click();await game.getByRole('button',{name:'Pause',exact:true}).click();await game.getByLabel('Playback').selectOption('1');await game.getByRole('button',{name:'Play',exact:true}).click();await expect(game.getByRole('status')).toContainText('Turn 2',{timeout:30000});
 await game.getByLabel('Load private save').setInputFiles(path!);await expect(game.getByRole('status')).toContainText('Turn 1');await expect(game.getByText('Draft saved',{exact:true})).toBeVisible();
});
test('invalid imports preserve the current match',async({page})=>{await page.goto('/');const game=page.getByRole('region',{name:'Local match'});await expect(game.getByRole('status')).toContainText('Turn 1');await game.getByLabel('Load private save').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(game.getByRole('alert')).toBeVisible();await expect(game.getByRole('status')).toContainText('Turn 1');});
