import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// The API tests run against a throwaway SQLite file (prisma/test.db) that this
// setup recreates from the schema on every run. It never touches dev.db.
export default function globalSetup() {
  const testDb = path.join(__dirname, "../../prisma/test.db");
  rmSync(testDb, { force: true });
  rmSync(`${testDb}-journal`, { force: true });
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
