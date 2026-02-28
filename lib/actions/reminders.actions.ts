"use server";

import { revalidatePath } from "next/cache";

export type ReminderType = {
    id: string;
    title: string;
    description: string;
    color: string;
    targetDate: string; // YYYY-MM-DD
    repeatPattern?: string; // e.g. "none", "daily", "weekly", "monthly"
};

// DB em memória Mock (O utilizador vai integrar com Drizzle/Supabase posteriormente)
let VIRTUAL_REMINDERS: ReminderType[] = [
    {
        id: "mock-1",
        title: "Exemplo Lembrete",
        description: "Beber 2 litros de água.",
        color: "#3b82f6",
        targetDate: new Date().toISOString().split('T')[0],
        repeatPattern: "daily",
    }
];

export async function getRemindersAction(date: string) {
    // Simulando delay de rede
    // Filtra lembretes pelo dia exato ou padrão de repetição (simplificado aqui para demonstrar o visual)
    return VIRTUAL_REMINDERS.filter(r => r.targetDate === date || r.repeatPattern === 'daily');
}

export async function getAllRemindersAction() {
    return VIRTUAL_REMINDERS;
}

export async function createReminderAction(data: Omit<ReminderType, "id">) {
    const newReminder = { ...data, id: Date.now().toString() };
    VIRTUAL_REMINDERS.push(newReminder);
    revalidatePath("/dashboard");
    return { success: true, data: newReminder };
}

export async function deleteReminderAction(id: string) {
    VIRTUAL_REMINDERS = VIRTUAL_REMINDERS.filter(r => r.id !== id);
    revalidatePath("/dashboard");
    return { success: true };
}
