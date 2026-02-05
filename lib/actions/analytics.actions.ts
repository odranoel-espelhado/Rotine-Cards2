"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { missionBlocks, tacticalCards, backlogTasks } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { startOfDay, endOfDay } from "date-fns";

export async function getEfficiencyStats(date: string) {
    const { userId } = await auth();
    if (!userId) {
        return [
            { subject: 'Foco', A: 0, fullMark: 100 },
            { subject: 'Constância', A: 0, fullMark: 100 },
            { subject: 'Tática', A: 0, fullMark: 100 },
            { subject: 'Output', A: 0, fullMark: 100 },
            { subject: 'Energia', A: 0, fullMark: 100 },
        ];
    }

    try {
        // 1. Fetch data for the specific day
        const blocks = await db.query.missionBlocks.findMany({
            where: and(
                eq(missionBlocks.userId, userId),
                eq(missionBlocks.date, date)
            )
        });

        // 2. Fetch Card Usage (Overall or daily? Daily is better for 'Tática' logic, but schema tracks total used. 
        // For MVP, 'Tática' can be based on remaining charges relative to total charges of all cards)
        const cards = await db.query.tacticalCards.findMany({
            where: eq(tacticalCards.userId, userId)
        });

        // --- CALCULATION LOGIC ---

        // A. FOCO (Focus Time): Based on total duration scheduled vs Ideal (e.g., 6 hours/360min)
        const totalMinutes = blocks.reduce((acc, block) => acc + block.totalDuration, 0);
        const focusScore = Math.min(100, (totalMinutes / 360) * 100);

        // B. CONSTÂNCIA (Consistency): Blocks created vs Daily Goal (e.g., 4 blocks)
        const consistencyScore = Math.min(100, (blocks.length / 4) * 100);

        // C. TÁTICA (Tactics): Are you using your cards? Or saving them? 
        // Let's invert: High score if you have charges remaining (preparedness) OR 
        // High score if you used cards effectively? 
        // Let's go with: Score = % of Charges Remaining (Resource Management)
        let totalCharges = 0;
        let remainingCharges = 0;
        cards.forEach(card => {
            totalCharges += (card.totalCharges || 0);
            remainingCharges += (card.totalCharges || 0) - (card.usedCharges || 0);
        });
        const tacticScore = totalCharges > 0 ? (remainingCharges / totalCharges) * 100 : 50;

        // D. OUTPUT (Subtask Completion): % of subtasks marked done
        // Note: Currently we store subtasks as JSON. We need to parse them.
        let totalSubtasks = 0;
        let doneSubtasks = 0;

        blocks.forEach(block => {
            const subs = (block.subTasks as any[]) || [];
            totalSubtasks += subs.length;
            doneSubtasks += subs.filter((s: any) => s.done).length;
        });

        // If no tasks, output is neutral (50) or 0? Neutral feels better.
        const outputScore = totalSubtasks > 0 ? (doneSubtasks / totalSubtasks) * 100 : (blocks.length > 0 ? 0 : 50);

        // E. ENERGIA (Energy): Placeholder for now, maybe simple Time of Day check?
        // If blocks are mostly in user's prime time? 
        // Randomize slightly for "Cyber" feel or keep static 80 for MVP.
        const energyScore = 80;

        const data = [
            { subject: 'Foco', A: Math.round(focusScore), fullMark: 100 },
            { subject: 'Constância', A: Math.round(consistencyScore), fullMark: 100 },
            { subject: 'Tática', A: Math.round(tacticScore), fullMark: 100 },
            { subject: 'Output', A: Math.round(outputScore), fullMark: 100 },
            { subject: 'Energia', A: energyScore, fullMark: 100 },
        ];

        return data;

    } catch (error) {
        console.error("Error calculating analytics:", error);
        return [
            { subject: 'Foco', A: 0, fullMark: 100 },
            { subject: 'Constância', A: 0, fullMark: 100 },
            { subject: 'Tática', A: 0, fullMark: 100 },
            { subject: 'Output', A: 0, fullMark: 100 },
            { subject: 'Energia', A: 0, fullMark: 100 },
        ];
    }
}
