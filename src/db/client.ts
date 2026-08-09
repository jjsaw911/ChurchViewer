import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Next's dev server re-evaluates modules on every change; without this the
// process would leak a connection pool per reload.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 10,
  });

if (!env.isProduction) globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
