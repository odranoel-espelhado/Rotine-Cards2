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
                eq(missionBlocks.date, date),
                eq(missionBlocks.type, 'unique')
            ));

        // 2. Fetch recurring blocks (master definitions)
        const recurringBlocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.type, 'recurring')
            ));

        // 3. Process Recurring Blocks
        const targetDate = parseISO(date);
        const dayOfWeek = targetDate.getDay(); // 0 = Sun, 6 = Sat
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

        const virtualBlocks = [];

        for (const rBlock of recurringBlocks) {
            // Check exceptions (dates where this instance was deleted/modified)
            const exceptions = (rBlock.exceptions as string[]) || [];
            if (exceptions.includes(date)) continue;

            let matches = false;

            if (rBlock.recurrencePattern === 'weekdays') {
                if (isWeekday) matches = true;
            } else if (rBlock.recurrencePattern === 'weekly') {
                // Check if same day of week
                const rDate = parseISO(rBlock.date);
                if (rDate.getDay() === dayOfWeek) matches = true;
            }

            if (matches) {
                virtualBlocks.push({
                    ...rBlock,
                    id: `${rBlock.id}-virtual-${date}`,
                    date: date,
                    type: 'recurring',
                    // Important: Keep original block info but with virtual ID
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

export async function createMissionBlock(data: Omit<NewMissionBlock, "id" | "userId" | "createdAt"> & { recurrencePattern?: 'weekdays' | 'weekly' }) {
    const { userId } = await auth();
    if (!userId) {
        return { error: "Unauthorized" };
    }

    try {
        if (data.type === 'recurring') {
            // Recurring Block Logic
            // Just create one master record.
            // If recurrencePattern is undefined but type is recurring, default to 'weekly'
            const pattern = data.recurrencePattern || 'weekly';

            await db.insert(missionBlocks).values({
                userId: userId,
                ...data,
                type: 'recurring',
                recurrencePattern: pattern,
                exceptions: [],
            });

        } else {
            // Unique Block Logic
            // Conflict Check
            const existingBlocks = await db.select()
                .from(missionBlocks)
                .where(
                    and(
                        eq(missionBlocks.userId, userId),
                        eq(missionBlocks.date, data.date),
                        eq(missionBlocks.type, 'unique')
                    )
                );

            const getMinutes = (timeStr: string) => {
                const [h, m] = timeStr.split(':').map(Number);
                return h * 60 + m;
            };

            const newStart = getMinutes(data.startTime);
            const newEnd = newStart + data.totalDuration;

            // Simple conflict check against UNIQUE blocks only for now.
            // (Checking against virtuals is harder but we can skip it for MVP as user didn't ask)
            for (const block of existingBlocks) {
                const blockStart = getMinutes(block.startTime);
                const blockEnd = blockStart + block.totalDuration;

                if (newStart < blockEnd && newEnd > blockStart) {
                    throw new Error(`Conflito com "${block.title}"`);
                }
            }

            await db.insert(missionBlocks).values({
                userId: userId,
                ...data,
                type: 'unique',
                recurrencePattern: null,
            });
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
        // Check if it is a virtual block
        if (id.includes("-virtual-")) {
            const [realId, date] = id.split("-virtual-");
            if (!realId || !date) return { error: "Invalid virtual ID" };

            // Add exception to master block
            const [masterBlock] = await db.select().from(missionBlocks)
                .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

            if (masterBlock) {
                const currentExceptions = (masterBlock.exceptions as string[]) || [];
                if (!currentExceptions.includes(date)) {
                    await db.update(missionBlocks)
                        .set({ exceptions: [...currentExceptions, date] })
                        .where(eq(missionBlocks.id, realId));
                }
            }
        } else {
            // Normal delete
            await db.delete(missionBlocks).where(
                and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId))
            );
        }

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
        if (id.includes("-virtual-")) {
            // Forking logic similar to update
            const [realId, date] = id.split("-virtual-");
            const [masterBlock] = await db.select().from(missionBlocks)
                .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

            if (!masterBlock) return { error: "Master block not found" };

            // 1. Add Exception
            const currentExceptions = (masterBlock.exceptions as string[]) || [];
            if (!currentExceptions.includes(date)) {
                await db.update(missionBlocks)
                    .set({ exceptions: [...currentExceptions, date] })
                    .where(eq(missionBlocks.id, realId));
            }

            // 2. Create Unique Block with new status
            await db.insert(missionBlocks).values({
                userId: userId,
                title: masterBlock.title,
                date: date,
                startTime: masterBlock.startTime,
                totalDuration: masterBlock.totalDuration,
                color: masterBlock.color,
                icon: masterBlock.icon,
                type: 'unique',
                recurrencePattern: null,
                status: status, // The new status
                subTasks: masterBlock.subTasks,
                exceptions: [],
            });

        } else {
            await db.update(missionBlocks)
                .set({ status })
                .where(and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId)));
        }

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
        if (id.includes("-virtual-")) {
            const [realId, date] = id.split("-virtual-");

            // Fork: Create exception on master + Create new unique block
            const [masterBlock] = await db.select().from(missionBlocks)
                .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

            if (!masterBlock) return { error: "Master block not found" };

            // 1. Add Exception
            const currentExceptions = (masterBlock.exceptions as string[]) || [];
            if (!currentExceptions.includes(date)) {
                await db.update(missionBlocks)
                    .set({ exceptions: [...currentExceptions, date] })
                    .where(eq(missionBlocks.id, realId));
            }

            // 2. Create Unique Block (Clone + Update)
            // Use provided data to override master data
            await db.insert(missionBlocks).values({
                userId: userId,
                title: data.title || masterBlock.title,
                date: date, // The specific date
                startTime: data.startTime || masterBlock.startTime,
                totalDuration: data.totalDuration || masterBlock.totalDuration,
                color: data.color || masterBlock.color,
                icon: data.icon || masterBlock.icon,
                type: 'unique',
                recurrencePattern: null,
                status: (data.status as any) || masterBlock.status,
                subTasks: data.subTasks || masterBlock.subTasks,
                exceptions: [],
            });

        } else {
            await db.update(missionBlocks)
                .set(data)
                .where(and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId)));
        }

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
        let targetBlockId = blockId;

        // Helper to fork if virtual
        if (blockId.includes("-virtual-")) {
            const [realId, date] = blockId.split("-virtual-");
            const [masterBlock] = await db.select().from(missionBlocks)
                .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

            if (!masterBlock) return { error: "Master block not found" };

            // 1. Add Exception
            const currentExceptions = (masterBlock.exceptions as string[]) || [];
            if (!currentExceptions.includes(date)) {
                await db.update(missionBlocks)
                    .set({ exceptions: [...currentExceptions, date] })
                    .where(eq(missionBlocks.id, realId));
            }

            // 2. Create Unique Block (Clone)
            const [newBlock] = await db.insert(missionBlocks).values({
                userId: userId,
                title: masterBlock.title,
                date: date,
                startTime: masterBlock.startTime,
                totalDuration: masterBlock.totalDuration,
                color: masterBlock.color,
                icon: masterBlock.icon,
                type: 'unique',
                recurrencePattern: null,
                status: masterBlock.status,
                subTasks: masterBlock.subTasks,
                exceptions: [],
            }).returning();

            targetBlockId = newBlock.id;
        }

        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, targetBlockId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as any[]) || [];
        const newSubtasks = tasksToAssign.map(t => ({
            title: t.title,
            duration: t.estimatedDuration || 15,
            done: false,
            isFixed: false, // Allocated tasks are NOT fixed
            // Store original data
            originalPriority: t.priority,
            originalLinkedBlockType: t.linkedBlockType,
            originalColor: t.color,
            deadline: t.deadline
        }));

        const updatedSubtasks = [...currentSubtasks, ...newSubtasks];

        await db.update(missionBlocks)
            .set({ subTasks: updatedSubtasks })
            .where(eq(missionBlocks.id, targetBlockId));

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

        // Lookup existing block style based on linkedBlockType or title
        const [existingBlock] = await db.select().from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.title, task.linkedBlockType || task.title)
            ))
            .limit(1);

        const newBlock = {
            userId,
            title: task.title,
            color: existingBlock?.color || task.color || '#3b82f6',
            icon: existingBlock?.icon || 'zap',
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
        let targetBlockId = blockId;

        // Fork if virtual
        if (blockId.includes("-virtual-")) {
            const [realId, date] = blockId.split("-virtual-");
            const [masterBlock] = await db.select().from(missionBlocks)
                .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

            if (!masterBlock) return { error: "Master block not found" };

            // 1. Add Exception
            const currentExceptions = (masterBlock.exceptions as string[]) || [];
            if (!currentExceptions.includes(date)) {
                await db.update(missionBlocks)
                    .set({ exceptions: [...currentExceptions, date] })
                    .where(eq(missionBlocks.id, realId));
            }

            // 2. Create Unique Block (Clone)
            const [newBlock] = await db.insert(missionBlocks).values({
                userId: userId,
                title: masterBlock.title,
                date: date,
                startTime: masterBlock.startTime,
                totalDuration: masterBlock.totalDuration,
                color: masterBlock.color,
                icon: masterBlock.icon,
                type: 'unique',
                recurrencePattern: null,
                status: masterBlock.status,
                subTasks: masterBlock.subTasks,
                exceptions: [],
            }).returning();

            targetBlockId = newBlock.id;
        }

        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, targetBlockId), eq(missionBlocks.userId, userId)));

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
            .where(eq(missionBlocks.id, targetBlockId));

        // Create backlog task from removed task
        // "Archives back to task list"
        await db.insert(backlogTasks).values({
            userId,
            title: taskData.title,
            estimatedDuration: parseInt(taskData.duration) || 15,
            status: 'pending',
            createdAt: new Date(),
            // Restore original data
            priority: taskData.originalPriority || 'media',
            linkedBlockType: taskData.originalLinkedBlockType,
            color: taskData.originalColor || '#27272a',
            deadline: taskData.deadline
        });

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error unassigning task:", error);
        return { error: error.message || "Erro ao arquivar tarefa" };
    }
}
