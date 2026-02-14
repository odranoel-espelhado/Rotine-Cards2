"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { missionBlocks, backlogTasks } from "@/db/schema";
import { eq, and, desc, inArray, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { startOfWeek, addDays, format, parseISO } from "date-fns";
import { toggleBacklogSubTask } from "@/lib/actions/backlog.actions";

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
            // Check start date: recurrence only applies from start date onwards
            if (date < rBlock.date) continue;

            // Check exceptions (dates where this instance was deleted/modified)
            const exceptions = (rBlock.exceptions as string[]) || [];
            if (exceptions.includes(date)) continue;

            let matches = false;

            if (rBlock.recurrencePattern === 'weekdays') {
                // Legacy support or specific logic for single-block weekdays if any
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
            const pattern = data.recurrencePattern || 'weekly';

            if (pattern === 'weekdays') {
                // User requested Monday-Friday repetition.
                // Requirement: Create 5 SEPARATE master blocks (Weekly), one for each day.
                // This gives granular control per weekday series.

                const inputDate = parseISO(data.date);
                // Get Monday of the week of the input date
                // Note: startOfWeek defaults to Sunday (0). We want Monday (1).
                const mondayDate = startOfWeek(inputDate, { weekStartsOn: 1 });

                // Create blocks for Mon(0) through Fri(4) relative to the mondayDate
                for (let i = 0; i < 5; i++) {
                    let blockDate = addDays(mondayDate, i);
                    const blockDateStr = format(blockDate, 'yyyy-MM-dd');

                    // If this weekday is in the past relative to the start date, 
                    // start the series next week.
                    if (blockDateStr < data.date) {
                        blockDate = addDays(blockDate, 7);
                    }

                    await db.insert(missionBlocks).values({
                        userId: userId,
                        ...data,
                        date: format(blockDate, 'yyyy-MM-dd'),
                        type: 'recurring',
                        recurrencePattern: 'weekly', // Force weekly for each
                        exceptions: [],
                    });
                }

            } else {
                // Standard Weekly (or others if added later)
                await db.insert(missionBlocks).values({
                    userId: userId,
                    ...data,
                    type: 'recurring',
                    recurrencePattern: pattern,
                    exceptions: [],
                });
            }

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

export async function deleteMissionBlock(id: string, deleteAll: boolean = false) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // Check if it is a virtual block
        if (id.includes("-virtual-")) {
            const [realId, date] = id.split("-virtual-");
            if (!realId || !date) return { error: "Invalid virtual ID" };

            if (deleteAll) {
                // Advanced Logic: If recurrencePattern is 'weekdays' (Mon-Fri) and we delete "Fridays",
                // we technically need to remove Friday from the series.
                // Since we don't have complex patterns, we:
                // 1. Delete the Master Block (Monday-Friday)
                // 2. Re-create 'weekly' blocks for the OTHER days (Mon, Tue, Wed, Thu).

                const [masterBlock] = await db.select().from(missionBlocks)
                    .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

                if (masterBlock && masterBlock.recurrencePattern === 'weekdays') {
                    // It is a Mon-Fri block.
                    const targetDate = parseISO(date);
                    const targetDay = targetDate.getDay(); // 0-6

                    // Weekdays are 1, 2, 3, 4, 5.
                    const daysToKeep = [1, 2, 3, 4, 5].filter(d => d !== targetDay);

                    // 1. Delete Master
                    await db.delete(missionBlocks).where(eq(missionBlocks.id, realId));

                    // 2. Create new blocks for kept days
                    // We need to calculate a valid 'date' for each new weekly block.
                    // The 'date' field in master block serves as the anchor.
                    // We can use the original master block date, adjust it to the specific day of week.
                    const anchorDate = parseISO(masterBlock.date);
                    const anchorDay = anchorDate.getDay();
                    // Align anchor to Monday to make it easy
                    const mondayDate = addDays(anchorDate, 1 - anchorDay);

                    for (const dayIndex of daysToKeep) {
                        // Calculate Date for this dayIndex
                        // Monday + (dayIndex - 1)
                        const newDate = addDays(mondayDate, dayIndex - 1);

                        await db.insert(missionBlocks).values({
                            userId: userId,
                            title: masterBlock.title,
                            date: format(newDate, 'yyyy-MM-dd'),
                            startTime: masterBlock.startTime,
                            totalDuration: masterBlock.totalDuration,
                            color: masterBlock.color,
                            icon: masterBlock.icon,
                            type: 'recurring',
                            recurrencePattern: 'weekly', // Now it is weekly
                            status: masterBlock.status,
                            subTasks: masterBlock.subTasks,
                            exceptions: [],
                        });
                    }
                } else {
                    // Normal behavior ('weekly' or default): Delete the MASTER block (removes all occurrences)
                    await db.delete(missionBlocks).where(
                        and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId))
                    );
                }
            } else {
                // Default: Exception (Remove only this instance)
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
            }
        } else {
            // Normal delete (or Master block directly)
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
                subTasks: (masterBlock.subTasks as any[]).map(t => ({ ...t, done: status === 'completed' })),
                exceptions: [],
            });

        } else {
            // Update simple block
            const [currentBlock] = await db.select().from(missionBlocks)
                .where(and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId)));

            if (currentBlock) {
                const updatedSubtasks = (currentBlock.subTasks as any[]).map(t => ({
                    ...t,
                    done: status === 'completed'
                }));

                await db.update(missionBlocks)
                    .set({ status, subTasks: updatedSubtasks })
                    .where(and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId)));
            }
        }

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error toggling block:", error);
        return { error: "Failed to toggle block" };
    }
}

export async function updateMissionBlock(id: string, data: Partial<Omit<NewMissionBlock, "id" | "userId" | "createdAt">>, updateAll: boolean = false) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        if (id.includes("-virtual-")) {
            const [realId, date] = id.split("-virtual-");

            if (updateAll) {
                // Update MASTER block (affects all future instances)
                await db.update(missionBlocks)
                    .set(data)
                    .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));
            } else {
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
                await db.insert(missionBlocks).values({
                    userId: userId,
                    title: data.title || masterBlock.title,
                    date: date,
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
            }

        } else {
            // Normal update
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
            deadline: t.deadline,
            subTasks: t.subTasks || [],
            // Virtual Task Metadata
            isVirtual: t.isVirtual,
            originalTaskId: t.originalTaskId,
            originalSubTaskIndex: t.subTaskIndex
        }));

        const updatedSubtasks = [...currentSubtasks, ...newSubtasks];

        await db.update(missionBlocks)
            .set({ subTasks: updatedSubtasks })
            .where(eq(missionBlocks.id, targetBlockId));

        // Only delete REAL tasks, not virtual subtasks
        const taskIds = tasksToAssign.filter(t => !t.isVirtual).map(t => t.id);
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
        let realTaskId = taskId;
        let subTaskIndex = -1;
        let isVirtual = false;

        if (taskId.includes("-sub-")) {
            const parts = taskId.split("-sub-");
            realTaskId = parts[0];
            subTaskIndex = parseInt(parts[1]);
            isVirtual = true;
        }

        const [task] = await db.select().from(backlogTasks).where(and(eq(backlogTasks.id, realTaskId), eq(backlogTasks.userId, userId)));
        if (!task) return { error: "Tarefa não encontrada" };

        let blockTitle = task.title;
        let blockDuration = task.estimatedDuration || 30;
        let subTasksForBlock: any[] = [{ title: task.title, duration: blockDuration, done: false }];

        if (isVirtual && subTaskIndex !== -1 && task.subTasks) {
            const sub = (task.subTasks as any[])[subTaskIndex];
            if (sub) {
                blockTitle = `Subtarefa (${sub.title}) - Tarefa (${task.title})`;
                blockDuration = parseInt(sub.duration) || 15;
                subTasksForBlock = [{
                    title: blockTitle,
                    duration: blockDuration,
                    done: false,
                    isVirtual: true,
                    originalTaskId: realTaskId,
                    originalSubTaskIndex: subTaskIndex
                }];
            }
        } else {
            if (task.subTasks && Array.isArray(task.subTasks) && task.subTasks.length > 0) {
                subTasksForBlock = task.subTasks as any;
            }
        }

        // Lookup existing block style based on linkedBlockType or title
        const [existingBlock] = await db.select().from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.title, task.linkedBlockType || task.title)
            ))
            .limit(1);

        const newBlock = {
            userId,
            title: blockTitle,
            color: existingBlock?.color || task.color || '#3b82f6',
            icon: existingBlock?.icon || 'zap',
            date: date,
            startTime: startTime,
            totalDuration: blockDuration,
            status: 'pending' as const,
            type: 'unique' as const,
            subTasks: subTasksForBlock
        };

        await db.insert(missionBlocks).values(newBlock);

        if (!isVirtual) {
            await db.delete(backlogTasks).where(eq(backlogTasks.id, realTaskId));
        }

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
            deadline: taskData.deadline,
            subTasks: taskData.subTasks || []
        });

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error unassigning task:", error);
        return { error: error.message || "Erro ao arquivar tarefa" };
    }
}

export async function toggleSubTaskCompletion(blockId: string, taskIndex: number, currentDone: boolean) {
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

        if (taskIndex < 0 || taskIndex >= currentSubtasks.length) {
            return { error: "Tarefa não encontrada no bloco" };
        }

        const newSubtasks = [...currentSubtasks];
        newSubtasks[taskIndex] = { ...newSubtasks[taskIndex], done: !currentDone };

        await db.update(missionBlocks)
            .set({ subTasks: newSubtasks })
            .where(eq(missionBlocks.id, targetBlockId));

        if (newSubtasks[taskIndex].isVirtual) {
            const t = newSubtasks[taskIndex];
            if (t.originalTaskId && t.originalSubTaskIndex !== undefined) {
                // Sync with backlog: pass currentDone so it flips to the new state
                await toggleBacklogSubTask(t.originalTaskId, t.originalSubTaskIndex, currentDone);
            }
        }

        // Check if ALL are done to auto-complete block
        const allDone = newSubtasks.every((t: any) => t.done);
        if (allDone) {
            await db.update(missionBlocks)
                .set({ status: 'completed' })
                .where(eq(missionBlocks.id, targetBlockId));
        } else {
            // Optional: If unchecking one, should we uncheck the block? Valid UX.
            // Let's do it to keep state consistent.
            await db.update(missionBlocks)
                .set({ status: 'pending' })
                .where(eq(missionBlocks.id, targetBlockId));
        }

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error toggling subtask:", error);
        return { error: error.message || "Erro ao atualizar tarefa" };
    }
}

export async function checkAndArchivePastTasks() {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const today = format(new Date(), 'yyyy-MM-dd');

        const pastBlocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                lt(missionBlocks.date, today),
                eq(missionBlocks.type, 'unique')
            ));

        for (const block of pastBlocks) {
            const currentSubtasks = (block.subTasks as any[]) || [];
            if (currentSubtasks.length === 0) continue;

            const tasksToArchive = currentSubtasks.filter(t => !t.done && !t.isFixed);

            if (tasksToArchive.length > 0) {
                // Archive tasks (batch insert possible?)
                for (const task of tasksToArchive) {
                    await db.insert(backlogTasks).values({
                        userId,
                        title: task.title,
                        estimatedDuration: parseInt(task.duration) || 15,
                        status: 'pending',
                        createdAt: new Date(),
                        priority: task.originalPriority || 'medium',
                        linkedBlockType: task.originalLinkedBlockType,
                        color: task.originalColor || '#27272a',
                        deadline: task.deadline,
                        subTasks: task.subTasks || []
                    });
                }

                // Update block: Keep only Done OR Fixed tasks
                const remainingSubtasks = currentSubtasks.filter(t => t.done || t.isFixed);

                await db.update(missionBlocks)
                    .set({ subTasks: remainingSubtasks })
                    .where(eq(missionBlocks.id, block.id));
            }
        }

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error archiving past tasks:", error);
        return { error: error.message || "Failed to archive tasks" };
    }
}

export async function toggleNestedSubTaskCompletion(id: string, parentTaskIndex: number, subTaskIndex: number, currentDone: boolean) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        let targetBlockId = id;

        // Fork if virtual
        if (id.includes("-virtual-")) {
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

        if (parentTaskIndex < 0 || parentTaskIndex >= currentSubtasks.length) {
            return { error: "Tarefa pai não encontrada" };
        }

        // Clone deeply enough
        const newSubtasks = [...currentSubtasks];
        const parentTask = { ...newSubtasks[parentTaskIndex] };

        const nestedSubTasks = [...(parentTask.subTasks || [])];

        if (subTaskIndex < 0 || subTaskIndex >= nestedSubTasks.length) {
            return { error: "Subtarefa não encontrada" };
        }

        nestedSubTasks[subTaskIndex] = {
            ...nestedSubTasks[subTaskIndex],
            done: !currentDone
        };

        parentTask.subTasks = nestedSubTasks;
        newSubtasks[parentTaskIndex] = parentTask;

        await db.update(missionBlocks)
            .set({ subTasks: newSubtasks })
            .where(eq(missionBlocks.id, targetBlockId));

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error toggling nested subtask:", error);
        return { error: error.message || "Erro ao atualizar subtarefa" };
    }
}
