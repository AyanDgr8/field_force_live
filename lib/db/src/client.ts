import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.DATABASE_URL && !process.env.MYSQL_HOST) {
  throw new Error(
    "MySQL configuration must be set. Provide DATABASE_URL or MYSQL_HOST variables.",
  );
}

const connection = process.env.MYSQL_HOST
  ? {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? "fieldforce",
    }
  : { uri: process.env.DATABASE_URL! };

export const pool = mysql.createPool({
  ...connection,
  timezone: "Z",
  supportBigNumbers: true,
  bigNumberStrings: false,
});

// Drizzle stores `datetime` columns as literal UTC strings, but a column
// defaulted with `now()` is evaluated by the server in the *session* time zone.
// Unless the session is pinned to UTC those defaults are written as local
// wall-clock and then read back as if they were UTC.
pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export const db = drizzle(pool, { schema, mode: "default" });
