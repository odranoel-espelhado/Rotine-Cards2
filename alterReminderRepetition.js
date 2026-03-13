import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  try {
    await client.query(`
      ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "repeat_interval_value" integer;
      ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "repeat_interval_unit" text;
    `);
    console.log("Migration executed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await client.end();
  }
}

main();
