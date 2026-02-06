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
import { createBacklogTask } from "@/lib/actions/backlog.actions";
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea"

const subtaskSchema = z.object({
    title: z.string().min(1, "Nome necessário"),
    duration: z.coerce.number().min(1, "Mínimo 1 min"),
});

const formSchema = z.object({
    title: z.string().min(2, "Título deve ter pelo menos 2 caracteres."),
    linkedBlockType: z.string().optional(), // Or 'color' directly mapped
    priority: z.enum(['low', 'medium', 'high']),
    estimatedDuration: z.coerce.number().min(5, "Duração mínima 5min"),
    subTasks: z.string().optional(), // We'll parse this later: "Uma por linha..." logic requested in image? No, image says "Uma por linha..." but prompt says "pode usar o campo igual ao do bloco". Let's stick to Block style (dynamic list) for better structure, OR "One per line" textarea as image shows. Image shows Textarea "Uma por linha...". Prompt says "pode usar o campo igual ao do bloco". I will follow the PROMPT suggestion to use the Block style (better UX), BUT possibly the user prefers the simple text area. The image shows a textarea. I'll make a textarea that splits by newline for simplicity and speed, matching the image.
    // Wait, prompt says: "3- Subtarefas. (pode usar o campo igual ao do bloco colocando nome da subtarefa e duração)."
    // This implies structured input (Name + Duration). A simple textarea "Uma por linha" usually implies just names. 
    // I will use the Structured List (like blocks) as it allows defining Duration per subtask which is powerful.
});

// For the "Select Block" toggle, we need a list of block "types" or "names". 
// Since we don't have a strict "Block Type" entity, we can just let user pick from a predefined refined list or just "Generic" colors?
// The prompt says: "Seleção de Bloco. Um toogle com os blocos criados sempre deixando preselecionado a opção nenhum."
// This implies fetching existing block titles. 
// I'll accept a prop `availableBlockTypes` which is a list of { label: string, color: string }.

interface CreateTaskDialogProps {
    availableBlockTypes?: { label: string, color: string }[];
}

export function CreateTaskDialog({ availableBlockTypes = [] }: CreateTaskDialogProps) {
    const [open, setOpen] = useState(false);

    // Schema with array for subtasks if we go with structured
    const detailedSchema = z.object({
        title: z.string().min(2, "Título necessário"),
        linkedBlockType: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']),
        estimatedDuration: z.coerce.number().min(5, "Mínimo 5 min"),
        subTasks: z.array(subtaskSchema).default([]),
    });

    const form = useForm<z.infer<typeof detailedSchema>>({
        resolver: zodResolver(detailedSchema) as any,
        defaultValues: {
            title: "",
            linkedBlockType: "none",
            priority: "medium", // Default
            estimatedDuration: 30,
            subTasks: [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "subTasks",
    });

    useEffect(() => {
        if (!open) form.reset();
    }, [open, form]);

    async function onSubmit(values: z.infer<typeof detailedSchema>) {
        // Find selected color
        const selectedBlock = availableBlockTypes.find(b => b.label === values.linkedBlockType);
        const color = selectedBlock ? selectedBlock.color : '#27272a'; // Default gray

        const res = await createBacklogTask({
            title: values.title,
            priority: values.priority,
            estimatedDuration: values.estimatedDuration,
            linkedBlockType: values.linkedBlockType === "none" ? undefined : values.linkedBlockType,
            color: color,
            subTasks: values.subTasks,
        });

        if (res?.success) {
            setOpen(false);
            toast.success("Tarefa criada!");
        } else {
            toast.error("Erro ao criar tarefa");
        }
    }

    const PRIORITIES = [
        { value: 'low', color: 'bg-emerald-500', label: 'Baixa' },
        { value: 'medium', color: 'bg-amber-500', label: 'Média' },
        { value: 'high', color: 'bg-red-500', label: 'Alta' },
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <div className="bg-[#white/5] hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white cursor-pointer h-9 px-3 text-xs w-full flex items-center justify-center rounded-lg transition-all">
                    + Nova Tarefa
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] bg-[#050506] border border-white/10 text-white gap-0 rounded-[2rem] p-6">
                <div className="space-y-1 mb-6 text-center">
                    <DialogTitle className="text-xl font-black uppercase text-white italic">Nova Tarefa</DialogTitle>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

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
                        <FormField
                            control={form.control}
                            name="linkedBlockType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Vincular a Bloco</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="bg-white/5 border-white/10 h-10 rounded-xl text-xs">
                                                <SelectValue placeholder="Selecione..." />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-[#050506] border-white/10 text-white">
                                            <SelectItem value="none" className="text-zinc-500">Nenhum (Geral)</SelectItem>
                                            {availableBlockTypes.map((block) => (
                                                <SelectItem key={block.label} value={block.label} className="focus:bg-white/10">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: block.color }} />
                                                        {block.label}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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


                        <div className="pt-2">
                            <Button type="submit" className="w-full h-12 bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black tracking-widest text-sm rounded-xl uppercase">
                                Salvar
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

