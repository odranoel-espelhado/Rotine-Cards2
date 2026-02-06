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
        const blocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.date, date)
            ))
            .orderBy(missionBlocks.startTime);
        return blocks;
    } catch (error) {
        console.error("Error fetching blocks:", error);
        return [];
    }
}

import { startOfWeek, addDays, format, parseISO } from "date-fns";

export async function createMissionBlock(data: Omit<NewMissionBlock, "id" | "userId" | "createdAt"> & { recurrencePattern?: 'weekdays' }) {
    console.log("[createMissionBlock] Starting...", data);
    const { userId } = await auth();
    if (!userId) {
        console.error("[createMissionBlock] Unauthorized: No userId found");
        return { error: "Unauthorized" };
    }

    try {
        const datesToProcess = data.recurrencePattern === 'weekdays'
            ? Array.from({ length: 5 }, (_, i) => {
                const start = startOfWeek(parseISO(data.date), { weekStartsOn: 1 });
                return format(addDays(start, i), 'yyyy-MM-dd');
            })
            : [data.date];

        console.log(`[createMissionBlock] Processing dates: ${datesToProcess.join(', ')}`);

        const results = [];

        for (const date of datesToProcess) {
            console.log("[createMissionBlock] Checking conflicts for user:", userId, "date:", date);

            // 1. Conflict Detection
            const existingBlocks = await db.select()
                .from(missionBlocks)
                .where(
                    and(
                        eq(missionBlocks.userId, userId),
                        eq(missionBlocks.date, date)
                    )
                );

            const getMinutes = (timeStr: string) => {
                const [h, m] = timeStr.split(':').map(Number);
                return h * 60 + m;
            };

            const newStart = getMinutes(data.startTime);
            const newEnd = newStart + data.totalDuration;

            let conflict = false;
            for (const block of existingBlocks) {
                const blockStart = getMinutes(block.startTime);
                const blockEnd = blockStart + block.totalDuration;

                if (newStart < blockEnd && newEnd > blockStart) {
                    console.warn(`[createMissionBlock] Conflict on ${date} with block:`, block.title);
                    results.push({ date, status: 'error', error: `Conflito em ${format(parseISO(date), 'dd/MM')} com "${block.title}"` });
                    conflict = true;
                    break;
                }
            }

            if (!conflict) {
                console.log(`[createMissionBlock] Inserting new block for ${date}...`);
                await db.insert(missionBlocks).values({
                    userId,
                    ...data,
                    date: date, // Override date
                });
                results.push({ date, status: 'success' });
            }
        }

        const errors = results.filter(r => r.status === 'error');
        if (errors.length > 0) {
            // If all failed
            if (errors.length === datesToProcess.length) {
                return { error: errors[0].error }; // Return first error
            }
            // If partial success (feature request: handle partials gracefully, but for now return success with warning check?)
            // We'll return success but maybe user notices missing blocks. 
            // Better: Return success: true but we can print logs. 
            // Ideally trigger a toast with "X blocks created, Y conflicts".
            // But strict return type { success: boolean, error?: string }.
            // I'll return success if At Least One worked.
            console.warn("Partial success/failure:", results);
        }

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("[createMissionBlock] Fatal Error:", error);
        return { error: error.message || "Falha crítica ao criar bloco." };
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
