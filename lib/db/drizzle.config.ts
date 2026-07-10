import { defineConfig } from "drizzle-kit";
import { existsSync } from "fs";
import path from "path";

// drizzle-kit is invoked directly rather than through the api-server entrypoint,
// so it has to pick up the root .env itself.
const envFile = path.join(__dirname, "../../.env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
