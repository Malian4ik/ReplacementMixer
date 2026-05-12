const Database = require("better-sqlite3");
const db = new Database("dev.db", { readonly: true });
const matches = db.prepare("SELECT round, homeTeam, awayTeam, status FROM TournamentMatch WHERE status IN ('Completed', 'TechLoss') ORDER BY round").all();
console.log("=== Completed/TechLoss matches: " + matches.length + " ===");
matches.forEach(m => console.log(JSON.stringify(m)));
const teams = db.prepare("SELECT name FROM Team").all();
console.log("\n=== Team names ===");
teams.forEach(t => console.log(JSON.stringify(t.name)));
db.close();
