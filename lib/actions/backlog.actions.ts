"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { backlogTasks, missionBlocks } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type BacklogTask = typeof backlogTasks.$inferSelect;
export type NewBacklogTask = typeof backlogTasks.$inferInsert;

export async function getBacklogTasks() {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const tasks = await db.select()
            .from(backlogTasks)
            .where(eq(backlogTasks.userId, userId))
            .orderBy(desc(backlogTasks.createdAt));
        return tasks;
    } catch (error) {
        console.error("Error fetching backlog:", error);
        return [];
    }
}

export async function createBacklogTask(data: Partial<Omit<NewBacklogTask, 'id' | 'userId' | 'createdAt'>>) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        await db.insert(backlogTasks).values({
            userId,
            title: data.title!,
            priority: data.priority,
            estimatedDuration: data.estimatedDuration,
            linkedBlockType: data.linkedBlockType,
            color: data.color,
            subTasks: data.subTasks || [],
            description: data.description,
            deadline: data.deadline,
            remindMe: data.remindMe,
            suggestible: data.suggestible ?? true,
            status: "pending",
            createdAt: new Date(),
        });

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error creating backlog task:", error);
        return { error: "Failed to create task" };
    }
}

export async function updateBacklogTask(id: string, data: Partial<Omit<NewBacklogTask, 'id' | 'userId' | 'createdAt'>>) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        await db.update(backlogTasks)
            .set(data)
            .where(and(eq(backlogTasks.id, id), eq(backlogTasks.userId, userId)));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error updating backlog task:", error);
        return { error: "Failed to update task" };
    }
}

export async function deleteBacklogTask(id: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        await db.delete(backlogTasks).where(eq(backlogTasks.id, id));
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error deleting backlog task:", error);
        return { error: "Failed to delete task" };
    }
}

export async function moveTaskToBlock(taskId: string, blockId: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // 1. Get task details
        const [task] = await db.select()
            .from(backlogTasks)
            .where(and(eq(backlogTasks.id, taskId), eq(backlogTasks.userId, userId)))
            .limit(1);

        if (!task) return { error: "Task not found" };

        // 2. Get block details
        const [block] = await db.select()
            .from(missionBlocks)
            .where(and(eq(missionBlocks.id, blockId), eq(missionBlocks.userId, userId)))
            .limit(1);

        if (!block) return { error: "Block not found" };

        // 3. Add to block subtasks
        const currentSubtasks = (block.subTasks as any[]) || [];
        const newSubtask = {
            id: task.id,
            title: task.title,
            duration: task.estimatedDuration || 30,
            done: false,
            isFixed: false,
            originalPriority: task.priority,
            originalLinkedBlockType: task.linkedBlockType,
            originalColor: task.color,
            deadline: task.deadline,
            description: task.description,
            remindMe: task.remindMe,
            subTasks: task.subTasks || []
        };

        await db.update(missionBlocks)
            .set({ subTasks: [...currentSubtasks, newSubtask] })
            .where(eq(missionBlocks.id, blockId));

        // 4. Update task status (or delete it from backlog? For now mark as completed/moved)
        await db.delete(backlogTasks).where(eq(backlogTasks.id, taskId));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error moving task:", error);
        return { error: "Failed to move task" };
    }
}

export async function toggleBacklogSubTask(taskId: string, subTaskIndex: number, currentDone: boolean) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const [task] = await db.select().from(backlogTasks)
            .where(and(eq(backlogTasks.id, taskId), eq(backlogTasks.userId, userId)));

        if (!task) return { error: "Task not found" };

        const currentSubtasks = (task.subTasks as any[]) || [];
        if (subTaskIndex < 0 || subTaskIndex >= currentSubtasks.length) return { error: "Subtask not found" };

        const newSubtasks = [...currentSubtasks];

        // Ensure the subtask object has a state. If it was just { title, duration }, add done.
        const target = newSubtasks[subTaskIndex];
        newSubtasks[subTaskIndex] = { ...target, done: !currentDone };

        await db.update(backlogTasks)
            .set({ subTasks: newSubtasks })
            .where(eq(backlogTasks.id, taskId));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error toggling backlog subtask:", error);
        return { error: "Failed to toggle subtask" };
    }
}
