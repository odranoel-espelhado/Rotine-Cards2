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

        const currentHours = brTime.getHours().toString().padStart(2, '0');
        const currentMinutes = brTime.getMinutes().toString().padStart(2, '0');
        const timeStr = `${currentHours}:${currentMinutes}`; // "HH:MM"

        const dayOfWeek = brTime.getDay(); // 0 = Domingo, 6 = Sábado
        const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

        // 1. Pega todas as Tarefas e Blocos
        const allBlocks = await db.select().from(missionBlocks);

        // 2. Filtra as Tarefas que devem começar EXATAMENTE neste minuto
        const tasksNow = allBlocks.filter((block) => {
            // Verifica a hora e o status da tarefa real
            // if (block.startTime !== timeStr) return false; // TEMP DEBUG REMOVED

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
                // (Caso adicione diariamente, mensalmente futuramente nas Tarefas)
            }

            return false;
        });

        if (tasksNow.length === 0) {
            return NextResponse.json({ message: "Nenhuma tarefa agendada para este exato minuto.", debugServerTime: timeStr, debugDate: dateStr });
        }

        let sentCount = 0;

        // 3. Dispara a Notificão de Push para os donos das tarefas
        for (const task of tasksNow) {
            const userSubscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, task.userId));

            const payload = JSON.stringify({
                title: "É hora de focar!",
                body: `Sua tarefa "${task.title}" começou agora.`
            });

            for (const sub of userSubscriptions) {
                try {
                    await webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: {
                            auth: sub.auth,
                            p256dh: sub.p256dh
                        }
                    }, payload);
                    sentCount++;
                } catch (error: any) {
                    console.error("Erro ao enviar push:", sub.endpoint, error);
                    // 410 = Inscrição revogada pelo usuário (removemos do banco para limpar as falhas)
                    if (error.statusCode === 410 || error.statusCode === 404) {
                        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
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
