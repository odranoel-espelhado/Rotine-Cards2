import { NextResponse } from "next/server";
import { db } from "@/db";
import { reminders, pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import webpush from "web-push";

// Configura o Web Push com as chaves do .env.local
webpush.setVapidDetails(
    "mailto:seu-email@exemplo.com", // Mude isso para o seu email depois
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
    process.env.VAPID_PRIVATE_KEY || ""
);

// Essa rota pode ser chamada externamente pela Vercel Cron
export async function GET(request: Request) {
    // Opcional: Proteger a rota para que apenas o Vercel Cron consiga acessar (usando CRON_SECRET)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const dayOfWeek = today.getDay(); // 0-6 (Dom-Sab)
    const dateOfMonth = today.getDate(); // 1-31
    const monthOfYear = today.getMonth(); // 0-11

    try {
        // 1. Pega TODOS os lembretes do banco de dados (num sistema gigante a gente filtraria já na query)
        const allReminders = await db.select().from(reminders);

        // 2. Filtra quais lembretes devem ser disparados "hoje"
        const remindersToday = allReminders.filter(r =>
            r.targetDate === dateStr ||
            r.repeatPattern === 'daily' ||
            (r.repeatPattern === 'weekly' && new Date(r.targetDate).getDay() === dayOfWeek && dateStr >= r.targetDate) ||
            (r.repeatPattern === 'monthly' && new Date(r.targetDate).getDate() === dateOfMonth && dateStr >= r.targetDate) ||
            (r.repeatPattern === 'yearly' && new Date(r.targetDate).getDate() === dateOfMonth && new Date(r.targetDate).getMonth() === monthOfYear && dateStr >= r.targetDate)
        );

        if (remindersToday.length === 0) {
            return NextResponse.json({ message: "Nenhum lembrete para hoje." });
        }

        let sentCount = 0;

        // 3. Para cada lembrete válido, notificar o usuário correspondente
        for (const reminder of remindersToday) {
            // Buscar as inscrições de push (celulares/PCs) atreladas ao criador do lembrete
            const userSubscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, reminder.userId));

            const payload = JSON.stringify({
                title: reminder.title,
                body: reminder.description || "Lembrete do Rotine Cards!"
            });

            for (const sub of userSubscriptions) {
                try {
                    // Envia o Push
                    await webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: {
                            auth: sub.auth,
                            p256dh: sub.p256dh
                        }
                    }, payload);
                    sentCount++;
                } catch (error: any) {
                    console.error("Erro ao enviar push para", sub.endpoint, error);
                    // 410 (Gone) = Usuário bloqueou notificações ou desinstalou, bom para limpar o banco depois...
                    if (error.statusCode === 410 || error.statusCode === 404) {
                        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
                    }
                }
            }
        }

        return NextResponse.json({ success: true, sentCount });

    } catch (error: any) {
        console.error("Erro no Cron de Lembretes:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
