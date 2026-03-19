"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

interface DroppableBoundaryProps {
    id: string; // e.g., boundary-start-${date}
    time: string; // HH:mm
    label: string;
}

export function DroppableBoundary({ id, time, label }: DroppableBoundaryProps) {
    const { isOver, setNodeRef } = useDroppable({
        id,
        data: { type: 'gap', startTime: time, duration: 60 } // Default 1h block if dropped on boundary
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "relative flex items-center w-full my-6 group transition-all duration-300",
                isOver ? "py-4 scale-[1.02]" : "py-1"
            )}
            title={`Arraste tarefa para iniciar às ${time}`}
        >
            {/* Left Label */}
            <span className={cn(
                "absolute left-0 text-xs font-mono font-bold transition-all w-12 text-right pointer-events-none",
                isOver ? "text-white scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : "text-zinc-500 group-hover:text-zinc-300"
            )}>
                {time}
            </span>

            {/* The Line */}
            <div className="flex-1 ml-14 relative flex items-center">
                <div className={cn(
                    "w-full rounded-full transition-all shadow-[0_0_10px_rgba(255,255,255,0.1)]",
                    isOver ? "h-[2px] bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]" : "h-[1px] bg-white/20 group-hover:bg-white/40 group-hover:shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                )}></div>

                {/* Text hint on hover/over */}
                <span className={cn(
                    "absolute left-1/2 -translate-x-1/2 bg-[#050506] px-3 font-bold uppercase tracking-widest transition-opacity text-[10px]",
                    isOver ? "text-white opacity-100" : "text-zinc-500 opacity-50 group-hover:opacity-100"
                )}>
                    {isOver ? "Solte para iniciar bloco" : label}
                </span>
            </div>
        </div>
    );
}
