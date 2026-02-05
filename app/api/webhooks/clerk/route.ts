import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { db } from '@/db'
import { users } from '@/db/schema'

export async function POST(req: Request) {
    // 1. Pega o segredo que você colocou na Vercel
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

    if (!WEBHOOK_SECRET) {
        throw new Error('Erro: CLERK_WEBHOOK_SECRET não configurado na Vercel.')
    }

    // 2. Pega os headers de verificação do Svix
    // Next.js 15+ headers() is async
    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    // Se não houver headers, nega a requisição
    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new Response('Erro: Headers do Svix ausentes', { status: 400 })
    }

    // 3. Pega o corpo da requisição
    const payload = await req.json()
    const body = JSON.stringify(payload);

    // 4. Cria uma nova instância do Svix com o seu segredo
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: WebhookEvent

    // 5. Verifica se a mensagem veio mesmo do Clerk (Segurança)
    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        }) as WebhookEvent
    } catch (err) {
        console.error('Erro ao verificar webhook:', err);
        return new Response('Erro de verificação', { status: 400 })
    }

    // 6. Processa o evento
    const eventType = evt.type;

    if (eventType === 'user.created') {
        const { id, email_addresses, first_name, last_name, image_url } = evt.data;

        try {
            await db.insert(users).values({
                id: id as string,
                // @ts-ignore
                email: email_addresses[0].email_address,
                name: `${first_name ?? ''} ${last_name ?? ''}`.trim(),
                avatarUrl: image_url,
            });
            console.log(`✅ Usuário ${id} sincronizado com sucesso!`);
        } catch (dbError) {
            console.error('Erro ao inserir no banco:', dbError);
            return new Response('Erro no Banco de Dados', { status: 500 });
        }
    }

    return new Response('Webhook processado', { status: 200 })
}