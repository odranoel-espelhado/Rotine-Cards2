"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";

export type ReminderType = {
    id: string;
    title: string;
    description: string;
    color: string;
    targetDate: string; // YYYY-MM-DD
    repeatPattern?: string; // e.g. "none", "daily", "weekly", "monthly", "yearly"
};

export async function getRemindersAction(date: string) {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const allReminders = await db.select().from(reminders).where(eq(reminders.userId, userId));

        // Frontend filtering strategy similar to recurring blocks
        return allReminders.filter(r =>
            r.targetDate === date ||
            r.repeatPattern === 'daily' ||
            (r.repeatPattern === 'weekly' && new Date(r.targetDate).getDay() === new Date(date).getDay() && date >= r.targetDate) ||
            (r.repeatPattern === 'monthly' && new Date(r.targetDate).getDate() === new Date(date).getDate() && date >= r.targetDate) ||
            (r.repeatPattern === 'yearly' && new Date(r.targetDate).getDate() === new Date(date).getDate() && new Date(r.targetDate).getMonth() === new Date(date).getMonth() && date >= r.targetDate)
        ).map(r => ({
            ...r,
            description: r.description || "",
            repeatPattern: r.repeatPattern || "none"
        }));
    } catch (e) {
        console.error("Error fetching reminders", e);
        return [];
    }
}

export async function getAllRemindersAction() {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const all = await db.select().from(reminders).where(eq(reminders.userId, userId));
        return all.map(r => ({
            ...r,
            description: r.description || "",
            repeatPattern: r.repeatPattern || "none"
        }));
    } catch (e) {
        console.error("Error fetching all reminders", e);
        return [];
    }
}

export async function createReminderAction(data: Omit<ReminderType, "id">) {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    try {
        const [newReminder] = await db.insert(reminders).values({
            userId,
            title: data.title,
            description: data.description,
            color: data.color,
            targetDate: data.targetDate,
            repeatPattern: data.repeatPattern || "none",
        }).returning();

        revalidatePath("/dashboard");
        return {
            success: true, data: {
                ...newReminder,
                description: newReminder.description || "",
                repeatPattern: newReminder.repeatPattern || "none"
            }
        };
    } catch (error: any) {
        console.error("Error creating reminder", error);
        return { success: false, error: "Erro ao criar lembrete" };
    }
}

export async function deleteReminderAction(id: string) {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    try {
        await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error deleting reminder", error);
        return { success: false, error: "Erro ao apagar lembrete" };
    }
}
