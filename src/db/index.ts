import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** Opens (and migrates) a SQLite database. Pass ":memory:" in tests. */
export function createDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing().run();
  return db;
}

const g = globalThis as unknown as { __amcDb?: Db };

/** Process-wide singleton. It survives Next.js dev hot reloads. */
export function getDb(): Db {
  if (!g.__amcDb) g.__amcDb = createDb(process.env.DATABASE_URL || "./data/app.db");
  return g.__amcDb;
}

export function getSettings(db: Db): schema.Settings {
  return db.select().from(schema.settings).where(eq(schema.settings.id, 1)).get()!;
}

export { schema };
