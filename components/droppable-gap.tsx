"use client";

import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BacklogTask } from "@/lib/actions/backlog.actions";

interface DroppableGapProps {
    id: string; // gap-${date}-${startTime}
    durationMinutes: number;
    startTime: string; // HH:mm
    onConvertToBlock: (task: BacklogTask) => void;
    onAddTask: () => void;
    suggestedTask?: BacklogTask;
    isCurrent?: boolean;
}

export function DroppableGap({ id, durationMinutes, startTime, onConvertToBlock, onAddTask, suggestedTask, isCurrent }: DroppableGapProps) {
    const { isOver, setNodeRef } = useDroppable({
        id,
        data: { type: 'gap', startTime, duration: durationMinutes }
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "mb-4 pl-12 h-8 relative flex items-center group/gap transition-all duration-300 rounded-lg",
                isOver ? "bg-white/10 scale-[1.02] border border-white/20 border-dashed" : ""
            )}
        >
            {/* Current Time Line Indicator for Gap */}
            {isCurrent && (
                <div
                    className="absolute top-1/2 -translate-y-1/2 left-0 w-full z-30 pointer-events-none flex items-center"
                    id="current-time-line"
                >
                    <div className="w-full h-[2px] bg-blue-500 shadow-[0_0_10px_2px_rgba(59,130,246,0.5)]"></div>
                    <div className="absolute -left-1.5 w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_2px_rgba(59,130,246,0.5)]"></div>
                </div>
            )}

            {/* Side Label */}
            <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <span className={cn(
                    "text-xs font-mono font-bold text-white transition-colors",
                    isOver ? "scale-110" : "opacity-70 group-hover/gap:opacity-100"
                )}>
                    GAP: {Math.floor(durationMinutes / 60)}H {durationMinutes % 60}M
                </span>

                {/* Buttons */}
                {!isOver && (
                    <div className="flex gap-1 ml-2 opacity-100 lg:opacity-0 lg:group-hover/gap:opacity-100 transition-opacity">
                        {suggestedTask && (
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-5 text-[9px] px-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-black border border-emerald-500/20"
                                onClick={() => onConvertToBlock(suggestedTask)}
                            >
                                Adicionar {suggestedTask.title}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 text-[9px] px-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
                            onClick={onAddTask}
                        >
                            {suggestedTask ? "Outra" : "Adicionar Tarefa"}
                        </Button>
                    </div>
                )}
            </div>

            {/* Line visual */}
            <div className={cn(
                "absolute left-[34px] w-[2px] h-full transition-colors",
                isOver ? "bg-white/50" : "bg-zinc-800/50"
            )}></div>

            {/* Drop Zone Visual Hint */}
            {isOver && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50 font-bold uppercase tracking-widest animate-pulse">
                    Solte para criar Bloco
                </div>
            )}
        </div>
    );
}
