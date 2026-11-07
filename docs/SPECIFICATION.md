# Spell Chaos — specification register

> **Approved scope change — 6 November 2026:** Goblin and Dragon are deferred in full to the next version. The MVP now has five summon families (Cat, Serpent, Spirit, Plant, Archer), 40 profiles, and the same 12 non-summoning spell families. This supersedes seven-family/56-profile MVP requirements below; historical profiles and rules remain preserved for later use. Starting spell guarantees use 14 non-guaranteed families.

> **Owner decisions — 7 November 2026:** (1) [SPECIFICATION.md](SPECIFICATION.md) is now the authoritative specification. The verbatim v0.9 source archive (PLAN Stage 0, `docs/SPECIFICATION-SOURCE-v0.9.md`) is no longer required; statements below that the original supplied text is authoritative, or that archiving it is a gate, are superseded. Where the register is silent or ambiguous, record an owner ruling as a numbered decision rather than appealing to the original source. (2) Development saves need no backward compatibility: legacy schema validators, migration functions and historical save fixtures may be deleted, and the schema may restart at version 1 for release. See the [Stage 1–7 review](reviews/2026-11-07-stage-1-7-review.md).

Working version 0.9 · 2 November 2026

Status: approved user requirements, transcribed into a compact repository reference.
Source: the owner's full specification supplied in the project conversation on 2 November 2026.
This is a condensed transcription, not a verbatim archive. The original specification remains authoritative wherever detail is omitted here. Do not treat an omission as permission to remove a rule. Full original-text archival remains required before implementation.

## Precedence and delivery
Later MVP rules and its 56 profiles supersede earlier conflicts and open questions. Preserve broader approved content for later versions. Design review comes first, then a separately reviewed implementation plan, then staged implementation with code in GitHub. No implementation is approved by this document.

## Product and scope
Browser TypeScript tactical wizard combat inspired loosely by Julian Gollop's Chaos. Simultaneous planning; ordered resolution. No facing in any version. Stylised species names in player-coloured circles, team icons, zoomable map.
MVP: one human and AI opponents, 2–8 free-for-all. Network multiplayer deferred. Seven summon families (Cat, Serpent, Goblin, Dragon, Spirit, Plant, Archer), all eight levels each. Twelve other families: Disbelief, Bind, Release, Magic Bolt, Fire Bolt, Magic Attack, Healing Bolt, Teleport, Wall, Tangleweed, Darkness, Reanimate.
Starting book: 10 unique randomly chosen enabled families, at least two summons, one damage and one defensive/utility, plus guaranteed Disbelief, Bind, Release extras. Awards uniformly choose unknown enabled families every third turn; all known gives 10 mana capped normally.
Full design has 22 families: Cat, Elephant, Horse, Wolf, Bird, Spider, Plant, Celestial, Soldier, Archer, Harvest (Law); Goblin, Rat, Demon, Serpent, Spirit, Giant, Scorpion (Chaos); Dragon, Cephalopod, Dinosaur, Fey (Neutral).
Other families, potions, Gate, Fortress, mega spells, Harvest production, resurrection other than Reanimate and wizard liches are outside MVP. V2: armour, opportunity attacks, Evade, charm, Glamour, Phantasm, Simulacrum, Fade, Instantly Ready. Controller support V3. Natural terrain and spatial balance diffusion deferred.

## Map, statistics and geometry
30×30 offset hexes, flat open board; centres 1 metre apart. Starts evenly spaced around perimeter two hexes inward. Size 1–10; Con minimum 1; Move, Dex, Int; HP=Con×Size. Size pairs 1–2/3–4/5–6/7–8/9–10 occupy compact radius 0/1/2/3/4 footprints, respectively 1/7/19/37/61 hexes.
Wizard: Size2 Con5 Move2 Dex5 Int7 HP10; staff Skill4 Dmg2 Crit5%; 100 mana.
No Strength; physical resistance uses 2×Size. Range is minimum distance between occupied hexes; melee shares an edge. Whole footprints fit at every step. Creatures normally block allies and enemies. No swap/reroute on blocking; stop at last legal position. Swarms overlap. Flying and incorporeal passage exceptions apply.
Solid walls occupy edges; cauldrons in full design occupy vertices. Opposite sectors for large-footprint flanking; no facing.

## Orders and time
90-second planning default, configurable/disabled privately. Revise until lock/deadline. Unordered units remain and Total Defend. Three consecutive missed turns surrender; surrender follows wizard death.
Early actions → movement → late actions. Normally one early OR late action; Double Action one of each. Entire paths resolve unit by unit.
Actions: higher Dex, smaller Size, nearer controlling wizard, random tie. Movement: higher Move, larger Size, nearer wizard, random tie. Distance snapshot at each phase start; uncontrolled distance zero. Slowed last among ordinary units; Quick completions after Slowed actions.
Creature targets follow identity; ground targets remain fixed. Revalidate at execution, no substitute target. Invalid action wasted; mana spent if begun.
Victory after each phase and end-turn death cleanup: one living wizard wins; none draws. Incapacitation is not elimination.
Turn end, snapshot within each step: simultaneous ongoing damage; death cleanup/victory; recovery; duration expiry; mana and awards. Mana regeneration begins after turn1; awards after turns3,6,9…
Default temporary duration L+1 turns, expiry at end of final turn.

## Combat, actions and conditions
Hit%=clamp(70+5×(Skill−Dex),10,95). Crit separately, default5%, doubles damage. Unconscious/incapacitated automatically hit. Advantage/disadvantage roll twice, better/worse, sources do not stack and cancel each other; hit only.
Pack tactics: active ally adjacent; flanking: opposite active ally. Threatened ranged attacks disadvantage.
Defend grants incoming disadvantage throughout selected phase, including before initiative; can move. Total Defence both action phases, consumes whole turn and Double Action. Dash early adds normal Move. Guard lasts until next turn: melee once per entering enemy, ranged first qualifying enemy; immediate reactions. Forced movement, summons, teleport do not trigger Guard.
Grapple: hit then physical resistance, normally smaller targets; one hold per limb; both remain stationary unless Drag. Escape action checks every hold with clamp(50+10×(escapeeSize−grapplerSize),10,90). Free release.
Effect%=clamp(50+5×(potency−resistance),10,90). Con for poison/disease, 2×Size physical, Int mental/magical. Secondary attack effects require hit and applicable damage.
At HP0 incapacitated; at −maxHP dead. Healing above0 removes damage incapacitation; no automatic bleed-out.
Bleeding1 at turn end including application, until adjacent treatment action or magical healing. Poison1 for3 turns; refresh not stack. Disease after3 turns causes Subdued until cured. Sleep ends on damage/ally action. Restrained cannot move but acts. Subdued chooses movement OR one action even with Double Action. Slowed halves Move (positive half round down min1), resolves late. Fear prevents voluntary approach, attack disadvantage, end-turn Int removal check.
Undead immune poison/disease/Bleeding. Plants immune poison/disease. Constructs immune poison/disease/Bleeding/Sleep; Int0 immune Fear/Sleep/illusions, but can be bound/released/restrained.
Regeneration at turn end while alive, including incapacitated; fire/acid suppress that turn.
Public HP bands: >2/3 healthy; >1/3 through2/3 wounded; >0 through1/3 critical; <=0 alive incapacitated; <=−max dead. Opponents do not see exact HP/mana/orders or illusion truth.

## Damage and projectiles
Types: physical, fire, cold, lightning, necrotic, magic, light, poison, acid. Per component: strongest resistance × strongest vulnerability, round up; immunity zero. R=.5, MR=.25, V=1.5, MV=2. Area is a property. Zero damage causes no concentration or damage-dependent effect.
Direct arrows, stones, ballista, Magic Bolt, Fire Bolt intercept first creature including ally; ordinary hit roll on interceptor. Creatures do not block sight. Healing Bolt, Magic Attack, control ignore interception. Catapult/trebuchet arc over ordinary walls/creatures.
Start at nearest origin boundary ignoring origin; swarm intercepts. Ground does not intercept airborne-to-airborne; mixed shots use target height. Boundary ray side chosen in planning preview.
Areas hit each creature once; roots/Earthquake exclude airborne. Siege areas use Dex resistance for half damage with Skill potency, no default crit.

## Magic
Levels1–8 immediately available; mana5L. P=clamp(95−8L+20AB/(40+|B|),5,95), A Law+1 Chaos−1 Neutral0. Global B starts0; use resolution balance. Success shift AL; failure/interruption AL/2; preserve half-points. Success but resisted still successful shift.
Wizard regen5 cap100; real nearby familiar within4 adds1, maximum one. Creature caster regen1, listed mana.
Reserve at submission, spend at start; pre-start cancellation free, failure/interruption full cost.
Summon+Bind full cost/base chance and no separate bind resistance; Summon Only ceil(half cost), chance+20 capped95; Illusion ceil(half), guaranteed. Range4 to centre, whole footprint legal or fails without relocation.
Quick summon occupies immediately, passive effects immediately; no actions/move/offensive reactions until next turn.
Instant normal initiative; Quick phase end; Slow next action phase; Ritual N starts early, finishes late on Nth turn. Caster immobile, all intervening action slots occupied. Double Action no acceleration.
Concentration once per attack action total damage: clamp(50+5Int−5damage,10,95). Incapacitation/forced movement interrupt.
Familiar remote origin no distance cap; at start closest eligible origin to target, ties wizard then oldest familiar. Lock origin; familiar must stay still; death/incapacity/lost binding interrupts. Illusions cannot be origins.
Bind normal success then Int resistance potency L, target summon level<=L, old binding<L. Release binding<=L, casting and resistance. Binding level separate from creature level.
Unbound attack nearest perceived different species, including summoner, approaching if necessary.
Wizard death unbinds ordinary summons, collapses reanimated/spirit servants, ends ongoing spells/illusions; elimination permanent.

## MVP spells
General range8 with sight unless override; spell attacks Skill=Int, Crit5%.
Magic Bolt Neutral Instant range6+L damageL+2 magic.
Fire Bolt Chaos Instant range8 damageL+2 fire, ignition.
Magic Attack Neutral Instant range8 damageL+1; Int defence; separate roll each same-family target withinL+3 of primary, every team, clear sight from primary, no chain.
Healing Bolt Law Instant range8 healL+3 without hit; normal casting; removes Bleeding; excludes undead/illusions.
Teleport Neutral Instant caster visible legal destination within2+2L.
Disbelief Neutral Instant fixed2 mana, guaranteed removal of illusion, range2+2L; no shift; real target unaffected.
Bind Law Slow; Release Neutral Instant.
Reanimate Chaos Slow corpse level<=L; once-restoration and corpse restrictions apply.
Tangleweed Law Slow L connected hexes, double movement cost, physical restraint potencyL once/creature/turn; 3L HP/hex; durationL+1.
Darkness Chaos Quick radius1+floor(L/3), durationL+1; blocks sight into/through, adjacency attack with disadvantage. Owner sees own units.
Wall Slow up toL+2 connected edges, HP5+3L each. L1 wood Law flammable; L2 stone Law double earthquake; L3 iron Law ordinary-fire immune; L4 crystal Law sight-transparent/projectile-solid; L5 thorns Neutral double crossing cost/3 damage; L6 fire Chaos passable6 fire; L7 energy Law blocks incorporeal/flyers; L8 death Chaos passable10 damage/heals undead.
Ordinary walls2m, flyers cross; solid walls cannot bisect footprint. Invalid at planning/recheck execution. Hazard large footprint once/movement phase per wall. Burning wood/woody creature2 fire at next2 turn ends, refresh; adjacent extinguish action. Destroyed edges vanish.

## Illusions, bodies, swarms and mounts
Illusions display claimed stats and can kill; reversible damage/secondary conditions tagged by source. Remove source restores survivor damage capped maxHP, removes effects; dead remain dead. Healing clears oldest reversible damage before real. No usable corpse, resources, spells, mana regen, real healing, objects or structure/Int0 damage. Copy passive combat/flight/defences/attacks; optional+2 Move. Own regeneration only self. Int0 can pass through. Detection reveals only to detector, not removal.
Corpses do not block. Skeletal after cumulative fire/acid >=half original maxHP including while alive. Reanimate whole corpse zombie half Move/Dex; skeleton retains both. Both retain Size/Con/basic body damage, usable wings/reach/object handling, lose spellcasting/poison/familiar/regen/auras/unique escapes. Zombie physicalR; skeletonMR. Plants, constructs, swarms, illusions, dissipated spirits no reanimatable corpse. One restoration normally.
Swarms single-target physical half; fire OR area ×1.5 once, no physical resistance for areas. Below half originalHP Size−2; below quarter another−2 min1; maxHP fixed, centre fixed. Smaller same-height covered targets restrained, recompute after movement/size changes. Heal size regrowth only if fits, retry next turn start. Overlap creatures/constructs/swarms; ground cannot cross solid walls. Attack separate roll each covered/adjacent enemy, no friendly fire unless explicit. Die/disperse at0, no corpse.
Flight takeoff/landing1 movement. Airborne melee only airborne adjacent; airborne targets ranged/other flyers. Mount larger and suitable, rider uses mount movement and own actions; mount/dismount action, no casting bypass. Rider shares footprint; choose rider/mount target. Mount death nearest legal rider placement/Subdued through next turn; airborne fall5 unless flying rider stays airborne.

## MVP profiles
Notation: Size/Con/Move/Dex/Int; HP; attacks Skill/Dmg, physical unless named. Default crit5%. Data below retains numeric profiles; detailed interactions follow original specification.

### Cat — Law
1 Cat familiar 1/3/5/8/3 HP3; claws4/1; Familiar, Nimble crosses allies.
2 Cougar 2/4/6/7/2 HP8; bite5/3; Pounce+2 after3 towards target.
3 Lion 3/5/5/6/2 HP15; bite6/4; Pack, adjacent Roar Fear3.
4 Sabre-toothed tiger 3/6/4/5/2 HP18; bite7/5 crit15%; Rcold, Bleeding.
5 Fey leopard 2/5/6/9/6 HP10; claws7/4 magic; Rmagic Vphysical; Blink replace<=3 steps once/turn.
6 Gryphon 4/6/6/6/4 HP24; beak7/4+claws6/3; Rcold, Flying/mount, Dive+2 beak after3.
7 Giant puma 5/6/5/6/3 HP30; bite8/8; Pounce, grapple smaller, Drag halfMove.
8 Bobby the Master Hunter 2/7/7/10/8 HP14; claws9/5 magic crit20%; Rmagic/poison, Double Action, invisible detection6, ignores Darkness disadvantage.

### Serpent — Chaos
1 Snake familiar 1/3/3/6/2 HP3; bite4/1; Rpoison Vcold, Familiar, poison2.
2 Adder 1/4/3/7/1 HP4; bite5/2; Rpoison Vcold, poison5, advantage vs not-yet-acted this phase.
3 Snake Swarm 4/4/3/5/1 HP16; bites5/2; Rphysical/poison Vfire/cold/area; swarm poison3.
4 Greater Snake Swarm 6/4/3/5/1 HP24; bites6/3; same defences; swarm poison5.
5 Basilisk 3/6/3/4/3 HP18; bite6/4; Rpoison Vcold; gaze4 Int5 Slowed2 or Restrained if already Slowed.
6 Amphiptere 3/5/7/8/4 HP15; bite7/4, spit7/3 poison range5; Rpoison/lightning Vcold; Flying, bite poison6.
7 Hydra 5/7/3/4/3 HP35; three bites7/3 distinct targets permitted; Rpoison Vfire/acid; regen3.
8 World Serpent 8/8/3/4/8 HP64; bite9/10 OR sweep8/5 all adjacent; Immpoison Rcold Vlight; grapple smaller, held targets4 physical end turn.

### Goblin — Chaos
1 Scout 1/3/4/6/3 HP3; sling4/1 range5; Pack, small objects, sees Darkness3.
2 Archer 1/4/4/5/3 HP4; bow5/2 range7; Pack, low-wall Scramble+1 step cost.
3 Raider 2/4/5/6/4 HP8; blade6/3, javelin5/2 range4; Pack, weapons/objects/rider.
4 Hobgoblin 2/6/4/5/5 HP12; spear6/4; Pack, Guard+2 damage.
5 Shaman 1/5/3/5/7 HP5; hex6/3 magic range6; Rmagic Vlight; mana25, Darkness/Fire Bolt/Release max3.
6 Champion 2/7/4/7/5 HP14; sword8/5 crit15%; Rpoison; Pack, Double Action, weapons/objects.
7 King 2/7/3/5/8 HP14; sceptre7/5 magic; Rmagic; Command allied goblin within5 immediate2 movement, Rally adjacent goblins+1Skill.
8 Once and Future Goblin 2/8/4/7/9 HP16; Crownfire8/7 magic range6; Rmagic/necrotic Vlight; mana40 Magic Attack/Bind/Teleport max5; False King.

### Dragon — Neutral
1 Dragonet familiar 1/3/5/6/4 HP3; spark4/1 fire range3; Rfire Vcold; Familiar/Flying.
2 Drake 2/5/4/4/2 HP10; bite5/3; Rfire Vcold; ground, Scorch2 fire every creature one adjacent hex.
3 Wyvern 3/5/6/6/3 HP15; bite6/3+sting5/2; Rpoison; Flying sting poison4.
4 Young dragon 3/5/5/5/5 HP15; bite6/4 OR breath6/4 fire; Rfire Vcold; Flying.
5 Fire dragon 4/7/5/5/6 HP28; bite7/6 OR breath7/6 fire; Immfire Vcold; Flying ignition breath.
6 Frost dragon 4/7/5/5/7 HP28; bite7/6 OR breath7/5 cold; Immcold Vfire; Flying breath Con6 or Slowed2.
7 Ancient dragon 5/8/4/5/9 HP40; bite8/8 OR breath8/8 fire; Immfire Rphysical/magic Vcold; Flying Dread Roar radius3 Fear7.
8 Multi-headed Dragon 6/8/4/4/8 HP48; three bites8/4 OR breath8/8 fire/cold/lightning; Rfire/cold/lightning Vacid; Flying each breath type independent cooldown.
Breath three-hex line from footprint, one hit roll/creature, all teams, cooldown2. Listed multiattacks one action.

### Spirit — Chaos
All Undead, no usable corpse; exceptions physical defences as listed.
1 Wisp 1/2/4/7/3 HP2; spark3/1 magic range3; Rphysical Vlight; Flying, Haunt invisible target within2 for phase.
2 Haunting shade 2/3/4/6/4 HP6; touch4/2 magic; MRphysical Vlight; through creatures not walls, Chill2 Slowed1.
3 Ghost 2/4/4/6/5 HP8; touch5/3 magic; Immphysical/poison Vlight; incorporeal, Frighten adjacent4.
4 Spectre 2/5/5/7/5 HP10; touch6/4 magic; Immphysical/poison Vlight; incorporeal, Wither4 Subdued1 on hit.
5 Wraith 2/6/5/7/6 HP12; touch7/5 magic; Immphysical/poison Rnecrotic Vlight; incorporeal, heal2 after damaging living real.
6 Banshee 2/5/4/6/8 HP10; touch6/3 magic; Immphysical/poison Rcold MVlight; incorporeal, Wail radius3 damage5 magic Fear6 cooldown3.
7 Dread revenant 3/7/3/5/8 HP21; blade8/7 magic; Immphysical/poison Rnecrotic Vlight; weapons, corporeal, Marked Quarry+2Skill until target dies.
8 Pale Monarch 3/8/4/7/10 HP24; sceptre9/8 magic; Immphysical/poison/necrotic MVlight; incorporeal mana40 Reanimate/Release/Darkness max6.

### Plant — Law
All immune poison/disease.
1 Walking mushroom 1/4/2/2/0 HP4; bump3/1; Rcold Vfire; adjacent living target Spores Con2 Sleep through next action phase or damage.
2 Grasping vine 2/5/2/3/0 HP10; tendril4/2 reach2; Rphysical Vfire; two grapple limbs, equal size allowed.
3 Thorn bush 3/5/1/2/0 HP15; thorns5/3; Rphysical Vfire; bristles1 physical after damaging melee hit.
4 Walking tree 3/6/2/2/0 HP18; branch5/4 reach2; Rphysical/cold Vfire; objects, on-hit Shove smaller1 if legal.
5 Treant 4/7/3/3/6 HP28; branch7/6 reach2; Rphysical/cold Vfire; regen2, objects, wood weapon.
6 Strangling grove 6/5/1/2/0 HP30; roots6/3 each covered/adjacent enemy; Rphysical MVfire; ground plant swarm.
7 Ancient treant 5/8/2/3/8 HP40; branch8/8 reach2; MRphysical Rcold MVfire; regen3 mana35 Tangleweed/Healing Bolt max4.
8 Walking Forest 8/7/1/2/8 HP56; branches8/6 each adjacent enemy; MRphysical Rcold MVfire; Root Network physical8 smaller adjacent, allied cover within2 ranged disadvantage.

### Archer — Law
1 Shepherd 2/3/4/5/4 HP6; sling4/1 range5; objects/rider unlimited stones.
2 Bowman 2/4/4/5/4 HP8; bow5/2 range7; Aim+2Skill no movement turn.
3 Longbowman 2/4/3/6/4 HP8; bow6/3 range10; Aim, under3 disadvantage.
4 Elven Archer 2/4/5/8/6 HP8; bow7/3 magic range9 or physical; Rmagic, ignores Darkness disadvantage.
5 Ballista 3/7/1/1/0 HP21; bolt7/7 range12; Rphysical Immpoison Vfire/acid; Reload, second directly behind half damage.
6 Catapult 4/7/1/1/0 HP28; potency5 physical5 range12 radius1 min4; Rphysical Immpoison Vfire; Reload arc.
7 Siege Catapult 5/8/1/1/0 HP40; potency6 physical7 range15 radius1 min5; Rphysical Immpoison Vfire/acid; Reload arc double structures.
8 Thunder Trebuchet 6/8/0/1/0 HP48; potency6 physical6+fire6 range18 radius2 min6; Rphysical Immpoison MVfire; Reload all-team explosion immobile.
Siege engines self-operating constructs. Reload action never firing turn. Cooldown2 used turn1 ready turn3. Move0 stays0.

## Additional ability contracts
Roar/Frighten action, enemies listed range Fear up to2 turns, Int application/end checks.
Command excludes inactive/restrained/casting targets, movement triggers Guard.
Root Network holds while adjacent unless escaped.
Blink cannot cross Energy or escape restraint, legal destination.
Drag halfMove and both footprints legal, no wall/creature passage.
False King first lethal hit leaves1HP, controller's preplanned destination within4; if blocked nearest legal in range with random ties; none stays; once/match.
Special attacks replace Attack unless explicit; unstated potency=summon level.

## Non-functional acceptance requirements
All production logic TypeScript and headless. Explicit validated commands and structured events; rendering, animations, inputs and scheduling separate. Seedable RNG, injectable clock; state+seed+versions+commands reproduces outcomes. AI receives only permitted views.
Phone touch, iPad touch/stylus, PC mouse, all operations without hover/keyboard/right-click/pressure. Select/draw path/choose timing/preview/commit; spells display level/variant/mana/success/origin/area/phase. Pause/step/speed/log replay.
Comprehensive unit, headless scenario, integration, browser, property/generated, deterministic visual and performance tests. Rule/ability/level/condition/interaction/workflow traceability. Check normal/boundary/invalid/failure/regression cases. Long runs detect crashes/hangs/invariants. Retain seeds, commands, traces/screenshots. Passing suite mandatory release.
Optional matchup simulator uses same engine, all56 pairwise including mirrors, repeated seeded trials/subsets; record win/loss/draw/fail separately, uncertainty, turn counts, remainingHP, side swaps, starting distance/terrain/policy/versions; turn limits; export data/matrix, no universal rankings.
Versioned portable authoritative snapshots include map/entities/ownership/resources/books/conditions/cooldowns/casts/illusion truth/balance/orders/paths/phase/cursor/pending events/reactions/completions/RNG/ties/victory/versions. Stable IDs, no functions/browser references. Restore partial planning and atomic resolution boundaries in fresh process with identical future events/results.
Separate redacted player views. Commands identify match/player/turn and detect stale/duplicates. Validate loads transactionally, reject unsupported versions; schema independently versioned, supported migrations and permanent fixtures. Every feature includes roundtrip/fresh-engine/identical-continuation coverage, hidden-state filtering, malformed input and migration checks. CI blocks broken serialisation.

## Still requiring explicit design decisions
Marked Quarry timing/action; gaze restraint duration/escape; Shade Chill and unspecified effects resistance; Wail allegiance/damage; Ballista second hit; special projectile interception; swarm MVfire precedence; Rally stacking; auto-hit defence; empty-hex shots; deterministic geometry and placement, AI and seeds; browser/performance/coverage baselines.
Broader full-design rosters, spell catalogues and future-system details remain in the original supplied document and must be archived verbatim before implementation. This register does not supersede them.
