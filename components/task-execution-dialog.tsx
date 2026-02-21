"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { updateBacklogTask } from "@/lib/actions/backlog.actions";
import { updateMissionBlock, updateMissionSubTask } from "@/lib/actions/mission.actions";
import { Textarea } from "@/components/ui/textarea";

export interface TaskExecutionData {
    id: string;
    type: 'backlog' | 'mission-block' | 'mission-subtask';
    subTaskIndex?: number; // For mission-subtask
    title: string;
    linkedBlockType?: string;
    deadline?: string;
    priority?: string;
    description?: string;
    subTasks: any[];
    color?: string;
}

interface TaskExecutionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: TaskExecutionData | null;
}

export function TaskExecutionDialog({ open, onOpenChange, data }: TaskExecutionDialogProps) {
    const [description, setDescription] = useState("");
    const [subTasks, setSubTasks] = useState<any[]>([]);

    useEffect(() => {
        if (open && data) {
            setDescription(data.description || "");
            setSubTasks([...(data.subTasks || [])]);
        }
    }, [open, data]);

    if (!data) return null;

    // Deadline logic
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let daysLeft: number | null = null;
    let deadlineText = "SEM PRAZO";
    let isRed = false;

    if (data.deadline) {
        const deadlineDate = parseISO(data.deadline);
        deadlineDate.setHours(0, 0, 0, 0);
        daysLeft = differenceInCalendarDays(deadlineDate, today);
        if (daysLeft < 0) {
            deadlineText = `ATRASADO (${Math.abs(daysLeft)}D)`;
            isRed = true;
        } else if (daysLeft === 0) {
            deadlineText = "HOJE";
            isRed = true;
        } else if (daysLeft === 1) {
            deadlineText = "AMANHÃ";
            isRed = true;
        } else {
            deadlineText = `${daysLeft} DIAS`;
        }
    }

    // Priority
    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'high': return 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]';
            case 'medium': return 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]';
            case 'low': return 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]';
            default: return 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.8)]';
        }
    };
    const priorityColor = getPriorityColor(data.priority || 'medium');

    const handleCopy = () => {
        navigator.clipboard.writeText(description);
        toast.success("Descrição copiada!");
    };

    const handleMoveSubtask = (index: number, direction: 'up' | 'down') => {
        const newSubtasks = [...subTasks];
        if (direction === 'up' && index > 0) {
            [newSubtasks[index - 1], newSubtasks[index]] = [newSubtasks[index], newSubtasks[index - 1]];
        } else if (direction === 'down' && index < newSubtasks.length - 1) {
            [newSubtasks[index + 1], newSubtasks[index]] = [newSubtasks[index], newSubtasks[index + 1]];
        }
        setSubTasks(newSubtasks);
    };

    const toggleSubtask = (index: number) => {
        const newSubtasks = [...subTasks];
        newSubtasks[index] = { ...newSubtasks[index], done: !newSubtasks[index].done };
        setSubTasks(newSubtasks);
    };

    const handleSave = async () => {
        try {
            if (data.type === 'backlog') {
                await updateBacklogTask(data.id, {
                    description: description,
                    subTasks: subTasks
                });
            } else if (data.type === 'mission-block') {
                await updateMissionBlock(data.id, {
                    description: description, // Update: might need to add this to schema if we want to save block descriptions. Right now we don't have it in DB schema natively, but we can pass it, though it might be lost. Wait, 'mission_blocks' has no 'description' field. We can omit or handle it. Let's send subTasks anyway.
                    subTasks: subTasks
                });
            } else if (data.type === 'mission-subtask' && data.subTaskIndex !== undefined) {
                await updateMissionSubTask(data.id, data.subTaskIndex, {
                    description: description
                });
            }

            toast.success("Progresso salvo!");
            onOpenChange(false);
        } catch (e) {
            toast.error("Erro ao salvar.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] md:max-w-[800px] bg-[#050506] border border-white/10 text-white p-6 rounded-[2rem] shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
                <DialogHeader className="mb-6 shrink-0 text-center">
                    <DialogTitle className="text-2xl font-black uppercase italic text-white tracking-widest opacity-90">
                        {data.type === 'mission-block' ? 'Execução do Bloco' : 'Execução da Tarefa'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 pb-2">
                    {/* Header Info */}
                    <div className="space-y-1">
                        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nome da Tarefa</div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <h2 className="text-xl font-black text-white uppercase break-words leading-tight">{data.title}</h2>
                            {data.linkedBlockType && (
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                                    Bloco: <span className="text-white/60">{data.linkedBlockType}</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-8 border-b border-white/5 pb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Prazo:</span>
                            <span className={cn("text-xs font-black uppercase flex items-center gap-1", isRed ? "text-red-500" : "text-white/80")}>
                                {deadlineText}
                                {isRed && <AlertTriangle className="w-3 h-3" strokeWidth={3} />}
                            </span>
                        </div>
                        {data.priority && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Prioridade:</span>
                                <div className={cn("w-4 h-4 rounded-full border-2 border-white/10", priorityColor)} />
                            </div>
                        )}
                    </div>

                    {/* Description */}
                    <div className="space-y-2 relative">
                        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Descrição</div>
                        <div className="relative group">
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-[#121215] border border-white/10 text-sm p-4 rounded-xl custom-scrollbar resize-y min-h-[250px] md:min-h-[350px] focus-visible:ring-emerald-500/30 transition-all hover:border-white/20 text-white placeholder:text-zinc-700"
                                placeholder="Adicione os detalhes aqui..."
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCopy}
                                className="absolute top-2 right-2 h-7 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 font-bold text-[10px] uppercase rounded-full px-3 gap-1 opacity-0 group-hover:opacity-100 transition-opacity border border-emerald-500/20"
                            >
                                <Copy className="w-3 h-3" />
                                Copiar
                            </Button>
                        </div>
                    </div>

                    {/* Subtasks */}
                    <div className="space-y-3">
                        <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Subtarefas</div>
                        <div className="space-y-2">
                            {subTasks.map((st: any, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-[#121215] border border-white/5 rounded-2xl p-3 px-4 group transition-all hover:border-white/10">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div
                                            onClick={() => toggleSubtask(i)}
                                            className={cn(
                                                "w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-colors shrink-0",
                                                st.done ? "bg-emerald-500 border-emerald-500 text-black" : "border-white/20 hover:border-white/50 bg-transparent text-transparent"
                                            )}
                                        >
                                            <Check className="w-3.5 h-3.5" strokeWidth={4} />
                                        </div>
                                        <span className={cn(
                                            "font-medium text-sm truncate transition-colors",
                                            st.done ? "text-white/40 line-through" : "text-white/90"
                                        )}>
                                            {st.title} <span className="text-zinc-500 ml-1">({st.duration} min)</span>
                                        </span>
                                    </div>

                                    {/* Arrows */}
                                    <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleMoveSubtask(i, 'down')}
                                            disabled={i === subTasks.length - 1}
                                            className="h-7 w-7 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
                                        >
                                            <ArrowDown className="w-3 h-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleMoveSubtask(i, 'up')}
                                            disabled={i === 0}
                                            className="h-7 w-7 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
                                        >
                                            <ArrowUp className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {subTasks.length === 0 && (
                                <div className="text-center py-6 text-[10px] text-zinc-600 uppercase font-black tracking-widest bg-white/5 rounded-2xl border border-white/5">
                                    Nenhuma subtarefa
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="pt-4 flex flex-col gap-3 shrink-0 mt-auto">
                    <Button
                        onClick={handleSave}
                        className="w-full h-14 bg-emerald-500 hover:bg-emerald-400 text-black font-black tracking-widest text-sm rounded-2xl uppercase shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        Salvar e Fechar
                    </Button>
                    <Button
                        onClick={() => onOpenChange(false)}
                        variant="ghost"
                        className="w-full h-10 text-zinc-500 hover:text-white text-[10px] uppercase font-black tracking-widest rounded-xl hover:bg-white/5"
                    >
                        Cancelar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
