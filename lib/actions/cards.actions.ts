"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { tacticalCards, missionBlocks, cardHistory } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type TacticalCard = typeof tacticalCards.$inferSelect;
export type CardHistoryEntry = typeof cardHistory.$inferSelect;

export async function getTacticalCards() {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const cards = await db.select()
            .from(tacticalCards)
            .where(eq(tacticalCards.userId, userId));

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
        const [card] = await db.select()
            .from(tacticalCards)
            .where(and(eq(tacticalCards.userId, userId), eq(tacticalCards.id, cardId)))
            .limit(1);

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

/**
 * Activates the Rest Card: creates a rest block at the current time,
 * pushes subsequent blocks forward by the rest duration, and logs to history.
 */
export async function activateRestCard(
    cardId: string,
    duration: number,
    reason: string,
    date: string,
    startTime: string
) {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        // 1. Validate card
        const [card] = await db.select()
            .from(tacticalCards)
            .where(and(eq(tacticalCards.userId, userId), eq(tacticalCards.id, cardId)))
            .limit(1);

        if (!card) return { error: "Card not found" };

        if ((card.usedCharges || 0) >= (card.totalCharges || 5)) {
            return { error: "Sem cargas restantes" };
        }

        // 2. Calculate time boundaries
        const getMinutes = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const toTimeStr = (mins: number) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        };

        const restStartMins = getMinutes(startTime);
        const restEndMins = restStartMins + duration;

        // 3. Fetch all unique blocks for this date that might be affected
        const dayBlocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.date, date),
                eq(missionBlocks.type, 'unique')
            ));

        // 4. Also fetch recurring blocks to fork if affected
        const recurringBlocks = await db.select()
            .from(missionBlocks)
            .where(and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.type, 'recurring')
            ));

        // Import matchesRepeatPattern dynamically
        const { matchesRepeatPattern } = await import('@/lib/utils');

        // Find virtual blocks that match today and are affected
        const virtualBlocksToFork: { masterId: string; startMins: number }[] = [];
        for (const rBlock of recurringBlocks) {
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
                const blockStart = getMinutes(rBlock.startTime);
                const blockEnd = blockStart + rBlock.totalDuration;
                // Affected if block starts at or after rest start, OR overlaps
                if (blockStart >= restStartMins || blockEnd > restStartMins) {
                    virtualBlocksToFork.push({ masterId: rBlock.id, startMins: blockStart });
                }
            }
        }

        // 5. Execute everything in a transaction
        const affectedBlockNames: string[] = [];

        await db.transaction(async (tx) => {
            // 5a. Create rest block
            await tx.insert(missionBlocks).values({
                userId,
                title: 'Descanso Tático',
                date,
                startTime,
                totalDuration: duration,
                color: '#10b981',
                icon: 'coffee',
                type: 'unique',
                recurrencePattern: 'none',
                status: 'completed',
                subTasks: [{
                    title: reason || 'Pausa para descanso',
                    duration,
                    done: true,
                    isFixed: true,
                }],
                description: reason,
            });

            // 5b. Push unique blocks that are affected
            for (const block of dayBlocks) {
                const blockStart = getMinutes(block.startTime);
                const blockEnd = blockStart + block.totalDuration;

                if (blockStart >= restStartMins || blockEnd > restStartMins) {
                    const newStartMins = blockStart + duration;
                    await tx.update(missionBlocks)
                        .set({ startTime: toTimeStr(newStartMins) })
                        .where(eq(missionBlocks.id, block.id));
                    affectedBlockNames.push(block.title);
                }
            }

            // 5c. Fork and push recurring virtual blocks
            for (const vb of virtualBlocksToFork) {
                const virtualId = `${vb.masterId}-virtual-${date}`;
                // Use forkVirtualBlock-like logic inline since we're already in a tx
                const [masterBlock] = await tx.select().from(missionBlocks)
                    .where(and(eq(missionBlocks.id, vb.masterId), eq(missionBlocks.userId, userId)));

                if (!masterBlock) continue;

                // Add exception
                const currentExceptions = (masterBlock.exceptions as string[]) || [];
                if (!currentExceptions.includes(date)) {
                    await tx.update(missionBlocks)
                        .set({ exceptions: [...currentExceptions, date] })
                        .where(eq(missionBlocks.id, vb.masterId));
                }

                // Create forked unique block with pushed time
                const newStartMins = vb.startMins + duration;
                const isCompleted = (masterBlock.completedDates as string[] || []).includes(date);

                await tx.insert(missionBlocks).values({
                    userId,
                    title: masterBlock.title,
                    date,
                    startTime: toTimeStr(newStartMins),
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
                });

                affectedBlockNames.push(masterBlock.title);
            }

            // 5d. Decrement card charge
            await tx.update(tacticalCards)
                .set({ usedCharges: (card.usedCharges || 0) + 1 })
                .where(eq(tacticalCards.id, cardId));

            // 5e. Log to history
            await tx.insert(cardHistory).values({
                userId,
                cardId,
                cardName: card.name,
                reason,
                date,
                time: startTime,
                metadata: {
                    duration,
                    affectedBlocks: affectedBlockNames,
                    startTime,
                },
            });
        });

        revalidatePath("/dashboard");
        return {
            success: true,
            affectedBlocks: affectedBlockNames.length,
            remaining: (card.totalCharges || 5) - ((card.usedCharges || 0) + 1),
        };

    } catch (error: any) {
        console.error("Error activating rest card:", error);
        return { error: error.message || "Erro ao ativar carta de descanso" };
    }
}

/**
 * Fetches card usage history for the current user.
 */
export async function getCardHistory(limit: number = 20) {
    const { userId } = await auth();
    if (!userId) return [];

    try {
        const logs = await db.select()
            .from(cardHistory)
            .where(eq(cardHistory.userId, userId))
            .orderBy(desc(cardHistory.createdAt))
            .limit(limit);

        return logs;
    } catch (error) {
        console.error("Error fetching card history:", error);
        return [];
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
            effect: "Cria um bloco de descanso e empurra sua agenda.",
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

export async function resetAllCards() {
    const { userId } = await auth();
    if (!userId) return { error: "Unauthorized" };

    try {
        await db.update(tacticalCards)
            .set({ usedCharges: 0 })
            .where(eq(tacticalCards.userId, userId));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error) {
        console.error("Error resetting cards:", error);
        return { error: "Failed to reset cards" };
    }
}
