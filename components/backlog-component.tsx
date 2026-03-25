"use client";

import { useState } from "react";
import { BacklogTask, deleteBacklogTask } from "@/lib/actions/backlog.actions";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DraggableBacklogItem } from "./draggable-backlog-item";
import { CreateTaskDialog } from "./create-task-dialog";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BacklogComponent({ initialTasks, availableBlockTypes = [] }: { initialTasks: BacklogTask[], availableBlockTypes?: { label: string, color: string, icon?: string }[] }) {
    const [editingTask, setEditingTask] = useState<BacklogTask | null>(null);
    // Per-group state: whether to show hidden tasks
    const [showHiddenForGroup, setShowHiddenForGroup] = useState<Record<string, boolean>>({});

    const handleDelete = async (id: string) => {
        const res = await deleteBacklogTask(id);
        if (res?.success) {
            toast.message("Tarefa removida");
        }
    };

    // Grouping & Sorting Logic
    const groupedTasks = initialTasks.reduce((groups, task) => {
        const key = task.linkedBlockType || "Geral";
        if (!groups[key]) groups[key] = [];
        groups[key].push(task);
        return groups;
    }, {} as Record<string, BacklogTask[]>);

    // Sort tasks within groups
    Object.keys(groupedTasks).forEach(key => {
        groupedTasks[key].sort((a, b) => {
            const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1, alta: 3, media: 2, baixa: 1 };
            const pA = priorityWeight[a.priority?.toLowerCase() || 'medium'] || 1;
            const pB = priorityWeight[b.priority?.toLowerCase() || 'medium'] || 1;
            if (pA !== pB) return pB - pA;
            return (b.estimatedDuration || 0) - (a.estimatedDuration || 0);
        });
    });

    const sortedGroups = Object.keys(groupedTasks).sort((a, b) => {
        if (a === "Geral") return 1;
        if (b === "Geral") return -1;
        return a.localeCompare(b);
    });

    const visibleCount = initialTasks.filter(t => !t.isHidden).length;

    return (
        <div className="flex flex-col h-full bg-[#030304] border-l border-white/5 w-full">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Tarefas</h2>
                    <Badge variant="outline" className="text-zinc-500 border-white/10">{visibleCount}</Badge>
                </div>
                <CreateTaskDialog availableBlockTypes={availableBlockTypes} />
            </div>

            {/* Task List */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {initialTasks.length === 0 && (
                        <div className="text-center py-8 text-zinc-600 text-xs">
                            Sem tarefas pendentes forasteiro.
                        </div>
                    )}

                    {sortedGroups.map(groupKey => {
                        const allGroupTasks = groupedTasks[groupKey];
                        const blockColor = availableBlockTypes.find(b => b.label === groupKey)?.color || "#27272a";

                        const visibleTasks = allGroupTasks.filter(t => !t.isHidden);
                        const hiddenTasks = allGroupTasks.filter(t => t.isHidden);
                        const showingHidden = showHiddenForGroup[groupKey] ?? false;

                        // Duration based on visible only
                        const totalMins = visibleTasks.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);
                        const h = Math.floor(totalMins / 60);
                        const m = totalMins % 60;

                        const displayedTasks = showingHidden ? allGroupTasks : visibleTasks;

                        return (
                            <div key={groupKey} className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: groupKey === 'Geral' ? '#52525b' : blockColor }} />
                                        <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">{groupKey}</h3>
                                        {hiddenTasks.length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 text-zinc-600 hover:text-amber-400 rounded-full p-0"
                                                onClick={() => setShowHiddenForGroup(prev => ({ ...prev, [groupKey]: !showingHidden }))}
                                                title={showingHidden ? "Ocultar tarefas ocultas" : `Exibir tarefas ocultas (${hiddenTasks.length})`}
                                            >
                                                {showingHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                            </Button>
                                        )}
                                    </div>
                                    <span className="text-[9px] font-bold text-zinc-600 tracking-tighter uppercase">
                                        {h > 0 ? `${h}h ` : ""}{m}m
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {displayedTasks.map((task) => (
                                        <div key={task.id} className={task.isHidden ? "opacity-50" : undefined}>
                                            <DraggableBacklogItem
                                                task={task}
                                                onDelete={handleDelete}
                                                onEdit={setEditingTask}
                                            />
                                        </div>
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
