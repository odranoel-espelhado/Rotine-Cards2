import { NextResponse } from "next/server";
import { db } from "@/db";
import { missionBlocks, pushSubscriptions, reminders } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import webpush from "web-push";
import { matchesRepeatPattern } from "@/lib/utils";

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

        // 1. Padrão de verificação temporal unificado para suporte a dias no futuro (ex: avisar 7 dias antes do evento)
        const checkTrigger = (eventStartMins: number, notifyMin: number) => {
            // Conta positiva = X minutos no futuro em relação ao Agora
            const triggerDate = new Date(brTime.getTime() + notifyMin * 60000);
            const triggerDateStr = triggerDate.toISOString().split('T')[0];
            const triggerTimeInMins = triggerDate.getHours() * 60 + triggerDate.getMinutes();
            const triggerDayOfWeek = triggerDate.getDay();
            
            // Permite casamento mesmo se o evento cruzar a meia-noite (representado > 1440 mins)
            const normalizedEventStart = eventStartMins % 1440;
            const daysOverflow = Math.floor(eventStartMins / 1440);
            
            let checkDateStr = triggerDateStr;
            let checkDayOfWeek = triggerDayOfWeek;
            
            if (daysOverflow > 0) {
                // A data raiz em que o bloco "nasceu" era N dias atrás
                const adjustedDate = new Date(triggerDate.getTime() - daysOverflow * 86400000);
                checkDateStr = adjustedDate.toISOString().split('T')[0];
                checkDayOfWeek = adjustedDate.getDay();
            }
            
            const checkIsWeekday = checkDayOfWeek !== 0 && checkDayOfWeek !== 6;

            return { 
                isHit: triggerTimeInMins === normalizedEventStart, 
                triggerDateStr: checkDateStr, 
                triggerDayOfWeek: checkDayOfWeek, 
                triggerIsWeekday: checkIsWeekday 
            };
        };

        const isBlockValid = (block: any, tDateStr: string) => {
            const isCompleted = (block.completedDates as string[] || []).includes(tDateStr) || block.status === 'completed';
            if (isCompleted) return false;
            
            if (block.type === 'unique' && block.date === tDateStr) return true;
            
            if (block.type === 'recurring') {
                const patternObj = {
                    date: block.date,
                    repeatPattern: block.recurrencePattern || 'none',
                    weekdays: block.weekdays,
                    monthlyDays: block.monthlyDays,
                    monthlyNth: block.monthlyNth,
                    repeatIntervalValue: block.repeatIntervalValue,
                    repeatIntervalUnit: block.repeatIntervalUnit,
                    exceptions: block.exceptions,
                };
                return matchesRepeatPattern(patternObj, tDateStr);
            }
            return false;
        };

        let sentCount = 0;
        const timeToMins = (t: string) => {
            const [h, m] = t.split(':').map(Number); return h * 60 + m;
        };

        // 2. Extrai Todos os Blocos e Processa Notificações Futuras e Atuais
        const allBlocks = await db.select().from(missionBlocks);

        for (const block of allBlocks) {
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
                    const res = checkTrigger(blockStartMins, notifyMin);
                    if (res.isHit && isBlockValid(block, res.triggerDateStr)) {
                        const subs = await getUserSubs();
                        if (subs && subs.length > 0) {
                            const timeText = notifyMin === 0 ? "agorinha" : (notifyMin >= 1440 ? `em ${Math.floor(notifyMin/1440)} dia(s)` : `em ${notifyMin} minuto(s)`);
                            const payload = JSON.stringify({
                                title: "Hora do Bloco!",
                                body: `Seu bloco "${block.title}" começará ${timeText}.`
                            });
                            for (const subsc of subs) {
                                try {
                                    await webpush.sendNotification({ endpoint: subsc.endpoint, keys: { auth: subsc.auth, p256dh: subsc.p256dh } }, payload);
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

            // 3. Verifica tarefas do bloco
            for (let i = 0; i < subTasks.length; i++) {
                const sub = subTasks[i];
                const taskNotifs = sub.notifications || (sub.remindMe ? [sub.remindMe] : null);
                if (sub.done || !taskNotifs || !Array.isArray(taskNotifs)) continue;

                const computedStart = computedTaskTimes[i].start;

                for (const notifyMin of taskNotifs) {
                    const res = checkTrigger(computedStart, notifyMin);

                    if (res.isHit && isBlockValid(block, res.triggerDateStr)) {
                        if (!userSubscriptions) userSubscriptions = await getUserSubs();
                        if (!userSubscriptions || userSubscriptions.length === 0) continue;

                        const timeText = notifyMin === 0 ? "agorinha" : (notifyMin >= 1440 ? `em ${Math.floor(notifyMin/1440)} dia(s)` : `em ${notifyMin} minuto(s)`);
                        const payload = JSON.stringify({
                            title: "Lembrete de Tarefa!",
                            body: `A tarefa "${sub.title}" começará ${timeText}.`
                        });

                        for (const subsc of userSubscriptions) {
                            try {
                                await webpush.sendNotification({ endpoint: subsc.endpoint, keys: { auth: subsc.auth, p256dh: subsc.p256dh } }, payload);
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

        // 4. Verifica os Lembretes
        const allReminders = await db.select().from(reminders);

        for (const rem of allReminders) {
            if (rem.occurrencesLimit && rem.usedOccurrences !== null) {
                if (rem.usedOccurrences >= rem.occurrencesLimit) continue;
            }

            const remTimeMins = timeToMins(rem.time || "09:00");
            const notifs = (rem.notifications || []) as number[];

            let userSubscriptions: typeof pushSubscriptions.$inferSelect[] | null = null;
            const getUserSubs = async () => {
                if (!userSubscriptions) {
                    userSubscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, rem.userId));
                }
                return userSubscriptions;
            };

            // A. Notificações Base (Suporta agendamentos totalmente pro futuro)
            for (const notifyMin of notifs) {
                const res = checkTrigger(remTimeMins, notifyMin);
                if (res.isHit && matchesRepeatPattern(rem, res.triggerDateStr)) {
                    const subs = await getUserSubs();
                    if (subs && subs.length > 0) {
                        const timeText = notifyMin === 0 ? "agorinha" : (notifyMin >= 1440 ? `em ${Math.floor(notifyMin/1440)} dia(s)` : `em ${notifyMin} minuto(s)`);
                        const payload = JSON.stringify({
                            title: "Lembrete!",
                            body: `Atenção: "${rem.title}" está agendado para ${timeText}.`
                        });
                        for (const subsc of subs) {
                            try {
                                await webpush.sendNotification({ endpoint: subsc.endpoint, keys: { auth: subsc.auth, p256dh: subsc.p256dh } }, payload);
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

            // B. Notificações de Intervalo (A cada X horas, avaliado a partir da execução principal de Hoje)
            if (matchesRepeatPattern(rem, dateStr)) {
                if (rem.intervalHours && rem.intervalType && rem.intervalType !== 'none') {
                    const intervalMins = rem.intervalHours * 60;
                    let triggerLimit = 24;

                    if (rem.intervalType === 'occurrences' && rem.intervalOccurrences) {
                        triggerLimit = rem.intervalOccurrences;
                    } else if (rem.intervalType === 'until_end_of_day') {
                        triggerLimit = Math.ceil((24 * 60 - remTimeMins) / intervalMins) + 1;
                    }

                    for (let i = 1; i <= triggerLimit; i++) {
                        const intervalNotifyTime = remTimeMins + i * intervalMins;
                        
                        if (intervalNotifyTime >= 24 * 60 && rem.intervalType === 'until_end_of_day') break;

                        // Se o intervalo se cruza pelo dia, ignoramos para mantê-lo simples nas próximas execuções.
                        if (currentTimeInMins === intervalNotifyTime) {
                            const subs = await getUserSubs();
                            if (subs && subs.length > 0) {
                                const payload = JSON.stringify({
                                    title: "Lembrete Recorrente!",
                                    body: `Mais uma vez: "${rem.title}".`
                                });
                                for (const subsc of subs) {
                                    try {
                                        await webpush.sendNotification({ endpoint: subsc.endpoint, keys: { auth: subsc.auth, p256dh: subsc.p256dh } }, payload);
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
            }
        }

        return NextResponse.json({ success: true, sentCount, timeMatched: timeStr });

    } catch (error: any) {
        console.error("Erro no Cron de Tarefas:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
