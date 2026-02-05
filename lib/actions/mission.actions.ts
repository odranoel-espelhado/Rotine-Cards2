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
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // 1. Conflict Detection
        // Fetch existing blocks for the day
        const existingBlocks = await db.query.missionBlocks.findMany({
            where: and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.date, data.date)
            )
        });

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
                return { error: "Conflito Temporal: Já existe uma missão neste horário." };
            }
        }

        await db.insert(missionBlocks).values({
            userId,
            ...data,
        });
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error creating block:", error);
        return { error: "Failed to create block" };
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
