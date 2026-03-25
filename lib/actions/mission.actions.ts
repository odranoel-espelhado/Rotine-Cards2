"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { missionBlocks, backlogTasks } from "@/db/schema";
import { eq, and, desc, inArray, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { startOfWeek, addDays, format, parseISO } from "date-fns";
import { toggleBacklogSubTask } from "@/lib/actions/backlog.actions";
import { getUserSettings } from "@/lib/actions/user.actions";

import { matchesRepeatPattern } from "@/lib/utils";

export type MissionBlock = typeof missionBlocks.$inferSelect;
export type NewMissionBlock = typeof missionBlocks.$inferInsert;

export interface SubTask {
    id?: string | null;
    title: string;
    description?: string | null;
    duration: number | string;
    done: boolean;
    isFixed?: boolean | null;
    isFromTask?: boolean | null;
    isVirtual?: boolean | null;
    originalTaskId?: string | null;
    originalSubTaskIndex?: number | null;
    originalPriority?: string | null;
    originalLinkedBlockType?: string | null;
    originalColor?: string | null;
    deadline?: string | null;
    notifications?: number[] | null;
    suggestible?: boolean | null;
    subTasks?: SubTask[] | null;
    isHidden?: boolean | null; // Se a subtarefa está oculta na zona de execução
}

export type TaskPayload = Partial<SubTask> & {
    id?: string;
    estimatedDuration?: number;
    color?: string;
    priority?: string;
    linkedBlockType?: string;
    subTaskIndex?: number;
    originalPriority?: string;
    originalLinkedBlockType?: string;
    originalColor?: string;
};

/**
 * Internal helper to handle the forking logic of a virtual block instance into a real unique block.
 * Returns the UUID of the newly created block.
 */
async function forkVirtualBlock(tx: any, virtualId: string, userId: string): Promise<string> {
    const [realId, date] = virtualId.split("-virtual-");
    const [masterBlock] = await tx.select().from(missionBlocks)
        .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

    if (!masterBlock) throw new Error("Master block not found");

    // 1. Add exception to master block
    const currentExceptions = (masterBlock.exceptions as string[]) || [];
    if (!currentExceptions.includes(date)) {
        await tx.update(missionBlocks)
            .set({ exceptions: [...currentExceptions, date] })
            .where(eq(missionBlocks.id, realId));
    }

    // 2. Clone to a new unique block
    const isCompleted = (masterBlock.completedDates as string[] || []).includes(date);
    const [newBlock] = await tx.insert(missionBlocks).values({
        userId,
        title: masterBlock.title,
        date: date,
        startTime: masterBlock.startTime,
        totalDuration: masterBlock.totalDuration,
        color: masterBlock.color,
        icon: masterBlock.icon,
        type: 'unique',
        recurrencePattern: masterBlock.recurrencePattern,
        status: isCompleted ? 'completed' : 'pending',
        subTasks: masterBlock.subTasks,
        description: masterBlock.description,
        priority: masterBlock.priority,
        deadline: masterBlock.deadline,
        notifications: masterBlock.notifications,
        linkedBlockType: masterBlock.linkedBlockType,
        exceptions: [],
    }).returning();

    return newBlock.id;
}

export async function getMissionBlocks(date: string) {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        // 1. Fetch specific blocks for this date (unique blocks)
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

        // 3. Process Recurring Blocks using matchesRepeatPattern
        const virtualBlocks = [];

        for (const rBlock of recurringBlocks) {
            // Build object compatible with matchesRepeatPattern
            const patternObj = {
                date: rBlock.date,
                repeatPattern: rBlock.recurrencePattern || 'none',
                weekdays: rBlock.weekdays,
                monthlyDays: rBlock.monthlyDays,
                monthlyNth: rBlock.monthlyNth,
                repeatIntervalValue: rBlock.repeatIntervalValue,
                repeatIntervalUnit: rBlock.repeatIntervalUnit,
                exceptions: rBlock.exceptions,
            };

            if (matchesRepeatPattern(patternObj, date)) {
                const isCompleted = (rBlock.completedDates as string[] || []).includes(date);
                const subTasks = isCompleted
                    ? (rBlock.subTasks as SubTask[] || []).map(t => ({ ...t, done: true }))
                    : rBlock.subTasks as SubTask[];

                virtualBlocks.push({
                    ...rBlock,
                    id: `${rBlock.id}-virtual-${date}`,
                    date: date,
                    type: 'recurring',
                    status: isCompleted ? 'completed' : 'pending',
                    subTasks: subTasks
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

export async function createMissionBlock(data: Omit<NewMissionBlock, "id" | "userId" | "createdAt"> & {
    recurrencePattern?: string;
    occurrencesLimit?: number;
    weekdays?: number[];
    monthlyDays?: number[];
    monthlyNth?: { nth: number; weekday: number } | null;
    repeatIntervalValue?: number;
    repeatIntervalUnit?: string;
}) {
    const { userId } = await auth();
    if (!userId) {
        return { error: "Unauthorized" };
    }

    try {
        const pattern = data.recurrencePattern || 'none';
        const isRecurring = pattern !== 'none';

        if (!isRecurring) {
            // Unique Block Logic - Conflict Check
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
                recurrencePattern: 'none',
            });
        } else {
            // Recurring Block Logic - Save single master block
            // For 'workdays' shortcut, auto-fill weekdays [1,2,3,4,5]
            const weekdaysData = pattern === 'workdays' ? [1, 2, 3, 4, 5] : (data.weekdays || []);

            await db.insert(missionBlocks).values({
                userId: userId,
                ...data,
                type: 'recurring',
                recurrencePattern: pattern,
                exceptions: [],
                weekdays: weekdaysData,
                monthlyDays: data.monthlyDays || [],
                monthlyNth: data.monthlyNth || null,
                repeatIntervalValue: data.repeatIntervalValue || null,
                repeatIntervalUnit: data.repeatIntervalUnit || null,
                occurrencesLimit: data.occurrencesLimit || null,
                usedOccurrences: 0,
            });
        }

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("[createMissionBlock] Error:", error);
        return { error: error.message || "Erro ao criar bloco." };
    }
}

export async function archiveMissionBlock(id: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        let targetId = id;
        
        // Support virtual blocks
        if (id.includes("-virtual-")) {
            await db.transaction(async (tx) => {
                targetId = await forkVirtualBlock(tx, id, userId);
            });
        }

        // Fetch the block
        const [block] = await db.select().from(missionBlocks).where(and(eq(missionBlocks.id, targetId), eq(missionBlocks.userId, userId)));
        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as SubTask[]) || [];
        const isFromTask = currentSubtasks.some(s => s.isFromTask || s.originalTaskId);
        const notificationsToRestore = (currentSubtasks as SubTask[]).find(s => s.notifications !== undefined)?.notifications;
        const suggestibleToRestore = (currentSubtasks as SubTask[]).find(s => s.suggestible !== undefined)?.suggestible ?? true;

        await db.transaction(async (tx) => {
            // Create backlog task from the entire block
            await tx.insert(backlogTasks).values({
                userId,
                title: block.title,
                estimatedDuration: block.totalDuration,
                status: 'pending',
                createdAt: new Date(),
                color: block.color,
                description: block.description,
                priority: block.priority || 'media',
                deadline: block.deadline,
                notifications: notificationsToRestore,
                suggestible: suggestibleToRestore,
                subTasks: block.subTasks || [],
                linkedBlockType: isFromTask ? block.linkedBlockType : (block.linkedBlockType || (block.title !== 'Geral' ? block.title : undefined)),
            });

            // Delete the block
            await tx.delete(missionBlocks).where(eq(missionBlocks.id, id));
        });

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        console.error("Error archiving block:", error);
        return { error: error.message || "Erro ao arquivar bloco" };
    }
}

export async function deleteMissionBlock(id: string, deleteMode: 'single' | 'forward' | 'all' = 'single') {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // Check if it is a virtual block
        if (id.includes("-virtual-")) {
            const [realId, date] = id.split("-virtual-");
            if (!realId || !date) return { error: "Invalid virtual ID" };

            if (deleteMode === 'all') {
                // Delete the MASTER block completely
                await db.delete(missionBlocks).where(
                    and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId))
                );
            } else if (deleteMode === 'forward') {
                const [masterBlock] = await db.select().from(missionBlocks)
                    .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

                if (!masterBlock) return { error: "Master block not found" };

                const targetDate = parseISO(date);
                let extracted = false;

                if (masterBlock.recurrencePattern === 'custom') {
                    let newWeekdays = Array.isArray(masterBlock.weekdays) ? [...masterBlock.weekdays] : [];
                    const dayOfWeek = targetDate.getDay();
                    if (newWeekdays.includes(dayOfWeek)) {
                        newWeekdays = newWeekdays.filter(d => d !== dayOfWeek);
                        extracted = true;

                        if (newWeekdays.length === 0) {
                            await db.delete(missionBlocks).where(eq(missionBlocks.id, realId));
                        } else {
                            await db.update(missionBlocks).set({ weekdays: newWeekdays }).where(eq(missionBlocks.id, realId));
                        }
                    }
                } else if (masterBlock.recurrencePattern === 'monthly_on') {
                    let newMonthlyDays = Array.isArray(masterBlock.monthlyDays) ? [...masterBlock.monthlyDays] : [];
                    const dayOfMonth = targetDate.getDate();
                    if (newMonthlyDays.includes(dayOfMonth)) {
                        newMonthlyDays = newMonthlyDays.filter(d => d !== dayOfMonth);
                        extracted = true;

                        if (newMonthlyDays.length === 0) {
                            await db.delete(missionBlocks).where(eq(missionBlocks.id, realId));
                        } else {
                            await db.update(missionBlocks).set({ monthlyDays: newMonthlyDays }).where(eq(missionBlocks.id, realId));
                        }
                    }
                }

                if (!extracted) {
                    await db.delete(missionBlocks).where(
                        and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId))
                    );
                }

            } else { // 'single'
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

            let completedDates = (masterBlock.completedDates as string[]) || [];
            if (status === 'completed' && !completedDates.includes(date)) {
                completedDates = [...completedDates, date];
            } else if (status === 'pending' && completedDates.includes(date)) {
                completedDates = completedDates.filter(d => d !== date);
            }

            await db.update(missionBlocks)
                .set({ completedDates })
                .where(eq(missionBlocks.id, realId));

        } else {
            // Update simple block
            const [currentBlock] = await db.select().from(missionBlocks)
                .where(and(eq(missionBlocks.id, id), eq(missionBlocks.userId, userId)));

            if (currentBlock) {
                const updatedSubtasks = (currentBlock.subTasks as SubTask[]).map(t => ({
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

export async function updateMissionBlock(id: string, data: Partial<Omit<NewMissionBlock, "id" | "userId" | "createdAt">>, updateMode: 'single' | 'forward' | 'all' = 'single') {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        if (id.includes("-virtual-")) {
            const [realId, date] = id.split("-virtual-");

            if (updateMode === 'all') {
                // Update MASTER block (affects all future instances)
                await db.update(missionBlocks)
                    .set(data)
                    .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));
            } else if (updateMode === 'forward') {
                const [masterBlock] = await db.select().from(missionBlocks)
                    .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));

                if (!masterBlock) return { error: "Master block not found" };

                const targetDate = parseISO(date);
                let extracted = false;

                if (masterBlock.recurrencePattern === 'custom') {
                    let newWeekdays = Array.isArray(masterBlock.weekdays) ? [...masterBlock.weekdays] : [];
                    const dayOfWeek = targetDate.getDay();
                    if (newWeekdays.includes(dayOfWeek) && newWeekdays.length > 1) {
                        newWeekdays = newWeekdays.filter(d => d !== dayOfWeek);
                        extracted = true;

                        await db.transaction(async (tx) => {
                            await tx.insert(missionBlocks).values({
                                userId: userId,
                                title: masterBlock.title,
                                date: date,
                                startTime: data.startTime || masterBlock.startTime,
                                totalDuration: data.totalDuration || masterBlock.totalDuration,
                                color: masterBlock.color,
                                icon: masterBlock.icon,
                                type: 'recurring',
                                recurrencePattern: 'custom',
                                weekdays: [dayOfWeek],
                                status: masterBlock.status,
                                subTasks: data.subTasks || masterBlock.subTasks,
                                notifications: data.notifications || masterBlock.notifications,
                                exceptions: [],
                            });
                            await tx.update(missionBlocks).set({ weekdays: newWeekdays }).where(eq(missionBlocks.id, realId));
                        });
                    }
                } else if (masterBlock.recurrencePattern === 'monthly_on') {
                    let newMonthlyDays = Array.isArray(masterBlock.monthlyDays) ? [...masterBlock.monthlyDays] : [];
                    const dayOfMonth = targetDate.getDate();
                    if (newMonthlyDays.includes(dayOfMonth) && newMonthlyDays.length > 1) {
                        newMonthlyDays = newMonthlyDays.filter(d => d !== dayOfMonth);
                        extracted = true;

                        await db.transaction(async (tx) => {
                            await tx.insert(missionBlocks).values({
                                userId: userId,
                                title: masterBlock.title,
                                date: date,
                                startTime: data.startTime || masterBlock.startTime,
                                totalDuration: data.totalDuration || masterBlock.totalDuration,
                                color: masterBlock.color,
                                icon: masterBlock.icon,
                                type: 'recurring',
                                recurrencePattern: 'monthly_on',
                                monthlyDays: [dayOfMonth],
                                status: masterBlock.status,
                                subTasks: data.subTasks || masterBlock.subTasks,
                                notifications: data.notifications || masterBlock.notifications,
                                exceptions: [],
                            });
                            await tx.update(missionBlocks).set({ monthlyDays: newMonthlyDays }).where(eq(missionBlocks.id, realId));
                        });
                    }
                }

                if (!extracted) {
                    await db.update(missionBlocks)
                        .set(data)
                        .where(and(eq(missionBlocks.id, realId), eq(missionBlocks.userId, userId)));
                }

            } else { // 'single'
                await db.transaction(async (tx) => {
                    id = await forkVirtualBlock(tx, id, userId);
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

export async function assignTasksToBlock(blockId: string, tasksToAssign: TaskPayload[]) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        let targetBlockId = blockId;

        // Helper to fork if virtual
        if (blockId.includes("-virtual-")) {
            await db.transaction(async (tx) => {
                targetBlockId = await forkVirtualBlock(tx, blockId, userId);
            });
        }

        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, targetBlockId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as SubTask[]) || [];
        const newSubtasks: SubTask[] = tasksToAssign.map(t => ({
            title: t.title || "Nova Tarefa",
            description: t.description,
            duration: t.estimatedDuration || 15,
            done: false,
            isFixed: false, // Allocated tasks are NOT fixed
            isFromTask: true,
            // Store original data
            originalPriority: t.priority,
            originalLinkedBlockType: t.linkedBlockType,
            originalColor: t.color,
            deadline: t.deadline,
            notifications: t.notifications,
            suggestible: t.suggestible,
            subTasks: t.subTasks || [],
            // Virtual Task Metadata
            isVirtual: t.isVirtual,
            originalTaskId: t.originalTaskId,
            originalSubTaskIndex: t.subTaskIndex
        }));

        const updatedSubtasks = [...currentSubtasks, ...newSubtasks];

        await db.transaction(async (tx) => {
            await tx.update(missionBlocks)
                .set({ subTasks: updatedSubtasks })
                .where(eq(missionBlocks.id, targetBlockId));

            // Only delete REAL tasks, not virtual subtasks
            const taskIds = tasksToAssign.filter(t => !t.isVirtual && t.id).map(t => t.id as string);
            if (taskIds.length > 0) {
                await tx.delete(backlogTasks)
                    .where(
                        and(
                            eq(backlogTasks.userId, userId),
                            inArray(backlogTasks.id, taskIds)
                        )
                    );
            }
        });

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
            subTasks: missionBlocks.subTasks,
            type: missionBlocks.type,
            notifications: missionBlocks.notifications,
            createdAt: missionBlocks.createdAt
        })
            .from(missionBlocks)
            .where(eq(missionBlocks.userId, userId))
            .orderBy(desc(missionBlocks.createdAt));

        const seen = new Set();
        const uniqueBlocks: { label: string; icon: string; color: string; value: string; notifications?: number[] | null }[] = [];

        for (const block of blocks) {
            // Check if this block was explicitly created (not converted from a task)
            const subTasksArr = Array.isArray(block.subTasks) ? block.subTasks as SubTask[] : [];
            let isExplicit = true;

            if (block.type !== 'recurring' && subTasksArr.length > 0) {
                // If the block has any subtask originating from a task, it's a task-block.
                if (subTasksArr.some((s: SubTask) => s.isFromTask === true)) {
                    isExplicit = false;
                }
            }

            if (!isExplicit) continue;

            const normalizedTitle = block.title.trim().toLowerCase();
            const key = `${normalizedTitle}|${block.icon}`;

            if (!seen.has(key)) {
                seen.add(key);
                uniqueBlocks.push({
                    label: block.title,
                    value: block.title,
                    icon: block.icon || 'zap',
                    color: block.color || '#3b82f6',
                    notifications: block.notifications || null
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
        await db.transaction(async (tx) => {
            await tx.delete(missionBlocks).where(eq(missionBlocks.userId, userId));
            await tx.delete(backlogTasks).where(eq(backlogTasks.userId, userId));
        });
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
        let subTasksForBlock: SubTask[] = [{ title: task.title, duration: blockDuration, done: false, isFromTask: true }];

        if (isVirtual && subTaskIndex !== -1 && task.subTasks) {
            const sub = (task.subTasks as SubTask[])[subTaskIndex];
            if (sub) {
                blockTitle = `${sub.title} - ${task.title}`;
                blockDuration = parseInt(sub.duration as string) || 15;
                subTasksForBlock = [{
                    title: blockTitle,
                    duration: blockDuration,
                    done: false,
                    isFixed: true,
                    isFromTask: true,
                    isVirtual: true,
                    notifications: task.notifications || [],
                    suggestible: task.suggestible || true,
                    originalTaskId: realTaskId,
                    originalSubTaskIndex: subTaskIndex
                }];
            }
        } else {
            if (task.subTasks && Array.isArray(task.subTasks) && task.subTasks.length > 0) {
                subTasksForBlock = (task.subTasks as SubTask[]).map(s => ({
                    ...s,
                    isFixed: true,
                    isFromTask: true,
                    notifications: task.notifications || [],
                    suggestible: task.suggestible || true
                }));
            } else {
                subTasksForBlock[0].notifications = task.notifications || [];
                subTasksForBlock[0].suggestible = task.suggestible || true;
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
            subTasks: subTasksForBlock,
            description: task.description,
            priority: task.priority,
            linkedBlockType: task.linkedBlockType,
            deadline: task.deadline
        };

        await db.transaction(async (tx) => {
            await tx.insert(missionBlocks).values(newBlock);

            if (!isVirtual) {
                await tx.delete(backlogTasks).where(eq(backlogTasks.id, realTaskId));
            }
        });

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error converting task:", error);
        return { error: error.message || "Erro ao converter tarefa" };
    }
}

export async function unassignTaskFromBlock(blockId: string, taskIndex: number, taskData: TaskPayload) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        let targetBlockId = blockId;

        // Fork if virtual
        if (blockId.includes("-virtual-")) {
            await db.transaction(async (tx) => {
                targetBlockId = await forkVirtualBlock(tx, blockId, userId);
            });
        }

        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, targetBlockId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as SubTask[]) || [];

        // Remove task at index
        if (taskIndex < 0 || taskIndex >= currentSubtasks.length) {
            return { error: "Tarefa não encontrada no bloco" };
        }

        const newSubtasks = [...currentSubtasks];
        newSubtasks.splice(taskIndex, 1);

        await db.transaction(async (tx) => {
            // Update block — remove the subtask
            await tx.update(missionBlocks)
                .set({ subTasks: newSubtasks })
                .where(eq(missionBlocks.id, targetBlockId));

            // If task came from a parent task in the backlog, it already exists there — just delete from block
            // If it was a standalone block subtask, restore it to the backlog
            if (!taskData.isVirtual && !taskData.isFixed && !taskData.isFromTask) {
                await tx.insert(backlogTasks).values({
                    userId,
                    title: taskData.title || "Tarefa Arquivada",
                    estimatedDuration: parseInt(taskData.duration as string) || 15,
                    status: 'pending',
                    createdAt: new Date(),
                    // Restore original data
                    priority: taskData.originalPriority || 'media',
                    linkedBlockType: taskData.originalLinkedBlockType,
                    color: taskData.originalColor || '#27272a',
                    deadline: taskData.deadline,
                    description: taskData.description,
                    notifications: taskData.notifications,
                    suggestible: taskData.suggestible !== undefined ? taskData.suggestible : true,
                    subTasks: taskData.subTasks || []
                });
            }
        });

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error unassigning task:", error);
        return { error: error.message || "Erro ao arquivar tarefa" };
    }
}

export async function updateMissionSubTask(blockId: string, taskIndex: number, updates: Partial<SubTask>) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        let targetBlockId = blockId;

        // Fork if virtual
        if (blockId.includes("-virtual-")) {
            await db.transaction(async (tx) => {
                targetBlockId = await forkVirtualBlock(tx, blockId, userId);
            });
        }

        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, targetBlockId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as SubTask[]) || [];

        // Check index
        if (taskIndex < 0 || taskIndex >= currentSubtasks.length) {
            return { error: "Tarefa não encontrada no bloco" };
        }

        const newSubtasks = [...currentSubtasks];
        newSubtasks[taskIndex] = { ...newSubtasks[taskIndex], ...updates };

        // Update block
        await db.update(missionBlocks)
            .set({ subTasks: newSubtasks })
            .where(eq(missionBlocks.id, targetBlockId));

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error: any) {
        console.error("Error updating subtask:", error);
        return { error: error.message || "Erro ao atualizar subtarefa" };
    }
}

export async function toggleSubTaskCompletion(blockId: string, taskIndex: number, currentDone: boolean) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        let targetBlockId = blockId;

        // Fork if virtual
        if (blockId.includes("-virtual-")) {
            await db.transaction(async (tx) => {
                targetBlockId = await forkVirtualBlock(tx, blockId, userId);
            });
        }

        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, targetBlockId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as SubTask[]) || [];

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
            if (t.originalTaskId && t.originalSubTaskIndex != null) {
                // Sync with backlog: pass currentDone so it flips to the new state
                await toggleBacklogSubTask(t.originalTaskId, t.originalSubTaskIndex, currentDone);
            }
        }

        // Check if ALL are done to auto-complete block
        const allDone = newSubtasks.every((t: SubTask) => t.done);
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

export async function checkAndArchivePastTasks(clientDate?: string, clientTime?: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const settings = await getUserSettings();
        if (!settings?.autoArchive) {
            return { success: true, reason: "Auto-archive disabled" };
        }

        const today = clientDate || format(new Date(), 'yyyy-MM-dd');
        const currentTime = clientTime || format(new Date(), 'HH:mm');
        const autoArchiveTime = settings.autoArchiveTime || '23:59';

        // Is it time to archive today's tasks?
        const isPastTodayArchiveTime = currentTime >= autoArchiveTime;

        // Condition to archive:
        // 1. Block date is less than today (yesterday or before).
        // 2. OR: Block date is today, AND current time is >= autoArchiveTime.
        // Wait, if autoArchiveTime is 03:00, and current time is 01:00 (next day, so Date is "today" for the system, but meant to be "yesterday" for user).
        // Let's keep it simple: We fetch all unique blocks that are not completed. We then filter them by time.

        const pendingBlocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.type, 'unique')
            ));

        const pastBlocks = pendingBlocks.filter(block => {
            if (block.date < today) return true;
            if (block.date === today && currentTime >= autoArchiveTime) return true;
            return false;
        });

        for (const block of pastBlocks) {
            const currentSubtasks = (block.subTasks as SubTask[]) || [];
            if (currentSubtasks.length === 0) continue;

            const isFromTask = currentSubtasks.some(s => s.isFromTask || s.originalTaskId);

            // Se o bloco foi gerado por uma tarefa e não foi concluído, arquiva o bloco inteiro
            if (isFromTask && block.status !== 'completed') {
                const notificationsToRestore = currentSubtasks.find(s => s.notifications !== undefined)?.notifications;
                const suggestibleToRestore = currentSubtasks.find(s => s.suggestible !== undefined)?.suggestible ?? true;

                await db.transaction(async (tx) => {
                    await tx.insert(backlogTasks).values({
                        userId,
                        title: block.title,
                        estimatedDuration: block.totalDuration,
                        status: 'pending',
                        createdAt: new Date(),
                        color: block.color,
                        description: block.description,
                        priority: block.priority || 'media',
                        deadline: block.deadline,
                        notifications: notificationsToRestore,
                        suggestible: suggestibleToRestore,
                        subTasks: block.subTasks || [],
                        linkedBlockType: block.linkedBlockType,
                    });
                    await tx.delete(missionBlocks).where(eq(missionBlocks.id, block.id));
                });
                continue;
            }

            // Se for um bloco comum (ex: "Geral", criado no Agendar), arquiva apenas as subtarefas alocadas não fixas
            const tasksToArchive = currentSubtasks.filter(t => !t.done && !t.isFixed);

            if (tasksToArchive.length > 0) {
                await db.transaction(async (tx) => {
                    // Archive tasks
                    for (const task of tasksToArchive) {
                        await tx.insert(backlogTasks).values({
                            userId,
                            title: task.title,
                            estimatedDuration: parseInt(task.duration as string) || 15,
                            status: 'pending',
                            createdAt: new Date(),
                            priority: task.originalPriority || 'media',
                            linkedBlockType: task.originalLinkedBlockType,
                            color: task.originalColor || '#27272a',
                            deadline: task.deadline,
                            notifications: task.notifications,
                            suggestible: task.suggestible !== undefined ? task.suggestible : true,
                            subTasks: task.subTasks || []
                        });
                    }

                    // Update block: Keep only Done OR Fixed tasks
                    const remainingSubtasks = currentSubtasks.filter(t => t.done || t.isFixed);

                    await tx.update(missionBlocks)
                        .set({ subTasks: remainingSubtasks })
                        .where(eq(missionBlocks.id, block.id));
                });
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
            await db.transaction(async (tx) => {
                targetBlockId = await forkVirtualBlock(tx, id, userId);
            });
        }

        const [block] = await db.select().from(missionBlocks)
            .where(and(eq(missionBlocks.id, targetBlockId), eq(missionBlocks.userId, userId)));

        if (!block) return { error: "Bloco não encontrado" };

        const currentSubtasks = (block.subTasks as SubTask[]) || [];

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
