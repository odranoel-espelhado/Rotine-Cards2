"use client";

import { TacticalCard, useTacticalCard } from "@/lib/actions/cards.actions";
import { Zap, Coffee, Users, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

const IconMap: Record<string, any> = {
    focus: Zap,
    coffee: Coffee,
    users: Users,
};

export function TacticalDeck({ cards, onCardUsed }: { cards: TacticalCard[], onCardUsed?: (card: TacticalCard) => void }) {
    const [loading, setLoading] = useState<string | null>(null);

    const handleUseCard = async (card: TacticalCard) => {
        if ((card.usedCharges || 0) >= (card.totalCharges || 0)) return;

        setLoading(card.id);
        const res = await useTacticalCard(card.id);
        setLoading(null);

        if (res?.success) {
            toast.success("Card Ativado!", {
                description: `${card.name}: ${card.effect}`,
                icon: <Sparkles className="h-4 w-4 text-amber-400" />,
            });
            if (onCardUsed) onCardUsed(card);
        } else {
            toast.error(res?.error || "Erro ao usar card");
        }
    };

    return (
        <div className="grid grid-cols-1 gap-3">
            {cards.map(card => {
                const Icon = IconMap[card.icon] || Zap;
                const remaining = (card.totalCharges || 0) - (card.usedCharges || 0);
                const isDepleted = remaining <= 0;

                return (
                    <div
                        key={card.id}
                        onClick={() => !isDepleted && handleUseCard(card)}
                        className={cn(
                            "group relative overflow-hidden rounded-xl border border-white/5 bg-[#050506] p-4 transition-all duration-300",
                            isDepleted ? "opacity-50 grayscale cursor-not-allowed" : "hover:border-primary/50 hover:bg-white/5 cursor-pointer hover:scale-[1.02]"
                        )}
                    >
                        {/* Progress Bar Background */}
                        <div
                            className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-20 transition-all group-hover:opacity-50"
                            style={{ width: `${(remaining / (card.totalCharges || 1)) * 100}%` }}
                        />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 group-hover:border-primary/30 transition-colors")}>
                                    <Icon className="h-5 w-5" style={{ color: isDepleted ? '#71717a' : card.color }} />
                                </div>
                                <div>
                                    <h4 className={cn("text-sm font-bold transition-colors", isDepleted ? "text-zinc-500" : "text-white group-hover:text-primary")}>
                                        {card.name}
                                    </h4>
                                    <p className="text-[10px] text-zinc-400 leading-tight max-w-[150px]">
                                        {card.effect}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                                <span className={cn("text-xs font-mono font-bold", isDepleted ? "text-zinc-600" : "text-primary")}>
                                    {remaining}/{card.totalCharges}
                                </span>
                                {loading === card.id && (
                                    <Sparkles className="h-3 w-3 animate-spin text-amber-500" />
                                )}
                            </div>
                        </div>

                        {/* Charges Dots */}
                        <div className="flex gap-1 mt-3 justify-end opacity-30 group-hover:opacity-100 transition-opacity">
                            {Array.from({ length: card.totalCharges || 0 }).map((_, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "h-1.5 w-1.5 rounded-full border border-white/20",
                                        i < (card.usedCharges || 0) ? "bg-transparent" : "bg-current"
                                    )}
                                    style={{ color: card.color }}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
