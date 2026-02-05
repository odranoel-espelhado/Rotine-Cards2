"use client";

import { useDroppable } from "@dnd-kit/core";
import { MissionBlock } from "@/lib/actions/mission.actions";
import { Zap, Trash2, Pencil } from "lucide-react";
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

    const glowColor = block.color || '#3b82f6';

    const isFinished = false; // TODO: Add logic for finished state

    return (
        <div ref={setNodeRef} className="relative w-full group mb-4 pl-12">
            {/* Time Marker - connected with line in future updates */}
            <span className="text-[10px] text-zinc-600 font-mono absolute left-2 top-8 -rotate-90 origin-center w-8 text-center">{block.startTime}</span>

            <div
                className={cn(
                    "task-block bg-[#050506]",
                    isFinished ? "task-finished neon-border-check" : "",
                    isOver ? "scale-[1.02] ring-1 ring-white/20" : "hover:scale-[1.01]",
                )}
                style={{
                    borderColor: isFinished ? glowColor : 'rgba(255,255,255,0.1)',
                    color: isFinished ? glowColor : 'white'
                }}
            >
                {/* Conflict Tag Placeholder */}
                {/* <div className="conflict-tag">Conflito</div> */}

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Checkbox */}
                        <div
                            className="h-6 w-6 rounded border border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors"
                            style={{ borderColor: glowColor }}
                        >
                            {isFinished && <div className="h-3 w-3 bg-current rounded-sm" />}
                        </div>

                        <div>
                            <h3 className="text-lg font-black uppercase tracking-wider truncate">{block.title}</h3>
                            <div className="flex gap-2 text-[10px] font-bold opacity-50 uppercase tracking-widest">
                                <span>{block.totalDuration} MIN</span>
                                <span>•</span>
                                <span>{block.startTime} - {addMinutes(block.startTime, block.totalDuration)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
                            className="btn-action btn-delete-red"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                        <button className="btn-action">
                            <Pencil className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Subtasks */}
                {(block.subTasks as any[])?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {(block.subTasks as any[]).map((sub: any, i: number) => (
                            <div key={i} className="subtask-pill">
                                {sub.done && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>}
                                <span className={sub.done ? "line-through opacity-50" : ""}>{sub.title}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper for time calc
function addMinutes(time: string, mins: number) {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
