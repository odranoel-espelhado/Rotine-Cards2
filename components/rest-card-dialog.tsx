"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coffee, Clock, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { activateRestCard } from "@/lib/actions/cards.actions";
import { toast } from "sonner";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

const DURATION_OPTIONS = [
    { label: "15min", value: 15 },
    { label: "30min", value: 30 },
    { label: "45min", value: 45 },
    { label: "1h", value: 60 },
    { label: "1h30", value: 90 },
];

interface RestCardDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    cardId: string;
    selectedDate: string;
}

export function RestCardDialog({ open, onOpenChange, cardId, selectedDate }: RestCardDialogProps) {
    const router = useRouter();
    const [duration, setDuration] = useState(30);
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [startTime, setStartTime] = useState(format(new Date(), "HH:mm"));

    const getEndTime = () => {
        const [h, m] = startTime.split(":").map(Number);
        const totalMins = h * 60 + m + duration;
        const endH = Math.floor(totalMins / 60) % 24;
        const endM = totalMins % 60;
        return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
    };

    const handleActivate = async () => {
        if (!reason.trim()) {
            toast.error("Informe o motivo do descanso");
            return;
        }

        setLoading(true);
        const res = await activateRestCard(cardId, duration, reason.trim(), selectedDate, startTime);
        setLoading(false);

        if (res?.success) {
            toast.success("☕ Descanso Tático Ativado!", {
                description: `${duration}min de pausa começando às ${startTime}. ${res.affectedBlocks} bloco(s) reagendado(s).`,
                icon: <Sparkles className="h-4 w-4 text-emerald-400" />,
            });
            setReason("");
            setDuration(30);
            setStartTime(format(new Date(), "HH:mm"));
            onOpenChange(false);
            router.refresh();
        } else {
            toast.error(res?.error || "Erro ao ativar descanso");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0a0a0b] border-emerald-500/20 max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <Coffee className="h-4 w-4 text-emerald-400" />
                        </div>
                        Descanso Tático
                    </DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Crie um bloco de descanso para agora (ou outro momento). Os blocos posteriores a ele serão empurrados.
                    </DialogDescription>
                </DialogHeader>

                {/* Time Preview / Input */}
                <div className="space-y-2">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Horário de Início</label>
                    <div className="flex items-center gap-3 py-3 px-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                        <Clock className="h-4 w-4 text-emerald-400" />
                        <Input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="bg-transparent border-0 text-emerald-300 font-mono text-sm w-[80px] focus-visible:ring-0 shadow-none p-0 h-auto cursor-text text-center"
                        />
                        <span className="text-sm font-mono text-emerald-300">
                            → {getEndTime()}
                        </span>
                        <span className="text-xs text-zinc-500 ml-auto">({duration}min)</span>
                    </div>
                </div>

                {/* Duration Selector */}
                <div className="space-y-2">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">Duração</label>
                    <div className="flex gap-2">
                        {DURATION_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setDuration(opt.value)}
                                className={cn(
                                    "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 border",
                                    duration === opt.value
                                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                                        : "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Reason Input */}
                <div className="space-y-2">
                    <label className="text-xs text-zinc-500 uppercase tracking-wider font-bold">
                        Motivo <span className="text-emerald-400">*</span>
                    </label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ex: Preciso recarregar antes da próxima sessão de estudo..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-zinc-600 resize-none h-20 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                        maxLength={200}
                    />
                    <div className="text-right">
                        <span className="text-[10px] text-zinc-600">{reason.length}/200</span>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="border-white/10 text-zinc-400 hover:text-white"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleActivate}
                        disabled={loading || !reason.trim()}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white border-0 gap-2"
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Coffee className="h-4 w-4" />
                        )}
                        Ativar Descanso
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
