import { createClient } from "@libsql/client";

function getClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:prisma/dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

export interface DbUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string; // OWNER | JUDGE | VIEWER | PENDING
  isApproved: number; // 0 or 1
  createdAt: string;
}

export async function initUserTable() {
  const client = getClient();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "name" TEXT NOT NULL DEFAULT '',
      "role" TEXT NOT NULL DEFAULT 'PENDING',
      "isApproved" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE("email")
    )
  `);
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const client = getClient();
  const res = await client.execute({
    sql: `SELECT * FROM "User" WHERE email = ? LIMIT 1`,
    args: [email],
  });
  return (res.rows[0] as unknown as DbUser) ?? null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  const client = getClient();
  const res = await client.execute({
    sql: `SELECT * FROM "User" WHERE id = ? LIMIT 1`,
    args: [id],
  });
  return (res.rows[0] as unknown as DbUser) ?? null;
}

export async function createUser(user: Omit<DbUser, "createdAt">): Promise<void> {
  const client = getClient();
  await client.execute({
    sql: `INSERT INTO "User" (id, email, passwordHash, name, role, isApproved) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [user.id, user.email, user.passwordHash, user.name, user.role, user.isApproved],
  });
}

export async function countUsers(): Promise<number> {
  const client = getClient();
  const res = await client.execute(`SELECT COUNT(*) as cnt FROM "User"`);
  return Number((res.rows[0] as unknown as { cnt: number }).cnt);
}

export async function getAllUsers(): Promise<DbUser[]> {
  const client = getClient();
  const res = await client.execute(`SELECT id, email, name, role, isApproved, createdAt FROM "User" ORDER BY createdAt ASC`);
  return res.rows as unknown as DbUser[];
}

export async function deleteUser(id: string): Promise<void> {
  const client = getClient();
  await client.execute({ sql: `DELETE FROM "User" WHERE id = ?`, args: [id] });
}

export async function updateUser(id: string, updates: { role?: string; isApproved?: number; name?: string }): Promise<void> {
  const client = getClient();
  const sets: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args: any[] = [];
  if (updates.role !== undefined) { sets.push(`role = ?`); args.push(updates.role); }
  if (updates.isApproved !== undefined) { sets.push(`isApproved = ?`); args.push(updates.isApproved); }
  if (updates.name !== undefined) { sets.push(`name = ?`); args.push(updates.name); }
  if (sets.length === 0) return;
  args.push(id);
  await client.execute({ sql: `UPDATE "User" SET ${sets.join(", ")} WHERE id = ?`, args });
}
