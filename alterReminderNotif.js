const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function migrate() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    await client.connect();

    try {
        await client.query(`
            ALTER TABLE "reminders" ADD COLUMN "time" TEXT DEFAULT '09:00';
            ALTER TABLE "reminders" ADD COLUMN "notifications" integer[] DEFAULT '{}';
        `);
        console.log("Migration executed successfully!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}

migrate();
