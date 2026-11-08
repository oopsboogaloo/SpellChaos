/** One or two plain sentences per species, shown when a creature is inspected. */
export const creatureDescriptions: Record<string, string> = {
  Wizard:
    'A Wizard is your spellcaster: it fights weakly with a staff and spends mana, which regenerates each turn, on spells. If your wizard is killed, you lose the game.',

  // Cat
  'Cat familiar':
    'A Cat familiar is a tiny, nimble companion with a weak claw attack. Its real value is that its wizard can cast spells through it.',
  Cougar:
    'A Cougar is a fast melee hunter: if it moves at least three hexes towards its target before biting, it pounces for extra damage.',
  Lion: 'A Lion is a sturdy melee brawler that fights best when an ally is next to its target, and it can roar to frighten adjacent enemies.',
  'Sabre-toothed tiger':
    'A Sabre-toothed tiger is a tough, hard-hitting melee predator whose bite leaves victims bleeding. It resists cold but is slow for a cat.',
  'Fey leopard':
    'A Fey leopard is a fast, agile cat with magic claws that can blink up to three hexes once per turn. It resists magic but is vulnerable to physical attacks.',
  Gryphon:
    'A Gryphon is a large flyer that attacks with beak and claws, dives for extra beak damage after a run-up, and can carry a rider. It resists cold.',
  'Giant puma':
    'A Giant puma is a huge, very hard-hitting melee cat that pounces after a run-up and can drag a seized victim along at half speed.',
  'Bobby the Master Hunter':
    'Bobby the Master Hunter is an elite, fast and accurate cat with magic claws that acts before and after moving, ignores darkness and sees invisible foes. Resists magic and poison.',

  // Serpent
  'Snake familiar':
    'A Snake familiar is a tiny, slow companion with a poisonous bite; its wizard can cast spells through it. It resists poison but is vulnerable to cold.',
  Adder:
    'An Adder is a small, cheap snake with a poisonous bite that strikes with advantage at targets that have not yet acted. It resists poison but is vulnerable to cold.',
  'Snake Swarm':
    'A Snake Swarm is a slow, sprawling mass of poisonous snakes. It resists physical attacks and poison but is vulnerable to fire and cold.',
  'Greater Snake Swarm':
    'A Greater Snake Swarm is a bigger, harder-biting Snake Swarm covering six hexes. It resists physical attacks and poison but is vulnerable to fire and cold.',
  Basilisk:
    'A Basilisk is a slow, sturdy serpent whose gaze reaches 4 hexes, slowing its victim or holding it in place if already slowed. Resists poison; vulnerable to cold.',
  Amphiptere:
    'An Amphiptere is a fast flying serpent with a poisonous bite and a poison spit that reaches 5 hexes. It resists poison and lightning but is vulnerable to cold.',
  Hydra:
    'A Hydra is a tough, slow melee beast that bites three times per attack and regenerates 3 hit points each turn. Resists poison; vulnerable to fire and acid.',
  'The World Serpent':
    'The World Serpent is a colossal serpent with a devastating bite, a tail sweep that hits every adjacent creature, allies included, and crushing coils. Immune to poison; vulnerable to light.',

  // Goblin
  'Goblin scout':
    'A Goblin scout is a cheap, fragile skirmisher with a 5-hex sling that fights best alongside allies and can see a short way into darkness.',
  'Goblin archer':
    'A Goblin archer is a cheap, fragile bowman that shoots up to 7 hexes and fights best alongside allies. It can scramble over low walls.',
  'Goblin raider':
    'A Goblin raider is a quick fighter with a blade for close work and a javelin that reaches 4 hexes, and it can ride a larger mount.',
  Hobgoblin:
    'A Hobgoblin is a sturdy spear-fighter that hits harder when guarding, making it good at holding a line alongside other goblins.',
  'Goblin shaman':
    'A Goblin shaman is a frail spellcaster with a 6-hex magic hex and its own mana for Darkness, Fire Bolt and Release. It resists magic but is vulnerable to light.',
  'Goblin champion':
    'A Goblin champion is a tough, accurate swordsman that can act both before and after moving. It resists poison.',
  'Goblin king':
    'A Goblin king is a slow leader with a hard-hitting magic sceptre; it can order an allied goblin to move at once and makes adjacent goblins more accurate. Resists magic.',
  'The Once and Future Goblin':
    'The Once and Future Goblin is a goblin sorcerer with a 6-hex magic bolt and spells such as Teleport. Once per match, a killing blow leaves it on 1 HP and it tries to escape.',

  // Dragon
  'Dragonet familiar':
    'A Dragonet familiar is a tiny flying companion that spits fire sparks up to 3 hexes; its wizard can cast spells through it. Resists fire; vulnerable to cold.',
  Drake:
    'A Drake is a slow, ground-bound dragon that bites or scorches everything in an adjacent hex with fire. It resists fire but is vulnerable to cold.',
  Wyvern: 'A Wyvern is a fast flyer that attacks with a bite and a poisonous sting. It resists poison.',
  'Young dragon':
    'A Young dragon is a flyer with a bite and a fire breath that hits every creature in a three-hex line, friend or foe. Resists fire; vulnerable to cold.',
  'Fire dragon':
    'A Fire dragon is a powerful flyer with a hard-hitting bite and a fire breath that hits everything in a three-hex line. Immune to fire; vulnerable to cold.',
  'Frost dragon':
    'A Frost dragon is a powerful flyer with a hard-hitting bite and a freezing breath that damages and slows everything in a three-hex line. Immune to cold; vulnerable to fire.',
  'Ancient dragon':
    'An Ancient dragon is a mighty flyer with a crushing bite, fire breath and a terrifying roar. Immune to fire, resists physical and magic; vulnerable to cold.',
  'Multi-headed Dragon':
    'A Multi-headed Dragon is a huge flyer that bites three times and breathes fire, frost and lightning. It resists fire, cold and lightning but is vulnerable to acid.',

  // Spirit
  Wisp: 'A Wisp is a frail flying undead spirit with a 3-hex spark that can reveal an invisible creature nearby. Resists physical attacks, immune to poison; vulnerable to light.',
  'Haunting shade':
    'A Haunting shade is an undead spirit whose touch slows its victim, and it can pass through other creatures. Strongly resists physical attacks, immune to poison; vulnerable to light.',
  Ghost:
    'A Ghost is an incorporeal undead, so physical attacks pass through it; its magic touch can be backed by frightening an adjacent enemy. Immune to poison; vulnerable to light.',
  Spectre:
    'A Spectre is a fast, incorporeal undead whose magic touch leaves victims subdued. Physical attacks and poison cannot harm it, but it is vulnerable to light.',
  Wraith:
    'A Wraith is an incorporeal undead whose hard-hitting touch drains life to heal itself. Immune to physical attacks and poison, resists necrotic; vulnerable to light.',
  Banshee:
    'A Banshee is an incorporeal undead whose wail damages and terrifies every other creature within 3 hexes. Immune to physical attacks and poison; very vulnerable to light.',
  'Dread revenant':
    'A Dread revenant is a slow undead warrior with a very hard-hitting magic blade that can mark a quarry to hunt. Immune to physical attacks and poison; vulnerable to light.',
  'The Pale Monarch':
    'The Pale Monarch is an incorporeal undead king with a devastating sceptre and spells including Reanimate. Immune to physical, poison and necrotic damage; very vulnerable to light.',

  // Plant
  'Walking mushroom':
    'A Walking mushroom is a slow, weak plant that can puff spores to put an adjacent living enemy to sleep. It resists cold but is vulnerable to fire.',
  'Grasping vine':
    'A Grasping vine is a slow plant whose tendrils reach 2 hexes to grab and hold enemies. It resists physical attacks but is vulnerable to fire.',
  'Thorn bush':
    'A Thorn bush barely moves, but its thorns hurt any attacker whose melee blow damages it. It resists physical attacks but is flammable and vulnerable to fire.',
  'Walking tree':
    'A Walking tree is a slow, sturdy plant whose branch reaches 2 hexes and can shove a smaller target back. Resists physical attacks and cold; vulnerable to fire.',
  Treant:
    'A Treant is a large, tough plant with a hard-hitting branch that reaches 2 hexes, and it regenerates 2 hit points each turn. Resists physical and cold; vulnerable to fire.',
  'Strangling grove':
    'A Strangling grove is a sprawling, almost immobile mass of roots covering six hexes. It resists physical attacks but is very vulnerable to fire.',
  'Ancient treant':
    'An Ancient treant is a huge plant with a crushing 2-hex branch, Tangleweed and Healing Bolt spells, and regenerates 3 HP a turn. Strongly resists physical; very vulnerable to fire.',
  'The Walking Forest':
    'The Walking Forest is a vast, almost immobile plant that strikes every adjacent enemy, roots smaller neighbours in place and shields allies from arrows. Very vulnerable to fire.',

  // Archer
  Shepherd:
    'A Shepherd is a cheap, fragile ranged creature: its sling hits from 5 hexes away, and it can ride a larger mount.',
  Bowman: 'A Bowman is a cheap archer with a 7-hex bow who can take an early, aimed shot if he stays still that turn.',
  Longbowman:
    'A Longbowman shoots up to 10 hexes and can take an early, aimed shot if he stays still, but is less accurate against nearby targets.',
  'Elven Archer':
    'An Elven Archer is an agile, accurate archer with a 9-hex range who chooses magic or physical arrows and ignores darkness. Resists magic.',
  Ballista:
    'A Ballista is an almost immobile siege engine whose hard-hitting 12-hex bolt can pierce a second creature, but it must reload between shots. Resists physical; vulnerable to fire.',
  Catapult:
    'A Catapult is an almost immobile siege engine that lobs stones 12 hexes over creatures and walls, hitting an area; it must reload between shots. Vulnerable to fire.',
  'Siege Catapult':
    'A Siege Catapult lobs heavy stones 15 hexes over creatures and walls, hitting an area and dealing extra damage to structures; it must reload between shots. Vulnerable to fire.',
  'Thunder Trebuchet':
    'A Thunder Trebuchet is an immobile siege engine whose explosive shot arcs 18 hexes for physical and fire damage over an area; it must reload. Very vulnerable to fire.',
};

export function describeCreature(species: string): string | undefined {
  return Object.hasOwn(creatureDescriptions, species) ? creatureDescriptions[species] : undefined;
}
