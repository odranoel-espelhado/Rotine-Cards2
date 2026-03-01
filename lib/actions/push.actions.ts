"use server";

import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";

export async function savePushSubscription(subscriptionJson: string) {
    try {
        const { userId } = await auth();

        if (!userId) {
            return { success: false, error: "Unauthorized" };
        }

        const subscription = JSON.parse(subscriptionJson);

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return { success: false, error: "Invalid subscription payload" };
        }

        // Verifica se essa inscrição específica (mesmo navegador/dispositivo) já existe
        const existingSub = await db
            .select()
            .from(pushSubscriptions)
            .where(
                and(
                    eq(pushSubscriptions.userId, userId),
                    eq(pushSubscriptions.endpoint, subscription.endpoint)
                )
            );

        if (existingSub.length === 0) {
            // Se não existir, salva no banco
            await db.insert(pushSubscriptions).values({
                userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth
            });
        }

        return { success: true };
    } catch (e: any) {
        console.error("Failed to save push subscription:", e);
        return { success: false, error: e.message };
    }
}
