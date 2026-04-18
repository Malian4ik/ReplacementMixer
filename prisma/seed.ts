import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaLibSql({ url: "file:prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

const PLAYER_COUNT = 130;
const TEAM_COUNT = 24;

const NICKS = [
  "Shadow", "Blaze", "Frost", "Storm", "Viper", "Titan", "Echo", "Nexus",
  "Phantom", "Cipher", "Raven", "Apex", "Lunar", "Solar", "Comet", "Flux",
  "Zephyr", "Drift", "Pulse", "Nova", "Arc", "Bolt", "Surge", "Crest",
  "Dusk", "Dawn", "Haze", "Mist", "Gale", "Torq", "Edge", "Core",
  "Sync", "Wave", "Peak", "Claw", "Fang", "Rift", "Void", "Halo",
  "Grit", "Rush", "Trek", "Vex", "Warp", "Yore", "Zeal", "Arch",
  "Blitz", "Clash", "Drake", "Ember", "Forge", "Glint", "Husk", "Iron",
  "Jade", "Knight", "Lore", "Mage", "Neon", "Onyx", "Prism", "Quartz",
  "Rebel", "Sage", "Talon", "Umbra", "Vale", "Wisp", "Xenon", "Yield",
  "Zest", "Alpha", "Brisk", "Crane", "Dune", "Exile", "Flint", "Grove",
  "Haven", "Imber", "Jarvis", "Kite", "Lyric", "Marsh", "Norte", "Opal",
  "Pyre", "Quest", "Roam", "Silex", "Thane", "Uplift", "Vivid", "Weld",
  "Xray", "Yawn", "Zenith", "Ardent", "Bastion", "Citadel", "Dynamo", "Elara",
  "Ferrum", "Gnash", "Helios", "Impel", "Jolt", "Kinetic", "Lance", "Maven",
  "Nitro", "Orbit", "Prowl", "Razor", "Scorch", "Thorn", "Utmost", "Vector",
  "Whirl", "Xerus", "Yarrow", "Zonda", "Amber", "Brawn", "Cinder", "Dagger",
  "Elixir",
];

function getRandInt(min: number, max: number, seed: number): number {
  // Deterministic pseudo-random for reproducibility
  const x = Math.sin(seed + 1) * 10000;
  return min + (Math.abs(x) % (max - min + 1)) | 0;
}

async function main() {
  console.log("Seeding database...");

  await prisma.matchSubstitutionLog.deleteMany();
  await prisma.substitutionPoolEntry.deleteMany();
  await prisma.team.deleteMany();
  await prisma.player.deleteMany();

  // Create players
  const players = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const mainRole = (getRandInt(1, 5, i * 7) as 1 | 2 | 3 | 4 | 5);
    const hasFlex = i % 3 !== 0;
    let flexRole: number | null = null;
    if (hasFlex) {
      flexRole = getRandInt(1, 5, i * 13);
      if (flexRole === mainRole) flexRole = (flexRole % 5) + 1;
    }
    players.push({
      nick: NICKS[i] ?? `Player${i + 1}`,
      mmr: 7500 + getRandInt(0, 2000, i * 3),
      stake: 10 + getRandInt(0, 25, i * 11),
      mainRole,
      flexRole,
      wallet: i % 4 === 0 ? `wallet_${i}` : null,
      nightMatches: getRandInt(0, 15, i * 17),
      isActiveInDatabase: true,
    });
  }

  const createdPlayers = await Promise.all(
    players.map((p) => prisma.player.create({ data: p }))
  );

  console.log(`Created ${createdPlayers.length} players`);

  // Create teams
  const teams = [];
  for (let t = 0; t < TEAM_COUNT; t++) {
    const base = t * 5;
    teams.push({
      name: `Team ${String.fromCharCode(65 + (t % 26))}${t >= 26 ? Math.floor(t / 26) : ""}`,
      player1Id: createdPlayers[base].id,
      player2Id: createdPlayers[base + 1].id,
      player3Id: createdPlayers[base + 2].id,
      player4Id: createdPlayers[base + 3].id,
      player5Id: createdPlayers[base + 4].id,
    });
  }

  const createdTeams = await Promise.all(
    teams.map((t) => prisma.team.create({ data: t }))
  );

  console.log(`Created ${createdTeams.length} teams`);

  // Create pool entries from remaining players (indices 120..125)
  const poolPlayers = createdPlayers.slice(TEAM_COUNT * 5, TEAM_COUNT * 5 + 6);
  await Promise.all(
    poolPlayers.map((p) =>
      prisma.substitutionPoolEntry.create({
        data: {
          playerId: p.id,
          status: "Active",
          source: "reduction",
        },
      })
    )
  );

  console.log(`Created 6 pool entries`);
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
