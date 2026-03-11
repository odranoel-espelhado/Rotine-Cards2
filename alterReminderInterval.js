const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    await client.connect();

    try {
        await client.query(`
            ALTER TABLE "reminders" ADD COLUMN "interval_hours" integer;
            ALTER TABLE "reminders" ADD COLUMN "interval_type" TEXT;
            ALTER TABLE "reminders" ADD COLUMN "interval_occurrences" integer;
        `);
        console.log("Migration executed successfully!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}

migrate();
