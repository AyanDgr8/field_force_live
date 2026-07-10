import { defineConfig } from "drizzle-kit";
import { existsSync } from "fs";
import path from "path";

// drizzle-kit is invoked directly rather than through the api-server entrypoint,
// so it has to pick up the root .env itself.
const envFile = path.join(__dirname, "../../.env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const databaseUrl = process.env.DATABASE_URL ?? (
  process.env.MYSQL_HOST &&
  process.env.MYSQL_USER &&
  process.env.MYSQL_PASSWORD &&
  process.env.MYSQL_DATABASE
    ? `mysql://${encodeURIComponent(process.env.MYSQL_USER)}:${encodeURIComponent(process.env.MYSQL_PASSWORD)}@${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT ?? "3306"}/${process.env.MYSQL_DATABASE}`
    : undefined
);

if (!databaseUrl) {
  throw new Error("Provide DATABASE_URL or the MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE variables");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "mysql",
  dbCredentials: {
    url: databaseUrl,
  },
});
