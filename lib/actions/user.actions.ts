"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getUserSettings() {
    try {
        const { userId } = await auth();
        if (!userId) return null;

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) return null;

        const defaultSettings = { autoArchive: true, autoArchiveTime: '23:59', timelineStart: '08:00', timelineEnd: '24:00' };
        return { ...defaultSettings, ...(user.settings as any || {}) };
    } catch {
        return { autoArchive: true, autoArchiveTime: '23:59', timelineStart: '08:00', timelineEnd: '24:00' };
    }
}

export async function updateUserSettings(settings: any) {
    try {
        const { userId } = await auth();
        if (!userId) return { error: "Unauthorized" };

        const currentSettings = await getUserSettings();
        const mergedSettings = { ...currentSettings, ...settings };

        await db.update(users)
            .set({ settings: mergedSettings })
            .where(eq(users.id, userId));

        revalidatePath("/dashboard");
        return { success: true };
    } catch (error: any) {
        return { error: error.message || "Failed to update settings" };
    }
}

export async function syncUser() {
    console.log("[syncUser] Starting synchronization...");
    try {
        const { userId } = await auth();
        if (!userId) {
            console.error("[syncUser] No userId found in auth() context.");
            return { error: "Unauthorized" };
        }
        console.log("[syncUser] Authenticated User ID:", userId);

        // Check if user exists using clean SQL select
        const [existingUser] = await db.select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (existingUser) {
            console.log("[syncUser] User already exists in DB:", existingUser.email);
            return { success: true, user: existingUser };
        }

        console.log("[syncUser] User not found in DB. Fetching from Clerk...");
        // Fetch details from Clerk
        const clerkUser = await currentUser();
        if (!clerkUser) {
            console.error("[syncUser] Clerk currentUser() returned null.");
            return { error: "Clerk user not found" };
        }

        const email = clerkUser.emailAddresses[0]?.emailAddress;
        if (!email) {
            console.error("[syncUser] No email found for user.");
            return { error: "Email required" };
        }

        console.log("[syncUser] Inserting new user:", email);
        // Create user
        await db.insert(users).values({
            id: userId,
            email: email,
            name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || "Operador",
            avatarUrl: clerkUser.imageUrl,
        });

        console.log("[syncUser] User created successfully.");
        return { success: true, created: true };
    } catch (error: any) {
        console.error("[syncUser] CRITICAL ERROR:", error);
        return { error: error.message || "Failed to sync user" };
    }
}
