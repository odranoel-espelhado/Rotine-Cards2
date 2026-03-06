import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// 1. Definimos o que é rota protegida (Dashboard)
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

// 2. Definimos o que é rota pública (Webhook do Clerk)
const isPublicRoute = createRouteMatcher(["/api/webhooks/clerk"]);

export default clerkMiddleware(async (auth, req) => {
    // Se for a rota do Webhook, não faz nada (deixa passar)
    if (isPublicRoute(req)) return;

    // Se for dashboard, exige login
    if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Sempre rodar para rotas de API
        '/(api|trpc)(.*)',
    ],
};