"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useState } from "react";
import { getCardHistory } from "@/lib/actions/cards.actions";

export interface CardLog {
    id: string;
    cardName: string;
    timestamp: Date;
    description: string;
}

export function CardHistory({ logs: ephemeralLogs }: { logs: CardLog[] }) {
    const [dbLogs, setDbLogs] = useState<any[]>([]);

    useEffect(() => {
        const fetchHistory = async () => {
            const history = await getCardHistory(15);
            setDbLogs(history);
        };
        fetchHistory();
    }, [ephemeralLogs]); // Re-fetch when new ephemeral log is added

    // Combine ephemeral logs (for immediate feedback) with DB logs
    // We try to unique them by timestamp if needed, but since ephemeral log has description as effect and DB has reason, it's fine
    // Actually, let's just show DB logs, since CardHistory gets re-rendered
    // But ephemeralLogs still exist for Hyperfocus. Let's merge them.
    
    const combinedLogs = [
        ...ephemeralLogs.map(l => ({
            id: l.id,
            cardName: l.cardName,
            reason: l.description,
            createdAt: l.timestamp
        })),
        ...dbLogs
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <div className="bg-[#050506] border border-white/5 rounded-2xl overflow-hidden p-6 w-full">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Histórico de Cards</h2>
                <span className="text-xs text-zinc-600 font-mono">LOGS: {combinedLogs.length}</span>
            </div>

            <ScrollArea className="h-[200px] w-full">
                {combinedLogs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-zinc-600 text-xs italic">
                        Nenhum card utilizado recentemente.
                    </div>
                ) : (
                    <div className="space-y-3 pr-4">
                        {combinedLogs.map((log, idx) => (
                            <div key={log.id || idx} className="p-3 bg-white/5 rounded-lg border-l-2 border-primary/50 flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-white uppercase">{log.cardName}</span>
                                    <span className="text-[10px] text-zinc-500">
                                        {format(new Date(log.createdAt), "d 'de' MMM, HH:mm", { locale: ptBR })}
                                    </span>
                                </div>
                                <p className="text-[11px] text-zinc-400">{log.reason}</p>
                                {log.metadata && log.metadata.duration && (
                                    <div className="mt-1 flex items-center gap-2 text-[10px] text-emerald-400/80">
                                        ⏱ {log.metadata.duration}min de pausa
                                        {log.metadata.affectedBlocksCount > 0 && ` • ${log.metadata.affectedBlocksCount} bloco(s) adiado(s)`}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
