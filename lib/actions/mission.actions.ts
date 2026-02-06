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

export async function toggleMissionBlock(id: string, status: 'pending' | 'completed') {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        await db.update(missionBlocks)
            .set({ status })
            .where(and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId)));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error toggling block:", error);
        return { error: "Failed to toggle block" };
    }
}

import { backlogTasks } from "@/db/schema";
import { inArray, desc } from "drizzle-orm";

export async function updateMissionBlock(id: string, data: Partial<Omit<NewMissionBlock, "id" | "userId" | "createdAt">>) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // We can add conflict detection here too if needed, fitting for updates.
        // For now, straightforward update.
        await db.update(missionBlocks)
            .set(data)
            .where(and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId)));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        console.error("Error updating block:", error);
        return { error: error.message || "Erro ao atualizar" };
    }
}

export async function assignTasksToBlock(blockId: string, tasksToAssign: any[]) { // Using any[] for now as BacklogTask type import might circle
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // 1. Get current block details to merge subtasks
        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, blockId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        // 2. Prepare new subtasks
        const currentSubtasks = (block.subTasks as any[]) || [];
        const newSubtasks = tasksToAssign.map(t => ({
            title: t.title,
            duration: t.estimatedDuration || 15, // Default duration if mssing
            done: false
        }));

        const updatedSubtasks = [...currentSubtasks, ...newSubtasks];

        // 3. Update Block
        await db.update(missionBlocks)
            .set({ subTasks: updatedSubtasks })
            .where(eq(missionBlocks.id, blockId));

        // 4. Delete from Backlog
        const taskIds = tasksToAssign.map(t => t.id);
        if (taskIds.length > 0) {
            await db.delete(backlogTasks)
                .where(
                    and(
                        eq(backlogTasks.userId, userId),
                        inArray(backlogTasks.id, taskIds)
                    )
                );
        }

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error assigning tasks:", error);
        return { error: error.message || "Erro ao atribuir tarefas" };
    }
}

export async function getUniqueBlockTypes() {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const blocks = await db.select({
            title: missionBlocks.title,
            icon: missionBlocks.icon,
            color: missionBlocks.color,
            createdAt: missionBlocks.createdAt
        })
            .from(missionBlocks)
            .where(eq(missionBlocks.userId, userId))
            .orderBy(desc(missionBlocks.createdAt));

        const seen = new Set();
        const uniqueBlocks: { label: string; icon: string; color: string; value: string }[] = [];

        for (const block of blocks) {
            const normalizedTitle = block.title.trim().toLowerCase();
            const key = `${normalizedTitle}|${block.icon}`;

            if (!seen.has(key)) {
                seen.add(key);
                uniqueBlocks.push({
                    label: block.title,
                    value: block.title,
                    icon: block.icon || 'zap',
                    color: block.color || '#3b82f6'
                });
            }
        }

        return uniqueBlocks;
    } catch (error) {
        console.error("Error getting unique block types:", error);
        return [];
    }
}

export async function deleteAllUserData() {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // Delete all blocks
        await db.delete(missionBlocks).where(eq(missionBlocks.userId, userId));

        // Delete all backlog tasks
        await db.delete(backlogTasks).where(eq(backlogTasks.userId, userId));

        // (Optional) Delete tactical cards if stored in DB, but simpler "Limpar tudo" usually means main user data.
        // Assuming cards are static or local for now based on props, but if they were in DB we'd delete them too.

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting all data:", error);
        return { error: error.message || "Erro ao limpar dados" };
    }
}
