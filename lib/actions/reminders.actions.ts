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
    occurrencesLimit?: number | null;
    usedOccurrences?: number | null;
    charges?: number | null;
    weekdays?: number[] | null;
    monthlyDays?: number[] | null;
    monthlyNth?: { nth: number, weekday: number } | null;
};

export async function getRemindersAction(date: string) {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const allReminders = await db.select().from(reminders).where(eq(reminders.userId, userId));

        // Frontend filtering strategy similar to recurring blocks
        return allReminders.filter(r => {
            // Check occurrence limit
            if (r.occurrencesLimit && r.usedOccurrences && r.usedOccurrences >= r.occurrencesLimit) {
                return false;
            }

            return r.targetDate === date ||
                (r.repeatPattern === 'daily' && date >= r.targetDate) ||
                (r.repeatPattern === 'weekly' && new Date(r.targetDate).getDay() === new Date(date).getDay() && date >= r.targetDate) ||
                (r.repeatPattern === 'monthly' && new Date(r.targetDate).getDate() === new Date(date).getDate() && date >= r.targetDate) ||
                (r.repeatPattern === 'yearly' && new Date(r.targetDate).getDate() === new Date(date).getDate() && new Date(r.targetDate).getMonth() === new Date(date).getMonth() && date >= r.targetDate) ||
                (r.repeatPattern === 'workdays' && date >= r.targetDate && Array.isArray(r.weekdays) && r.weekdays.includes(new Date(date).getDay())) ||
                (r.repeatPattern === 'monthly_on' && date >= r.targetDate && (
                    (Array.isArray(r.monthlyDays) && r.monthlyDays.length > 0 && r.monthlyDays.includes(new Date(date).getDate())) ||
                    (r.monthlyNth && typeof r.monthlyNth === 'object' && !Array.isArray(r.monthlyNth) && (r.monthlyNth as any).weekday === new Date(date).getDay() && (() => {
                        const mnth = r.monthlyNth as any;
                        const chkDate = new Date(date);
                        const chkDay = chkDate.getDate();
                        const nth = Math.ceil(chkDay / 7);
                        if (mnth.nth === nth) return true;
                        if (mnth.nth === -1 && chkDay + 7 > new Date(chkDate.getFullYear(), chkDate.getMonth() + 1, 0).getDate()) return true;
                        return false;
                    })())
                ));
        }).map(r => ({
            ...r,
            description: r.description || "",
            repeatPattern: r.repeatPattern || "none",
            occurrencesLimit: r.occurrencesLimit,
            usedOccurrences: r.usedOccurrences,
            charges: r.charges,
            weekdays: Array.isArray(r.weekdays) ? r.weekdays as number[] : null,
            monthlyDays: Array.isArray(r.monthlyDays) ? r.monthlyDays as number[] : null,
            monthlyNth: (r.monthlyNth as any) || null,
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
            repeatPattern: r.repeatPattern || "none",
            occurrencesLimit: r.occurrencesLimit,
            usedOccurrences: r.usedOccurrences,
            charges: r.charges,
            weekdays: Array.isArray(r.weekdays) ? r.weekdays as number[] : null,
            monthlyDays: Array.isArray(r.monthlyDays) ? r.monthlyDays as number[] : null,
            monthlyNth: (r.monthlyNth as any) || null,
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
            occurrencesLimit: data.occurrencesLimit,
            charges: data.charges,
            weekdays: data.weekdays || [],
            monthlyDays: data.monthlyDays || [],
            monthlyNth: data.monthlyNth || null,
        }).returning();

        revalidatePath("/dashboard");
        return {
            success: true, data: {
                ...newReminder,
                description: newReminder.description || "",
                repeatPattern: newReminder.repeatPattern || "none",
                weekdays: Array.isArray(newReminder.weekdays) ? newReminder.weekdays as number[] : null,
                monthlyDays: Array.isArray(newReminder.monthlyDays) ? newReminder.monthlyDays as number[] : null,
                monthlyNth: (newReminder.monthlyNth as any) || null,
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
export async function decreaseReminderChargeAction(id: string) {
    const { userId } = await auth();
    if (!userId) return { success: false, error: "Unauthorized" };

    try {
        const [rem] = await db.select().from(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
        if (!rem) return { success: false, error: "Not found" };

        let newCharges = rem.charges;
        if (newCharges !== null && newCharges > 0) {
            newCharges -= 1;

            await db.update(reminders).set({ charges: newCharges }).where(and(eq(reminders.id, id), eq(reminders.userId, userId)));
            revalidatePath("/dashboard");
        }

        return { success: true };
    } catch (error) {
        console.error("Error decreasing charge", error);
        return { success: false, error: "Erro ao atualizar" };
    }
}
