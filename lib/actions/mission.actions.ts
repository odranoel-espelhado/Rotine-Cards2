"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { missionBlocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type MissionBlock = typeof missionBlocks.$inferSelect;
export type NewMissionBlock = typeof missionBlocks.$inferInsert;

export async function getMissionBlocks(date: string) {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const blocks = await db.query.missionBlocks.findMany({
            where: and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.date, date)
            ),
            orderBy: (missionBlocks, { asc }) => [asc(missionBlocks.startTime)],
        });
        return blocks;
    } catch (error) {
        console.error("Error fetching blocks:", error);
        return [];
    }
}

export async function createMissionBlock(data: Omit<NewMissionBlock, "id" | "userId" | "createdAt">) {
    console.log("[createMissionBlock] Starting...", data);
    const { userId } = await auth();
    if (!userId) {
        console.error("[createMissionBlock] Unauthorized: No userId found");
        return { error: "Unauthorized" };
    }

    try {
        console.log("[createMissionBlock] Checking conflicts for user:", userId, "date:", data.date);
        // 1. Conflict Detection
        // Fetch existing blocks for the day
        const existingBlocks = await db.query.missionBlocks.findMany({
            where: and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.date, data.date)
            )
        });
        console.log("[createMissionBlock] Existing blocks found:", existingBlocks.length);

        // Convert times to minutes for comparison
        const getMinutes = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const newStart = getMinutes(data.startTime);
        const newEnd = newStart + data.totalDuration;

        for (const block of existingBlocks) {
            const blockStart = getMinutes(block.startTime);
            const blockEnd = blockStart + block.totalDuration;

            // Overlap condition: (StartA < EndB) && (EndA > StartB)
            if (newStart < blockEnd && newEnd > blockStart) {
                console.warn("[createMissionBlock] Conflict detected with block:", block.title);
                return { error: `Conflito Temporal com "${block.title}" (${block.startTime})` };
            }
        }

        console.log("[createMissionBlock] Inserting new block...");
        await db.insert(missionBlocks).values({
            userId,
            ...data,
        });
        console.log("[createMissionBlock] Success!");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        console.error("[createMissionBlock] Fatal Error:", error);
        // Return explicit error for user feedback
        return { error: error.message || "Falha crítica ao criar bloco. Verifique logs." };
    }
}

export async function deleteMissionBlock(id: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        await db.delete(missionBlocks).where(
            and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId))
        );
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error deleting block:", error);
        return { error: "Failed to delete block" };
    }
}
