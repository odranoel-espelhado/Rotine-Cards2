"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { missionBlocks, backlogTasks } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { startOfWeek, addDays, format, parseISO } from "date-fns";

export type MissionBlock = typeof missionBlocks.$inferSelect;
export type NewMissionBlock = typeof missionBlocks.$inferInsert;

export async function getMissionBlocks(date: string) {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        // 1. Fetch specific blocks for this date
        const specificBlocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.date, date)
            ));

        // 2. Fetch recurring blocks (master definitions)
        const recurringBlocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.type, 'recurring'),
                eq(missionBlocks.recurrencePattern, 'weekdays')
            ));

        // 3. Process Recurring Blocks
        const targetDate = parseISO(date);
        const dayOfWeek = targetDate.getDay(); // 0 = Sun, 6 = Sat
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

        const virtualBlocks = [];

        if (isWeekday) {
            for (const rBlock of recurringBlocks) {
                // Skip if overridden by specific block
                if (rBlock.date === date) continue;

                virtualBlocks.push({
                    ...rBlock,
                    id: `${rBlock.id}-virtual-${date}`,
                    date: date,
                    originalId: rBlock.id
                });
            }
        }

        // Merge and Sort
        const allBlocks = [...specificBlocks, ...virtualBlocks].sort((a, b) => {
            const getMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
            return getMins(a.startTime) - getMins(b.startTime);
        });

        return allBlocks;

    } catch (error) {
        console.error("Error fetching blocks:", error);
        return [];
    }
}

export async function createMissionBlock(data: Omit<NewMissionBlock, "id" | "userId" | "createdAt"> & { recurrencePattern?: 'weekdays' }) {
    const { userId } = await auth();
    if (!userId) {
        return { error: "Unauthorized" };
    }

    // Helper for creating individual block instances
    const createInstance = async (dateStr: string, isFixedTasks: boolean) => {
        // Conflict Check
        const existingBlocks = await db.select()
            .from(missionBlocks)
            .where(
                and(
                    eq(missionBlocks.userId, userId),
                    eq(missionBlocks.date, dateStr)
                )
            );

        const getMinutes = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const newStart = getMinutes(data.startTime);
        const newEnd = newStart + data.totalDuration;

        for (const block of existingBlocks) {
            const blockStart = getMinutes(block.startTime);
            const blockEnd = blockStart + block.totalDuration;

            if (newStart < blockEnd && newEnd > blockStart) {
                // Determine conflicting block title
                throw new Error(`Conflito com "${block.title}" em ${dateStr}`);
            }
        }

        const subTasksWithFlag = ((data.subTasks as any[]) || []).map(t => ({ ...t, isFixed: isFixedTasks }));

        await db.insert(missionBlocks).values({
            userId: userId, // Explicitly string
            ...data,
            date: dateStr,
            type: 'unique',
            recurrencePattern: null,
            subTasks: subTasksWithFlag,
        });
    };

    try {
        if (data.recurrencePattern === 'weekdays') {
            const targetDate = parseISO(data.date);
            // Calculate Weekdays (Mon-Fri) for the week of the selected date
            const monday = startOfWeek(targetDate, { weekStartsOn: 1 });

            const promises = [];
            for (let i = 0; i < 5; i++) {
                const day = addDays(monday, i);
                const dateStr = format(day, 'yyyy-MM-dd');
                promises.push(createInstance(dateStr, true));
            }

            await Promise.all(promises);

        } else {
            // Single Block
            await createInstance(data.date, true);
        }

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("[createMissionBlock] Error:", error);
        return { error: error.message || "Erro ao criar bloco." };
    }
}

export async function deleteMissionBlock(id: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // If virtual block (contains -virtual-), delete original master?
        // Or specific logic? For now, assume ID passed is real ID.
        // If UI passes virtual ID, we must handle it. 
        // But UI usually receives 'id' from getMissionBlocks.
        // If virtual, id is `realId-virtual-date`.
        // We should strip suffix if needed, OR user should handle master deletion vs instance deletion.
        // User asked "Recurrent block appears all weeks".
        // Deleting it should delete master? usually yes.
        const realId = id.includes("-virtual-") ? id.split("-virtual-")[0] : id;

        await db.delete(missionBlocks).where(
            and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId))
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
        const realId = id.includes("-virtual-") ? id.split("-virtual-")[0] : id;
        // If toggling a recurring block instance, should we create an exception block?
        // For MVP, just toggle master? (Affects all?).
        // Or create a completion record?
        // Let's toggle Master for now, but ideally we'd fork.
        // Given user request is simple, toggle master.

        await db.update(missionBlocks)
            .set({ status })
            .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error toggling block:", error);
        return { error: "Failed to toggle block" };
    }
}

export async function updateMissionBlock(id: string, data: Partial<Omit<NewMissionBlock, "id" | "userId" | "createdAt">>) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const realId = id.includes("-virtual-") ? id.split("-virtual-")[0] : id;
        await db.update(missionBlocks)
            .set(data)
            .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        console.error("Error updating block:", error);
        return { error: error.message || "Erro ao atualizar" };
    }
}

export async function assignTasksToBlock(blockId: string, tasksToAssign: any[]) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const realId = blockId.includes("-virtual-") ? blockId.split("-virtual-")[0] : blockId;
        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as any[]) || [];
        const newSubtasks = tasksToAssign.map(t => ({
            title: t.title,
            duration: t.estimatedDuration || 15,
            done: false,
            isFixed: false // Allocated tasks are NOT fixed
        }));

        const updatedSubtasks = [...currentSubtasks, ...newSubtasks];

        await db.update(missionBlocks)
            .set({ subTasks: updatedSubtasks })
            .where(eq(missionBlocks.id, realId));

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
        await db.delete(missionBlocks).where(eq(missionBlocks.userId, userId));
        await db.delete(backlogTasks).where(eq(backlogTasks.userId, userId));
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        console.error("Error deleting all data:", error);
        return { error: error.message || "Erro ao limpar dados" };
    }
}

export async function convertTaskToBlock(taskId: string, date: string, startTime: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const [task] = await db.select().from(backlogTasks).where(and(eq(backlogTasks.id, taskId), eq(backlogTasks.userId, userId)));
        if (!task) return { error: "Tarefa não encontrada" };

        const newBlock = {
            userId,
            title: task.title,
            color: task.color || '#3b82f6',
            icon: 'zap',
            date: date,
            startTime: startTime,
            totalDuration: task.estimatedDuration || 30,
            status: 'pending' as const,
            type: 'unique' as const,
            subTasks: [{ title: task.title, duration: task.estimatedDuration || 30, done: false }]
        };

        if (task.subTasks && Array.isArray(task.subTasks) && task.subTasks.length > 0) {
            newBlock.subTasks = task.subTasks as any;
        }

        await db.insert(missionBlocks).values(newBlock);

        await db.delete(backlogTasks).where(eq(backlogTasks.id, taskId));

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error converting task:", error);
        return { error: error.message || "Erro ao converter tarefa" };
    }
}

export async function unassignTaskFromBlock(blockId: string, taskIndex: number, taskData: any) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const realId = blockId.includes("-virtual-") ? blockId.split("-virtual-")[0] : blockId;
        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as any[]) || [];

        // Remove task at index
        if (taskIndex < 0 || taskIndex >= currentSubtasks.length) {
            return { error: "Tarefa não encontrada no bloco" };
        }

        const newSubtasks = [...currentSubtasks];
        newSubtasks.splice(taskIndex, 1);

        // Update block
        await db.update(missionBlocks)
            .set({ subTasks: newSubtasks })
            .where(eq(missionBlocks.id, realId));

        // Create backlog task from removed task
        // "Archives back to task list"
        await db.insert(backlogTasks).values({
            userId,
            title: taskData.title,
            estimatedDuration: parseInt(taskData.duration) || 15,
            status: 'pending',
            createdAt: new Date(),
            color: '#27272a' // Default
        });

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error unassigning task:", error);
        return { error: error.message || "Erro ao arquivar tarefa" };
    }
}
