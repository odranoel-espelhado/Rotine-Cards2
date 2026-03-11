import { Client } from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log("Connected to DB");

        const res = await client.query(`
            ALTER TABLE "backlog_tasks"
            ALTER COLUMN "remind_me" TYPE integer[]
            USING array["remind_me"]::integer[];
        `);
        console.log("Success:", res);

        const res2 = await client.query(`
            ALTER TABLE "backlog_tasks" RENAME COLUMN "remind_me" TO "notifications";
        `);
        console.log("Renamed success:", res2);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.end();
    }
}

run();
