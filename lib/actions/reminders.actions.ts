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

function matchesRepeatPattern(r: any, checkDateStr: string): boolean {
    if (!r.repeatPattern || r.repeatPattern === 'none') {
        return r.targetDate === checkDateStr;
    }
    if (checkDateStr < r.targetDate) return false;

    const targetObj = new Date(r.targetDate + "T12:00:00");
    const checkObj = new Date(checkDateStr + "T12:00:00");

    if (r.repeatPattern === 'daily') return true;
    if (r.repeatPattern === 'weekly' && targetObj.getDay() === checkObj.getDay()) return true;
    if (r.repeatPattern === 'monthly' && targetObj.getDate() === checkObj.getDate()) return true;
    if (r.repeatPattern === 'yearly' && targetObj.getDate() === checkObj.getDate() && targetObj.getMonth() === checkObj.getMonth()) return true;
    if (r.repeatPattern === 'workdays' && Array.isArray(r.weekdays) && r.weekdays.includes(checkObj.getDay())) return true;
    if (r.repeatPattern === 'monthly_on') {
        if (Array.isArray(r.monthlyDays) && r.monthlyDays.length > 0 && r.monthlyDays.includes(checkObj.getDate())) return true;
        if (r.monthlyNth && typeof r.monthlyNth === 'object' && !Array.isArray(r.monthlyNth)) {
            const mnth = r.monthlyNth as any;
            if (mnth.weekday === checkObj.getDay()) {
                const chkDay = checkObj.getDate();
                const nth = Math.ceil(chkDay / 7);
                if (mnth.nth === nth) return true;
                if (mnth.nth === -1 && chkDay + 7 > new Date(checkObj.getFullYear(), checkObj.getMonth() + 1, 0).getDate()) return true;
            }
        }
    }
    return false;
}

export async function getRemindersAction(date: string) {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const allReminders = await db.select().from(reminders).where(eq(reminders.userId, userId));

        // Frontend filtering strategy similar to recurring blocks
        return allReminders.filter(r => {
            // Check manual occurrence limit completion
            if (r.occurrencesLimit && r.usedOccurrences && r.usedOccurrences >= r.occurrencesLimit) {
                return false;
            }

            // Check if matches pattern
            if (!matchesRepeatPattern(r, date)) return false;

            // If it has occurrencesLimit, count how many occurrences happened up to this date
            if (r.occurrencesLimit && r.occurrencesLimit > 0) {
                let count = 0;
                let currentSimDate = new Date(r.targetDate + "T12:00:00");
                const targetCheckDate = new Date(date + "T12:00:00");

                const addDays = (d: Date, days: number) => {
                    const nd = new Date(d);
                    nd.setDate(nd.getDate() + days);
                    return nd;
                };

                const formatDate = (d: Date) => {
                    const yy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    return `${yy}-${mm}-${dd}`;
                };

                let currStr = formatDate(currentSimDate);
                // Hard limit of 1000 days or so to prevent infinite loops, but realistically it'll stop by the targetCheckDate
                let loopCount = 0;
                while (currStr <= date && loopCount < 3650) { // Max 10 years
                    if (matchesRepeatPattern(r, currStr)) {
                        count++;
                    }
                    if (count > r.occurrencesLimit) {
                        return false; // Exceeded limit
                    }
                    if (currStr === date) {
                        break;
                    }
                    currentSimDate = addDays(currentSimDate, 1);
                    currStr = formatDate(currentSimDate);
                    loopCount++;
                }

                return count <= r.occurrencesLimit;
            }

            return true;
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
