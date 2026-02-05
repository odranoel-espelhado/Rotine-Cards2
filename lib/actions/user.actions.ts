"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function syncUser() {
    try {
        const { userId } = await auth();
        if (!userId) return { error: "Unauthorized" };

        // Check if user exists
        const existingUser = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (existingUser) {
            return { success: true, user: existingUser };
        }

        // Fetch details from Clerk
        const clerkUser = await currentUser();
        if (!clerkUser) return { error: "Clerk user not found" };

        const email = clerkUser.emailAddresses[0]?.emailAddress;
        if (!email) return { error: "Email required" };

        // Create user
        await db.insert(users).values({
            id: userId,
            email: email,
            name: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || "Operador",
            avatarUrl: clerkUser.imageUrl,
        });

        return { success: true, created: true };
    } catch (error) {
        console.error("Error syncing user:", error);
        return { error: "Failed to sync user" };
    }
}
