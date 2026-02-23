import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getMissionBlocks } from "@/lib/actions/mission.actions";
import { getBacklogTasks } from "@/lib/actions/backlog.actions";
import { getTacticalCards } from "@/lib/actions/cards.actions";
import { getEfficiencyStats } from "@/lib/actions/analytics.actions";
import { getUserSettings, syncUser } from "@/lib/actions/user.actions";
import DashboardClient from "./dashboard-client";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function DashboardPage(props: {
    searchParams: SearchParams
}) {
    const searchParams = await props.searchParams;
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    // 1. Ensure user exists in our DB
    await syncUser();
    const settings = await getUserSettings();

    // 2. Determine Date (default to today)
    const today = new Date().toISOString().split('T')[0];
    const dateParam = searchParams.date;
    const currentDate = typeof dateParam === 'string' ? dateParam : today;

    // 3. Fetch Blocks & Backlog & Cards
    const blocks = await getMissionBlocks(currentDate);
    const backlogTasks = await getBacklogTasks();
    const cards = await getTacticalCards();
    const stats = await getEfficiencyStats(currentDate);

    return (
        <DashboardClient
            initialBlocks={blocks}
            initialBacklog={backlogTasks}
            initialCards={cards}
            initialStats={stats}
            userId={userId}
            currentDate={currentDate}
            settings={settings}
        />
    );
}
