"use client";

import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Trash2, RefreshCw } from "lucide-react";
import { updateUserSettings } from "@/lib/actions/user.actions";
import { deleteAllUserData } from "@/lib/actions/mission.actions";
import { resetAllCards } from "@/lib/actions/cards.actions";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { savePushSubscription } from "@/lib/actions/push.actions";

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function SettingsDialog({ initialSettings }: { initialSettings?: any }) {
    const [open, setOpen] = useState(false);

    // Config state
    const [settings, setSettings] = useState({
        autoArchive: true,
        autoArchiveTime: "23:59",
        timelineStart: "08:00",
        timelineEnd: "24:00",
        ...(initialSettings || {})
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (open && initialSettings) {
            setSettings({
                autoArchive: true,
                autoArchiveTime: "23:59",
                timelineStart: "08:00",
                timelineEnd: "24:00",
                ...initialSettings
            });
        }
        if (open && typeof window !== "undefined" && "Notification" in window) {
            setNotificationPermission(Notification.permission);
        }
    }, [open, initialSettings]);

    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');

    const handleRequestNotification = async () => {
        if (!("Notification" in window)) {
            toast.error("Seu navegador não suporta notificações.");
            setNotificationPermission('unsupported');
            return;
        }
        try {
            const permission = await Notification.requestPermission();
            setNotificationPermission(permission);
            if (permission === 'granted') {
                toast.success("Permissão garantida com sucesso!");

                // --- Registro do Serviço Web Push (Background) ---
                if ('serviceWorker' in navigator) {
                    try {
                        // Registra ou pega o service worker existente
                        const registration = await navigator.serviceWorker.register('/sw.js', {
                            scope: '/',
                            updateViaCache: 'none',
                        });

                        const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
                        if (!publicVapidKey) {
                            console.error("NEXT_PUBLIC_VAPID_PUBLIC_KEY não encontrado.");
                            toast.error("Vapid Key não configurada no cliente.");
                            return;
                        }

                        // Solicita ao navegador um endpoint/chaves de Push (abre conexão criptografada com os servidores do Browser)
                        const subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true, // Obrigatório mostrar algo visual (notificação) ao usuário quando um push chega
                            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
                        });

                        // Chama a Server Action pra registrar o endpoint no Drizzle/Supabase
                        const res = await savePushSubscription(JSON.stringify(subscription));
                        if (res.success) {
                            toast.success("Notificações Push em Background ativadas!");
                        } else {
                            toast.error("Falha ao salvar a inscrição Push no servidor.");
                            console.error(res.error);
                        }
                    } catch (err) {
                        console.error("Service Worker ou Push Manager Error:", err);
                        toast.error("Erro interno ao configurar notificações Push.");
                    }
                } else {
                    toast.error("Seu navegador não suporta Service Workers para Background Push.");
                }
            } else if (permission === 'denied') {
                toast.error("Permissão de notificações recusada.");
            }
        } catch (e) {
            toast.error("Falha ao pedir permissão.");
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const res = await updateUserSettings(settings);
        setIsSaving(false);
        if (res.success) {
            toast.success("Configurações salvas! A página será atualizada.");
            setOpen(false);
            window.location.reload(); // Reload to apply layout changes
        } else {
            toast.error("Erro ao salvar configurações.");
        }
    };

    const handleClearAll = async () => {
        if (confirm("Tem certeza? Isso apagará TODOS os seus blocos e tarefas permanentemente.")) {
            const res = await deleteAllUserData();
            if (res.success) {
                toast.success("Dados limpos com sucesso!");
                setOpen(false);
            } else {
                toast.error("Erro ao limpar dados.");
            }
        }
    };

    const handleResetCards = async () => {
        if (confirm("Deseja restaurar as cargas de todos os seus Cards Táticos?")) {
            const res = await resetAllCards();
            if (res?.success) {
                toast.success("Cargas restauradas com sucesso!");
            } else {
                toast.error("Erro ao restaurar cargas.");
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white hover:bg-white/10">
                    <Settings className="w-5 h-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] bg-[#050506] border border-white/10 text-white rounded-3xl p-6">
                <DialogTitle className="text-xl font-bold uppercase mb-4 text-center">Configurações</DialogTitle>

                <div className="space-y-6">
                    {/* Linha do Tempo */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-white/50 uppercase">Linha do Tempo</h3>
                        <div className="flex gap-4">
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs text-white/70">Hora Inicial</Label>
                                <Input
                                    type="time"
                                    value={settings.timelineStart}
                                    onChange={(e) => setSettings({ ...settings, timelineStart: e.target.value })}
                                    className="bg-zinc-900 border-zinc-800 text-white"
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs text-white/70">Hora Final</Label>
                                <Input
                                    type="time"
                                    value={settings.timelineEnd}
                                    onChange={(e) => setSettings({ ...settings, timelineEnd: e.target.value })}
                                    className="bg-zinc-900 border-zinc-800 text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Arquivamento */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-white/50 uppercase">Automação</h3>
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="autoArchive"
                                checked={settings.autoArchive}
                                onCheckedChange={(c) => setSettings({ ...settings, autoArchive: c as boolean })}
                                className="border-zinc-700 data-[state=checked]:bg-blue-600"
                            />
                            <Label htmlFor="autoArchive" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Arquivar Blocos Incompletos Automaticamente
                            </Label>
                        </div>
                        {settings.autoArchive && (
                            <div className="pl-6 space-y-1 animate-in slide-in-from-top-2">
                                <Label className="text-xs text-white/70">Horário da Varredura (Geralmente no final do dia)</Label>
                                <Input
                                    type="time"
                                    value={settings.autoArchiveTime}
                                    onChange={(e) => setSettings({ ...settings, autoArchiveTime: e.target.value })}
                                    className="bg-zinc-900 border-zinc-800 text-white w-32"
                                />
                            </div>
                        )}
                    </div>

                    {/* Notificações */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-white/50 uppercase">Notificações</h3>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-bold text-white flex items-center gap-1.5">
                                    <Bell className="w-3.5 h-3.5" /> Alertas do Navegador
                                </Label>
                                <p className="text-[10px] text-zinc-400">Receba os avisos de tarefas no Desktop/Celular.</p>
                            </div>
                            <Button
                                size="sm"
                                variant={notificationPermission === 'granted' ? "outline" : "default"}
                                className={cn(
                                    "h-7 text-xs transition-colors",
                                    notificationPermission === 'granted' ? "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300" : "bg-blue-600 hover:bg-blue-700"
                                )}
                                onClick={handleRequestNotification}
                                disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
                            >
                                {notificationPermission === 'granted' ? "Permitido ✓" : notificationPermission === 'denied' ? "Bloqueado ⚠️" : "Permitir"}
                            </Button>
                        </div>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold uppercase transition-colors"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? "Salvando..." : "Salvar Configurações"}
                    </Button>

                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between mt-6">
                        <div>
                            <h3 className="text-sm font-bold text-amber-500 uppercase">Recarga Completa</h3>
                            <p className="text-[10px] text-zinc-400">Restaura as cargas usadas dos cards.</p>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleResetCards}
                            className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs uppercase"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Recarregar Cards
                        </Button>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between mt-4">
                        <div>
                            <h3 className="text-sm font-bold text-red-500 uppercase">Zona de Perigo</h3>
                            <p className="text-[10px] text-zinc-400">Apagar todos os dados da conta.</p>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleClearAll}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Limpar Tudo
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
