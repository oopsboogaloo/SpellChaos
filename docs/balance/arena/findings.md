# Arena findings, 9 November 2026

Notes on the first arena run (`report.md`, `matrix.csv`): 18,060 one-on-one fights, 20 per pair, among the 43 summonable creatures. Re-run with:

```sh
for i in 0 1 2 3; do npx tsx tools/arena/run.ts $i 4 20 out-$i.jsonl & done; wait
npx tsx tools/arena/report.ts docs/balance/arena out-*.jsonl
```

## Bugs to fix before reading the numbers as balance

1. **The AI repeats a power forever and never attacks.** The Basilisk uses Gaze every turn, even on a target that is already slowed or held, and never bites. The Ghost uses Frighten every turn and never touches. Both made zero attacks in 840 fights. The Basilisk won none and the Ghost drew 600. Other power users, such as the Lion's Roar and the mushroom's Spores, probably suffer from the same thing. The AI should value a power less once the target is already affected, and compare it with simply attacking.
2. **Siege engines rarely get to shoot.** The Catapult, Siege Catapult and Thunder Trebuchet average one or two shots a fight, every one of which hits, because arcing shots have no hit roll. They take 20–27 damage a fight, so they are reloading or exposed most of the time. This needs checking against the reload rules and how the AI orders Reload.

## Design questions

3. **Flyers with a ranged attack are untouchable by ground melee.** Melee needs both creatures at the same height, so a flyer that stays up can shoot a melee creature forever. The level 1 Dragonet familiar beats the Sabre-toothed tiger 100% of the time and Bobby the Master Hunter 95%. The Wisp and the Amphiptere show the same pattern. The answer might be in the rules (for example, a flyer must land to attack, or melee can reach a low flyer), or a melee creature could take cover. In real games other creatures and the wizard's spells would deal with flyers.
4. **Spirits dominate** because they resist or ignore physical damage, which most attacks deal. The Pale Monarch scores 93%, the Dread revenant 89%, the Wraith 82% and the Spectre (level 4) 75%. Light and magic damage are rare among creatures, so few things can hurt them.
5. **The order within a spell is uneven.** The Basilisk (Serpent 5) and the Fey leopard (Cat 5) score below lower levels of their own spell. The Basilisk's result is mostly bug 1.
6. **Low levels are very weak one-on-one.** The Walking mushroom scores 5%, the Cat familiar 11% and the Snake familiar 12%. That is expected for familiars, whose job is to carry spells, but worth knowing.

## General numbers

- Hit rates are high: most creatures land 75–90% of their attack rolls.
- Fights are short, averaging about 8 turns.
