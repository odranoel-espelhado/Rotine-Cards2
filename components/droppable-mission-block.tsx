"use client";

import { useDroppable } from "@dnd-kit/core";
import { MissionBlock } from "@/lib/actions/mission.actions";
import { Zap, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MissionBlockProps {
    block: MissionBlock;
    onDelete: (id: string) => void;
}

export function DroppableMissionBlock({ block, onDelete }: MissionBlockProps) {
    const { isOver, setNodeRef } = useDroppable({
        id: block.id,
        data: { type: 'mission-block', block }
    });

    return (
        <div ref={setNodeRef} className="relative pl-8 z-10 w-full group">
            <div className="absolute left-[-5px] top-6 h-4 w-4 rounded-full border-4 border-[#020203]" style={{ backgroundColor: block.color || '#3b82f6' }}></div>
            <span className="text-xs text-zinc-500 absolute left-4 top-0">{block.startTime}</span>

            <div className={cn(
                "w-full bg-[#050506] border border-white/10 rounded-lg p-4 shadow-sm transition-all cursor-pointer relative",
                isOver ? "border-primary ring-2 ring-primary/20 bg-primary/5 scale-[1.01]" : "hover:border-primary/50"
            )}>

                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" style={{ color: block.color || '#3b82f6' }} />
                        <h3 className="font-bold text-white group-hover:text-primary transition-colors">{block.title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-500">{block.totalDuration}min</span>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(block.id); }} className="text-zinc-600 hover:text-destructive transition-colors">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                </div>

                {/* Subtasks Preview */}
                <div className="space-y-1">
                    {(block.subTasks as any[])?.slice(0, 3).map((sub: any, idx: number) => (
                        <div key={idx} className="bg-white/5 rounded px-2 py-1 text-xs text-zinc-300 flex justify-between">
                            <span>{sub.title || sub.task || "Tarefa"}</span>
                            <span className="text-zinc-500">{sub.duration}m</span>
                        </div>
                    ))}
                    {(block.subTasks as any[])?.length > 3 && (
                        <div className="text-[10px] text-zinc-500 text-center pt-1">
                            +{(block.subTasks as any[]).length - 3} tarefas
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
