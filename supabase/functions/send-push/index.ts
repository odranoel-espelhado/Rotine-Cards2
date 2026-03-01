// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"
import webpush from "npm:web-push";
import { createClient } from "npm:@supabase/supabase-js";

// Configuramos as VAPID Keys do Web Push (você precisará adicioná-las no .env do Supabase)
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const vapidSubject = "mailto:seu-email@exemplo.com"; // Substitua pelo seu e-mail

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

Deno.serve(async (req) => {
  try {
    // 1. Conectar ao Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 2. Extrair dados da requisição (ex: quem notificar)
    const { userId, title, body } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });
    }

    // 3. Buscar todas as "inscrições" desse usuário no banco
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    // 4. Disparar notificação para cada dispositivo do usuário
    const notifications = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          auth: sub.auth,
          p256dh: sub.p256dh
        }
      };

      const payload = JSON.stringify({ title: title || "Rotine Cards", body: body || "Você tem uma nova notificação!" });

      // Envia notificação
      return webpush.sendNotification(pushSubscription, payload).catch((err) => {
        console.error("Erro ao enviar para endpoint", sub.endpoint, err);
        // Opcional: deletar do banco se retornar erro "410 Gone" (usuário cancelou a permissão)
      });
    });

    await Promise.all(notifications);

    return new Response(
      JSON.stringify({ success: true, sentCount: notifications.length }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
})
