/// <reference lib="dom" />
import {test,expect} from '@playwright/test';
import {createMatch,createCreature} from '../../packages/engine/src/index.js';
import {summonProfile} from '../../packages/content/src/summons.js';
import {readFileSync} from 'node:fs';
for(const mode of ['blink','flight','drag','multi','guard','structure'])test(`tactical ${mode} saves an ordinary engine order`,async({page})=>{
 const s=createMatch(`tactical-${mode}`,['human','ai-1'],123),profile=mode==='blink'?summonProfile('Summon Cat',5)!:mode==='flight'?summonProfile('Summon Serpent',6)!:mode==='drag'?summonProfile('Summon Cat',7)!:summonProfile('Summon Serpent',7)!;
 s.creatures[0]!.centre={q:3,r:3};s.creatures[1]!.centre={q:15,r:15};s.creatures.push(createCreature('actor','human',{q:10,r:5},profile),createCreature('target','ai-1',{q:13,r:5}));if(mode==='drag')s.holds.push({grapplerId:'actor',targetId:'target',limb:0});s.walls.push({id:'wall',edge:{a:{q:16,r:5},b:{q:17,r:5}},material:'stone',hp:10,maxHp:10,burning:null});
 await page.goto('/');const game=page.getByRole('region',{name:'Local match'});await expect(game.getByRole('status')).toContainText('Turn 1');await game.getByLabel('Load private save').setInputFiles({name:'tactical.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});await game.getByRole('button',{name:new RegExp(profile.species!)}).click();await game.getByText('Tactical orders',{exact:true}).click();
 if(['blink','flight','drag'].includes(mode)){
  await game.getByLabel('Path hex Q').fill(mode==='blink'?'13':mode==='drag'?'9':'10');await game.getByLabel('Path hex R').fill('5');await game.getByRole('button',{name:'Add path step',exact:true}).click();await game.getByRole('combobox',{name:'Movement mode',exact:true}).selectOption(mode);
  if(mode==='flight'){await game.getByRole('combobox',{name:'Flight height',exact:true}).selectOption('ground');await game.getByRole('button',{name:'Set flight transition',exact:true}).click();}
  if(mode==='drag')await game.getByRole('combobox',{name:'Drag target',exact:true}).selectOption('target');await game.getByRole('button',{name:'Save movement options',exact:true}).click();
 }else{
  await game.getByRole('combobox',{name:'Targeting mode',exact:true}).selectOption(mode==='multi'?'creatures':mode);
  if(mode==='multi'){await game.getByRole('combobox',{name:'Tactical target',exact:true}).selectOption('target');for(let i=0;i<3;i++)await game.getByRole('button',{name:'Append attack target',exact:true}).click();}
  if(mode==='guard'){await game.getByLabel('Path hex Q').fill('13');await game.getByLabel('Path hex R').fill('5');await game.getByRole('button',{name:'Add Guard hex',exact:true}).click();}
  await game.getByRole('button',{name:'Save tactical action',exact:true}).click();
 }
 await expect(game.getByText('Draft saved',{exact:true})).toBeVisible();await expect(game.getByRole('alert')).toHaveCount(0);const pending=page.waitForEvent('download');await game.getByRole('button',{name:'Export private save'}).click();const file=await pending,order=JSON.parse(readFileSync((await file.path())!,'utf8')).orders.find((o:any)=>o.creatureId==='actor');
 if(mode==='blink')expect(order.blinkIndex).toBe(0);if(mode==='flight')expect(order.flightSteps).toEqual([{index:0,height:'ground'}]);if(mode==='drag')expect(order.dragTargetId).toBe('target');if(mode==='multi')expect(order.early.targetIds).toEqual(['target','target','target']);if(mode==='guard')expect(order.early).toMatchObject({type:'Guard',area:[{q:13,r:5}]});if(mode==='structure')expect(order.early.structure).toEqual({kind:'wall',id:'wall'});
 if(mode==='blink'){await game.getByLabel('Movement step').fill('2');await game.getByRole('button',{name:'Save movement options',exact:true}).click();await expect(game.getByRole('alert')).toBeVisible();const next=page.waitForEvent('download');await game.getByRole('button',{name:'Export private save'}).click();const rejected=await next;expect(JSON.parse(readFileSync((await rejected.path())!,'utf8')).orders.find((o:any)=>o.creatureId==='actor')).toEqual(order);}
});
