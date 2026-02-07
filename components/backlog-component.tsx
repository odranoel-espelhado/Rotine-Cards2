"use client";

import { useState } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BacklogTask, createBacklogTask, deleteBacklogTask } from "@/lib/actions/backlog.actions";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DraggableBacklogItem } from "./draggable-backlog-item";

import { CreateTaskDialog } from "./create-task-dialog";

export function BacklogComponent({ initialTasks, availableBlockTypes = [] }: { initialTasks: BacklogTask[], availableBlockTypes?: { label: string, color: string, icon?: string }[] }) {
    const [editingTask, setEditingTask] = useState<BacklogTask | null>(null);

    const handleDelete = async (id: string) => {
        const res = await deleteBacklogTask(id);
        if (res?.success) {
            toast.message("Tarefa removida");
        }
    };

    // Grouping & Sorting Logic
    const groupedTasks = initialTasks.reduce((groups, task) => {
        const key = task.linkedBlockType || "Geral";
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(task);
        return groups;
    }, {} as Record<string, BacklogTask[]>);

    // Sort tasks within groups
    Object.keys(groupedTasks).forEach(key => {
        groupedTasks[key].sort((a, b) => {
            // 1. Priority (High > Medium > Low)
            const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1, alta: 3, media: 2, baixa: 1 };

            const pA = priorityWeight[a.priority?.toLowerCase() || 'medium'] || 1;
            const pB = priorityWeight[b.priority?.toLowerCase() || 'medium'] || 1;

            if (pA !== pB) return pB - pA; // Descending priority

            // 2. Duration (High > Low for Blocks/General view)
            // User requested "Maior para Blocos" as the primary logic for the 'queue'.
            return (b.estimatedDuration || 0) - (a.estimatedDuration || 0);
        });
    });

    const sortedGroups = Object.keys(groupedTasks).sort((a, b) => {
        if (a === "Geral") return 1; // Generic last
        if (b === "Geral") return -1;
        return a.localeCompare(b);
    });

    return (
        <div className="flex flex-col h-full bg-[#030304] border-l border-white/5 w-full">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Tarefas</h2>
                    <Badge variant="outline" className="text-zinc-500 border-white/10">{initialTasks.length}</Badge>
                </div>
                <CreateTaskDialog availableBlockTypes={availableBlockTypes} />
            </div>

            {/* Input Area replaced by Dialog Trigger - Removed */}


            {/* Task List */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {initialTasks.length === 0 && (
                        <div className="text-center py-8 text-zinc-600 text-xs">
                            Sem tarefas pendentes forasteiro.
                        </div>
                    )}

                    {sortedGroups.map(groupKey => {
                        const tasks = groupedTasks[groupKey];
                        const blockColor = availableBlockTypes.find(b => b.label === groupKey)?.color || "#27272a";

                        return (
                            <div key={groupKey} className="space-y-2">
                                <div className="flex items-center gap-2 px-1">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: groupKey === 'Geral' ? '#52525b' : blockColor }} />
                                    <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">{groupKey}</h3>
                                </div>
                                <div className="space-y-2">
                                    {tasks.map((task) => (
                                        <DraggableBacklogItem
                                            key={task.id}
                                            task={task}
                                            onDelete={handleDelete}
                                            onEdit={setEditingTask}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>

            {/* Edit Dialog */}
            {editingTask && (
                <CreateTaskDialog
                    availableBlockTypes={availableBlockTypes}
                    taskToEdit={editingTask}
                    open={true}
                    onOpenChange={(open) => !open && setEditingTask(null)}
                />
            )}
        </div>
    );
}
