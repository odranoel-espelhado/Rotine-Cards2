"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface CardLog {
    id: string;
    cardName: string;
    timestamp: Date;
    description: string;
}

export function CardHistory({ logs }: { logs: CardLog[] }) {
    return (
        <div className="bg-[#050506] border border-white/5 rounded-2xl overflow-hidden p-6 w-full">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Histórico de Cards</h2>
                <span className="text-xs text-zinc-600 font-mono">LOGS: {logs.length}</span>
            </div>

            <ScrollArea className="h-[200px] w-full">
                {logs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-600 text-xs italic">
                        Nenhum card utilizado recentemente.
                    </div>
                ) : (
                    <div className="space-y-3 pr-4">
                        {logs.map((log) => (
                            <div key={log.id} className="p-3 bg-white/5 rounded-lg border-l-2 border-primary/50 flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-white uppercase">{log.cardName}</span>
                                    <span className="text-[10px] text-zinc-500">
                                        {format(log.timestamp, "d 'de' MMM, HH:mm", { locale: ptBR })}
                                    </span>
                                </div>
                                <p className="text-[11px] text-zinc-400">{log.description}</p>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
