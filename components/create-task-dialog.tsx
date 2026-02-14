"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createBacklogTask, updateBacklogTask, BacklogTask } from "@/lib/actions/backlog.actions";
import { getUniqueBlockTypes } from "@/lib/actions/mission.actions";
import { useState, useEffect } from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea"
import { BLOCK_ICONS } from "./constants";

const subtaskSchema = z.object({
    title: z.string().min(1, "Nome necessário"),
    duration: z.coerce.number().min(1, "Mínimo 1 min"),
});

const formSchema = z.object({
    title: z.string().min(2, "Título deve ter pelo menos 2 caracteres."),
    linkedBlockType: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']),
    estimatedDuration: z.coerce.number().min(5, "Duração mínima 5min"),
    subTasks: z.array(subtaskSchema).default([]),
});

interface CreateTaskDialogProps {
    availableBlockTypes?: { label: string, color: string, icon?: string }[];
    taskToEdit?: BacklogTask;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
    defaultLinkedBlockType?: string;
}

export function CreateTaskDialog({ availableBlockTypes = [], taskToEdit, open: controlledOpen, onOpenChange: setControlledOpen, trigger, defaultLinkedBlockType }: CreateTaskDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [fetchedBlockTypes, setFetchedBlockTypes] = useState(availableBlockTypes);
    const [showDescription, setShowDescription] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? setControlledOpen! : setInternalOpen;
    const isEditing = !!taskToEdit;

    // Schema with array for subtasks if we go with structured
    const detailedSchema = z.object({
        title: z.string().min(2, "Título necessário"),
        linkedBlockType: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']),
        estimatedDuration: z.coerce.number().min(5, "Mínimo 5 min"),
        deadline: z.string().optional(),
        description: z.string().optional(),
        subTasks: z.array(subtaskSchema).default([]),
    });

    const form = useForm<z.infer<typeof detailedSchema>>({
        resolver: zodResolver(detailedSchema) as any,
        defaultValues: {
            title: taskToEdit?.title || "",
            linkedBlockType: taskToEdit?.linkedBlockType || defaultLinkedBlockType || "none",
            priority: (taskToEdit?.priority as 'low' | 'medium' | 'high') || "medium",
            estimatedDuration: taskToEdit?.estimatedDuration || 30,
            deadline: taskToEdit?.deadline || "",
            description: taskToEdit?.description || "",
            subTasks: (taskToEdit?.subTasks as any[]) || [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "subTasks",
    });

    useEffect(() => {
        if (open) {
            form.reset({
                title: taskToEdit?.title || "",
                linkedBlockType: taskToEdit?.linkedBlockType || defaultLinkedBlockType || "none",
                priority: (taskToEdit?.priority as 'low' | 'medium' | 'high') || "medium",
                estimatedDuration: taskToEdit?.estimatedDuration || 30,
                deadline: taskToEdit?.deadline || "",
                description: taskToEdit?.description || "",
                subTasks: (taskToEdit?.subTasks as any[]) || [],
            });
            setShowDescription(!!taskToEdit?.description);

            // Refresh block types on open to ensure we have the latest
            getUniqueBlockTypes().then((types) => {
                setFetchedBlockTypes(types);
            });
        }
    }, [open, taskToEdit, form, defaultLinkedBlockType]);

    async function onSubmit(values: z.infer<typeof detailedSchema>, keepOpen: boolean = false) {
        // Find selected color
        const selectedBlock = fetchedBlockTypes.find(b => b.label === values.linkedBlockType);
        const color = selectedBlock ? selectedBlock.color : '#27272a'; // Default gray

        let res;
        if (isEditing && taskToEdit) {
            res = await updateBacklogTask(taskToEdit.id, {
                title: values.title,
                priority: values.priority,
                estimatedDuration: values.estimatedDuration,
                linkedBlockType: values.linkedBlockType === "none" ? undefined : values.linkedBlockType,
                color: color,
                subTasks: values.subTasks,
                description: values.description,
                deadline: values.deadline,
            })
        } else {
            res = await createBacklogTask({
                title: values.title,
                priority: values.priority,
                estimatedDuration: values.estimatedDuration,
                linkedBlockType: values.linkedBlockType === "none" ? undefined : values.linkedBlockType,
                color: color,
                subTasks: values.subTasks,
                description: values.description,
                deadline: values.deadline,
            });
        }

        if (res?.success) {
            if (!keepOpen) {
                setOpen(false);
            } else {
                form.reset({
                    title: "",
                    linkedBlockType: values.linkedBlockType || "none", // Keeps the current block type
                    priority: "medium",
                    estimatedDuration: 30,
                    deadline: "",
                    description: "",
                    subTasks: [],
                });
                setShowDescription(false);
            }
            toast.success(isEditing ? "Tarefa atualizada!" : "Tarefa criada!");
        } else {
            toast.error("Erro ao salvar tarefa");
        }
    }

    const PRIORITIES = [
        { value: 'low', color: 'bg-emerald-500', label: 'Baixa' },
        { value: 'medium', color: 'bg-amber-500', label: 'Média' },
        { value: 'high', color: 'bg-red-500', label: 'Alta' },
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : (
                !isControlled && (
                    <DialogTrigger asChild>
                        <div className="bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black uppercase text-xs h-9 px-6 w-fit flex items-center justify-center rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:scale-105 active:scale-95 cursor-pointer">
                            + Nova Tarefa
                        </div>
                    </DialogTrigger>
                )
            )}
            <DialogContent className="sm:max-w-[400px] bg-[#050506] border border-white/10 text-white gap-0 rounded-[2rem] p-6">
                <div className="space-y-1 mb-6 text-center">
                    <DialogTitle className="text-xl font-black uppercase text-white italic">
                        {isEditing ? "Editar Tarefa" : "Nova Tarefa"}
                    </DialogTitle>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit((v) => onSubmit(v, false))} className="space-y-5">

                        {/* Nome */}
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Nome da Tarefa</FormLabel>
                                    <FormControl>
                                        <Input {...field} className="bg-white/5 border-white/10 h-12 rounded-xl text-sm" placeholder="..." />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Bloco Selection */}
                        <div className="flex gap-4">
                            {/* Bloco Selection */}
                            <FormField
                                control={form.control}
                                name="linkedBlockType"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Vincular a Bloco</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="bg-white/5 border-white/10 h-10 rounded-xl text-xs w-full">
                                                    <SelectValue placeholder="Selecione..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="bg-[#050506] border-white/10 text-white max-h-[200px]">
                                                <SelectItem value="none" className="text-zinc-500 italic">Nenhum (Geral)</SelectItem>
                                                {fetchedBlockTypes.map((block) => {
                                                    const Icon = BLOCK_ICONS.find(i => i.name === block.icon)?.icon || Zap;
                                                    return (
                                                        <SelectItem key={block.label} value={block.label} className="focus:bg-white/10">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: block.color }} />
                                                                <Icon className="w-3 h-3 text-zinc-300" />
                                                                <span>{block.label}</span>
                                                            </div>
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Prazo (Opcional) */}
                            <FormField
                                control={form.control}
                                name="deadline"
                                render={({ field }) => (
                                    <FormItem className="w-32">
                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Prazo (Opcional)</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="date"
                                                {...field}
                                                className="bg-white/5 border-white/10 h-10 rounded-xl text-xs text-center uppercase"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="flex gap-4">
                            {/* Duração */}
                            <FormField
                                control={form.control}
                                name="estimatedDuration"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Duração (Min)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-white/5 border-white/10 h-10 rounded-xl text-center font-mono" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Prioridade */}
                            <FormField
                                control={form.control}
                                name="priority"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1 mb-2 block">Prioridade</FormLabel>
                                        <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10 h-10 items-center px-2">
                                            {PRIORITIES.map((p) => (
                                                <div
                                                    key={p.value}
                                                    onClick={() => field.onChange(p.value)}
                                                    className={cn(
                                                        "w-6 h-6 rounded-full cursor-pointer transition-all border-2",
                                                        p.color,
                                                        field.value === p.value ? "border-white scale-110 shadow-lg" : "border-transparent opacity-30 hover:opacity-100"
                                                    )}
                                                    title={p.label}
                                                />
                                            ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Description Field */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Descrição</FormLabel>
                                {(!showDescription && !form.getValues("description")) && (
                                    <Button
                                        type="button"
                                        onClick={() => setShowDescription(true)}
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 text-[10px] text-emerald-500 hover:text-emerald-400 px-0"
                                    >
                                        + Adicionar
                                    </Button>
                                )}
                            </div>
                            {(showDescription || form.getValues("description")) && (
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <Textarea
                                            {...field}
                                            placeholder="Detalhes da tarefa..."
                                            className="bg-white/5 border-white/10 rounded-xl text-xs custom-scrollbar resize-none min-h-[60px]"
                                            rows={3}
                                        />
                                    )}
                                />
                            )}
                        </div>

                        {/* Subtarefas */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Subtarefas</FormLabel>
                                <Button
                                    type="button"
                                    onClick={() => append({ title: "", duration: 15 })}
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 text-[10px] text-emerald-500 hover:text-emerald-400 px-0"
                                >
                                    + Adicionar
                                </Button>
                            </div>
                            <div className="space-y-2 max-h-[100px] overflow-y-auto custom-scrollbar pr-1">
                                {fields.map((field, index) => (
                                    <div key={field.id} className="flex gap-2 items-center">
                                        <FormField
                                            control={form.control}
                                            name={`subTasks.${index}.title`}
                                            render={({ field }) => (
                                                <Input {...field} placeholder="Subtarefa..." className="flex-1 bg-white/5 border-white/5 h-8 rounded-lg text-xs" />
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name={`subTasks.${index}.duration`}
                                            render={({ field }) => (
                                                <Input {...field} type="number" placeholder="m" className="w-12 bg-white/5 border-white/5 h-8 rounded-lg text-xs font-mono text-center" />
                                            )}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => remove(index)}
                                            className="h-8 w-6 text-zinc-600 hover:text-red-500"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>




                        <div className="pt-2 flex flex-col gap-2">
                            <Button type="button" onClick={form.handleSubmit((v) => onSubmit(v, !isEditing))} className="w-full h-12 bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black tracking-widest text-sm rounded-xl uppercase">
                                Salvar
                            </Button>

                            <Button type="button" onClick={() => setOpen(false)} variant="ghost" className="w-full h-8 text-zinc-500 hover:text-white text-[10px] uppercase">
                                Cancelar
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

