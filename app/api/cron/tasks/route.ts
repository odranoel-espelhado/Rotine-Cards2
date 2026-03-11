import { NextResponse } from "next/server";
import { db } from "@/db";
import { missionBlocks, pushSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import webpush from "web-push";

export const dynamic = 'force-dynamic'; // Prevents Vercel from caching the response time

// Configura o Web Push com as chaves do .env.local
webpush.setVapidDetails(
    "mailto:notificacoes@rotinecards.com", // Modifique no futuro para um email de suporte seu
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
    process.env.VAPID_PRIVATE_KEY || ""
);

// Rota chamada automaticamente pelo pg_cron do Supabase a cada minuto
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const now = new Date();
        // O fuso horário padrão do servidor (Vercel) costuma ser UTC.
        // Vamos garantir a leitura correta do fuso horário brasileiro (UTC-3)
        // Dica: Use uma das bibliotecas se precisar ou fixe o UTC offset

        const brTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));

        const dateStr = brTime.toISOString().split('T')[0]; // "YYYY-MM-DD"

        const currentHours = brTime.getHours();
        const currentMinutes = brTime.getMinutes();
        const currentTimeInMins = currentHours * 60 + currentMinutes;
        const timeStr = `${currentHours.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;

        const dayOfWeek = brTime.getDay(); // 0 = Domingo, 6 = Sábado
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

        // 1. Pega todas as Tarefas e Blocos
        const allBlocks = await db.select().from(missionBlocks);

        // 2. Filtra as Tarefas que são válidas para HOJE
        const blocksToday = allBlocks.filter((block) => {
            const isCompleted = (block.completedDates as string[] || []).includes(dateStr) || block.status === 'completed';
            if (isCompleted) return false;

            // Filtro por Data e Repetições (Idêntico ao Frontend)
            if (block.type === 'unique' && block.date === dateStr) {
                return true;
            }

            if (block.type === 'recurring') {
                const exceptions = (block.exceptions as string[]) || [];
                if (exceptions.includes(dateStr)) return false; // Pulou/deletou este dia específico

                if (block.recurrencePattern === 'weekdays' && isWeekday && dateStr >= block.date) {
                    return true;
                }

                if (block.recurrencePattern === 'weekly') {
                    const originalDate = new Date(block.date);
                    if (originalDate.getDay() === dayOfWeek && dateStr >= block.date) return true;
                }
            }

            return false;
        });

        if (blocksToday.length === 0) {
            return NextResponse.json({ message: "Nenhuma tarefa agendada para hoje.", debugServerTime: timeStr, debugDate: dateStr });
        }

        let sentCount = 0;

        const timeToMins = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        // 3. Verifica as notificações do bloco e das sub-tarefas
        for (const block of blocksToday) {
            const blockStartMins = timeToMins(block.startTime);
            const blockEndMins = blockStartMins + block.totalDuration;

            let userSubscriptions: typeof pushSubscriptions.$inferSelect[] | null = null;
            const getUserSubs = async () => {
                if (!userSubscriptions) {
                    userSubscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, block.userId));
                }
                return userSubscriptions;
            };

            // A. VERIFICA NOTIFICAÇÕES DO BLOCO EM SI
            const blockNotifications = block.notifications as number[] | null;
            if (blockNotifications && blockNotifications.length > 0) {
                for (const notifyMin of blockNotifications) {
                    const notifyTime = blockStartMins - notifyMin;
                    if (currentTimeInMins === notifyTime) {
                        const subs = await getUserSubs();
                        if (subs && subs.length > 0) {
                            const timeText = notifyMin === 0 ? "agorinha" : `em ${notifyMin} minuto(s)`;
                            const payload = JSON.stringify({
                                title: "Hora do Bloco!",
                                body: `Seu bloco "${block.title}" começará ${timeText}.`
                            });
                            for (const subsc of subs) {
                                try {
                                    await webpush.sendNotification({
                                        endpoint: subsc.endpoint,
                                        keys: { auth: subsc.auth, p256dh: subsc.p256dh }
                                    }, payload);
                                    sentCount++;
                                } catch (error: any) {
                                    if (error.statusCode === 410 || error.statusCode === 404) {
                                        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subsc.id));
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // B. VERIFICA NOTIFICAÇÕES DAS TAREFAS DENTRO DO BLOCO
            const subTasks = (block.subTasks as any[]) || [];
            if (subTasks.length === 0) continue;

            const pinnedSegments: { start: number; end: number }[] = [];
            const computedTaskTimes: { start: number, end: number, isPinned: boolean }[] = [];

            // Primeira passada: agrupa tarefas cravadas pelo usuário (pinadas)
            subTasks.forEach((sub, i) => {
                if (sub.pinnedTime) {
                    const start = timeToMins(sub.pinnedTime);
                    const dur = parseInt(sub.duration || '0');
                    pinnedSegments.push({ start, end: start + dur });
                    computedTaskTimes[i] = { start, end: start + dur, isPinned: true };
                }
            });

            const findNextAvailableSlot = (dur: number): number => {
                let searchPointer = blockStartMins;
                while (true) {
                    const overlap = pinnedSegments.find(seg =>
                        (searchPointer < seg.end && (searchPointer + dur) > seg.start)
                    );
                    if (overlap) searchPointer = overlap.end;
                    else return searchPointer;
                }
            };

            const findNextAvailableSlotReverse = (dur: number): number => {
                let searchPointer = blockEndMins;
                while (true) {
                    const overlap = pinnedSegments.slice().reverse().find(seg =>
                        ((searchPointer - dur) < seg.end && searchPointer > seg.start)
                    );
                    if (overlap) searchPointer = overlap.start;
                    else return searchPointer - dur;
                }
            };

            // Segunda passada: Preenche automaticamente igual na interface drag and drop
            subTasks.forEach((sub, i) => {
                if (!computedTaskTimes[i]) {
                    const dur = parseInt(sub.duration || '0');
                    pinnedSegments.sort((a, b) => a.start - b.start);
                    const start = sub.orderDir === 'down' ? findNextAvailableSlotReverse(dur) : findNextAvailableSlot(dur);
                    computedTaskTimes[i] = { start, end: start + dur, isPinned: false };
                    pinnedSegments.push({ start, end: start + dur });
                }
            });

            // 4. Se encontrou alguma tarefa com 'notifications' pro momento exato, puxa a inscrição do usuário e notifica
            for (let i = 0; i < subTasks.length; i++) {
                const sub = subTasks[i];
                // Fallback support for old remindMe scalar
                const taskNotifs = sub.notifications || (sub.remindMe ? [sub.remindMe] : null);
                if (sub.done || !taskNotifs || !Array.isArray(taskNotifs)) continue;

                const computedStart = computedTaskTimes[i].start;

                for (const notifyMin of taskNotifs) {
                    const notifyTime = computedStart - notifyMin;

                    // O gatilho perfeito temporal:
                    if (currentTimeInMins === notifyTime) {
                        if (!userSubscriptions) {
                            userSubscriptions = await getUserSubs();
                        }

                        if (!userSubscriptions || userSubscriptions.length === 0) continue;

                        const timeText = notifyMin === 0 ? "agorinha" : `em ${notifyMin} minutos`;
                        const payload = JSON.stringify({
                            title: "Lembrete de Tarefa!",
                            body: `Sua tarefa "${sub.title}" começará ${timeText}.`
                        });

                        for (const subsc of userSubscriptions) {
                            try {
                                await webpush.sendNotification({
                                    endpoint: subsc.endpoint,
                                    keys: {
                                        auth: subsc.auth,
                                        p256dh: subsc.p256dh
                                    }
                                }, payload);
                                sentCount++;
                            } catch (error: any) {
                                console.error("Erro ao enviar push:", subsc.endpoint, error);
                                if (error.statusCode === 410 || error.statusCode === 404) {
                                    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subsc.id));
                                }
                            }
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true, sentCount, timeMatched: timeStr });

    } catch (error: any) {
        console.error("Erro no Cron de Tarefas:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
