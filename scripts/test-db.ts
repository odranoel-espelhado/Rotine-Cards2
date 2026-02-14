import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { backlogTasks } from "../db/schema";
import { eq } from "drizzle-orm";

async function runTest() {
    console.log("Starting DB test for description field...");
    const { db } = await import("../db");
    try {
        // Find existing user (assuming at least one user exists)
        // We can create a dummy user logic, but let's try to fetch recent task user ID
        const existingTasks = await db.select().from(backlogTasks).limit(1);
        let userId = existingTasks[0]?.userId;

        if (!userId) {
            console.log("No tasks found to fetch user ID. Trying to fetch first user directly (if users table is exposed via db query).");
            // Fallback logic if needed, but assuming user exists as tasks were shown in screenshot
            const users = await db.query.users.findMany({ limit: 1 });
            if (users.length > 0) userId = users[0].id;
        }

        if (!userId) {
            console.error("No user found to run test.");
            process.exit(1);
        }

        console.log("Using user ID:", userId);

        const testTitle = `Test Desc Task ${Date.now()}`;
        const testDesc = "This is a meaningful description test.";

        console.log("Inserting task with description:", testDesc);

        const [inserted] = await db.insert(backlogTasks).values({
            userId: userId,
            title: testTitle,
            description: testDesc,
            estimatedDuration: 30,
            priority: "media",
            status: "pending"
        }).returning();

        console.log("Inserted Task Result:", JSON.stringify(inserted, null, 2));

        if (inserted.description === testDesc) {
            console.log("SUCCESS: Insert returned correct description.");
        } else {
            console.error("FAIL: Insert returned wrong description:", inserted.description);
        }

        console.log("Reading task back from DB...");
        const [readTask] = await db.select().from(backlogTasks).where(eq(backlogTasks.id, inserted.id));

        console.log("Read Task Result:", JSON.stringify(readTask, null, 2));

        if (readTask.description === testDesc) {
            console.log("SUCCESS: Read returned correct description.");
        } else {
            console.error("FAIL: Read returned wrong description:", readTask.description);
        }

        // Cleanup
        console.log("Cleaning up test task...");
        await db.delete(backlogTasks).where(eq(backlogTasks.id, inserted.id));

    } catch (error) {
        console.error("Test failed with error:", error);
    }
}

runTest();
