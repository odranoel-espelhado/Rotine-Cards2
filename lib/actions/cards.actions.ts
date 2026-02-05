"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { tacticalCards } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type TacticalCard = typeof tacticalCards.$inferSelect;

export async function getTacticalCards() {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const cards = await db.query.tacticalCards.findMany({
            where: eq(tacticalCards.userId, userId),
        });

        // Initialize starter deck if empty
        if (cards.length === 0) {
            await initializeStarterDeck(userId);
            return getTacticalCards(); // Recursively fetch again
        }

        return cards;
    } catch (error) {
        console.error("Error fetching cards:", error);
        return [];
    }
}

export async function useTacticalCard(cardId: string) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        const card = await db.query.tacticalCards.findFirst({
            where: and(eq(tacticalCards.userId, userId), eq(tacticalCards.id, cardId)),
        });

        if (!card) return { error: "Card not found" };

        if ((card.usedCharges || 0) >= (card.totalCharges || 3)) {
            return { error: "No charges left" };
        }

        await db.update(tacticalCards)
            .set({ usedCharges: (card.usedCharges || 0) + 1 })
            .where(eq(tacticalCards.id, cardId));

        revalidatePath("/dashboard");
        return { success: true, remaining: (card.totalCharges || 3) - ((card.usedCharges || 0) + 1) };
    } catch (error) {
        console.error("Error using card:", error);
        return { error: "Failed to use card" };
    }
}

async function initializeStarterDeck(userId: string) {
    const starterCards = [
        {
            name: "Hiperfoco",
            icon: "focus",
            color: "#3b82f6",
            totalCharges: 3,
            effect: "Silencia notificações e bloqueia distrações por 2h.",
        },
        {
            name: "Descanso Tático",
            icon: "coffee",
            color: "#10b981",
            totalCharges: 5,
            effect: "Recupera 20% de energia mental imediatamente.",
        },
        {
            name: "Delegação",
            icon: "users",
            color: "#8b5cf6",
            totalCharges: 2,
            effect: "Transfere uma tarefa do dia para o Backlog sem penalidade.",
        }
    ];

    for (const card of starterCards) {
        await db.insert(tacticalCards).values({
            userId,
            ...card
        });
    }
}
