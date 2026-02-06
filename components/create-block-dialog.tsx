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
import { Checkbox } from "@/components/ui/checkbox";
import { createMissionBlock, getUniqueBlockTypes } from "@/lib/actions/mission.actions";
import { useState, useEffect } from "react";
import { Plus, Trash2, Clock, Calendar, Zap, Target, Heart, Book, Briefcase, Dumbbell, Coffee, User, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Icons Configuration
const BLOCK_ICONS = [
    { name: 'zap', icon: Zap },
    { name: 'target', icon: Target },
    { name: 'heart', icon: Heart },
    { name: 'dumbbell', icon: Dumbbell },
    { name: 'book', icon: Book },
    { name: 'briefcase', icon: Briefcase },
    { name: 'coffee', icon: Coffee },
    { name: 'user', icon: User },
];

// Zod Schema
const subtaskSchema = z.object({
    title: z.string().min(1, "Nome necessário"),
    duration: z.coerce.number().min(1, "Mínimo 1 min"),
});

const formSchema = z.object({
    title: z.string().min(2, { message: "Título deve ter pelo menos 2 caracteres." }),
    color: z.string().default("#3b82f6"),
    icon: z.string().default("zap"),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: "Formato inválido." }),
    totalDuration: z.coerce.number().min(5, { message: "Duração mínima de 5 minutos." }),
    subTasks: z.array(subtaskSchema).default([]),
    isRecurring: z.boolean().default(false),
    replicateWeekdays: z.boolean().default(false),
});

import { updateMissionBlock, MissionBlock } from "@/lib/actions/mission.actions";

interface MissionBlockDialogProps {
    currentDate: string;
    blockToEdit?: MissionBlock;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
    defaultStartTime?: string;
    defaultDuration?: number;
}

export function CreateBlockDialog({
    currentDate,
    blockToEdit,
    open: controlledOpen,
    onOpenChange: setControlledOpen,
    trigger,
    defaultStartTime,
    defaultDuration
}: MissionBlockDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [availableTypes, setAvailableTypes] = useState<{ label: string; icon: string; color: string; value: string }[]>([]);
    const [filteredSuggestions, setFilteredSuggestions] = useState<{ label: string; icon: string; color: string; value: string }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

    const isEditing = !!blockToEdit;

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            title: blockToEdit?.title || "",
            color: blockToEdit?.color || "#0ea5e9",
            icon: blockToEdit?.icon || "zap",
            startTime: blockToEdit?.startTime || defaultStartTime || "08:00",
            totalDuration: blockToEdit?.totalDuration || defaultDuration || 30,
            subTasks: (blockToEdit?.subTasks as any[])?.map((s: any) => ({ title: s.title, duration: parseInt(s.duration) })) || [],
            isRecurring: blockToEdit?.type === 'recurring',
            replicateWeekdays: blockToEdit?.recurrencePattern === 'weekdays',
        },
    });

    // Reset form when dialog opens or blockToEdit changes
    useEffect(() => {
        if (open) {
            form.reset({
                title: blockToEdit?.title || "",
                color: blockToEdit?.color || "#0ea5e9",
                icon: blockToEdit?.icon || "zap",
                startTime: blockToEdit?.startTime || defaultStartTime || "08:00",
                totalDuration: blockToEdit?.totalDuration || defaultDuration || 30,
                subTasks: (blockToEdit?.subTasks as any[])?.map((s: any) => ({ title: s.title, duration: parseInt(s.duration) })) || [],
                isRecurring: blockToEdit?.type === 'recurring',
                replicateWeekdays: blockToEdit?.recurrencePattern === 'weekdays',
            });

            // Fetch suggestions
            getUniqueBlockTypes().then(setAvailableTypes);
        }
    }, [open, blockToEdit, form, defaultStartTime, defaultDuration]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "subTasks",
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        // Normalize title for internal storage if we had a separate column, but logic implies we just save it.
        // User said: "Saving a block, system must convert name to lowercase... (internally). And leave Front as user desires."
        // We will respect the input title for display. The 'normalization' is handled by getUniqueBlockTypes for searching.

        let res;
        const payload = {
            title: values.title, // Keep display title
            startTime: values.startTime,
            totalDuration: values.totalDuration,
            color: values.color,
            icon: values.icon,
            date: currentDate,
            subTasks: values.subTasks.map(s => ({ ...s, done: false })),
            type: values.isRecurring ? 'recurring' as const : 'unique' as const,
            recurrencePattern: values.replicateWeekdays ? 'weekdays' as const : undefined,
        };

        if (isEditing && blockToEdit) {
            res = await updateMissionBlock(blockToEdit.id, payload);
        } else {
            res = await createMissionBlock(payload);
        }

        if (res?.success) {
            setOpen(false);
            toast.success(isEditing ? "Missão atualizada!" : "Missão criada com sucesso!");
        } else {
            toast.error(res?.error || "Erro ao salvar bloco");
        }
    }

    const handleTitleChange = (val: string) => {
        const normalized = val.trim().toLowerCase();
        if (!normalized) {
            setFilteredSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const matches = availableTypes.filter(t =>
            t.value.toLowerCase().includes(normalized)
        );
        setFilteredSuggestions(matches);
        setShowSuggestions(matches.length > 0);
    };

    const applySuggestion = (suggestion: typeof availableTypes[0]) => {
        form.setValue("title", suggestion.label);
        form.setValue("icon", suggestion.icon);
        form.setValue("color", suggestion.color);
        setShowSuggestions(false);
    };

    const COLORS = [
        { hex: '#0ea5e9', class: 'bg-cyan-500' },
        { hex: '#ef4444', class: 'bg-red-500' },
        { hex: '#f59e0b', class: 'bg-amber-500' },
        { hex: '#8b5cf6', class: 'bg-violet-500' },
        { hex: '#10b981', class: 'bg-emerald-500' },
        { hex: '#ec4899', class: 'bg-pink-500' },   // New
        { hex: '#f97316', class: 'bg-orange-500' }, // New
        { hex: '#6366f1', class: 'bg-indigo-500' }, // New
    ];

    const isRecurring = form.watch("isRecurring");

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="sm:max-w-[480px] bg-[#050506] border border-white/10 text-white p-0 overflow-hidden gap-0 rounded-[2rem]">
                <div className="p-8 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">

                    <div className="text-center space-y-1 mb-2">
                        <DialogTitle className="text-2xl font-black uppercase text-emerald-500 italic">
                            {isEditing ? "Editar Missão" : "Nova Missão"}
                        </DialogTitle>
                        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Protocolo de {isEditing ? "Edição" : "Criação"}</p>
                    </div>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                            {/* Nome com Autocomplete */}
                            <FormField
                                control={form.control}
                                name="title"
                                render={({ field }) => (
                                    <FormItem className="relative">
                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Nome do Bloco</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input
                                                    placeholder="Ex: Treino, Estudo..."
                                                    {...field}
                                                    onChange={(e) => {
                                                        field.onChange(e);
                                                        handleTitleChange(e.target.value);
                                                    }}
                                                    onFocus={() => handleTitleChange(field.value)}
                                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                                    autoComplete="off"
                                                    className="bg-white/5 border-white/10 h-14 rounded-2xl text-lg font-bold text-white placeholder:text-zinc-700 focus-visible:ring-primary/50"
                                                />
                                                {/* Suggestions Dropdown */}
                                                {showSuggestions && (
                                                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#18181b] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                                                        <div className="text-[9px] uppercase font-bold text-zinc-500 px-3 py-2 bg-white/5">Sugestões (Evitar Duplicidade)</div>
                                                        {filteredSuggestions.map((suggestion, idx) => {
                                                            const Icon = BLOCK_ICONS.find(i => i.name === suggestion.icon)?.icon || Zap;
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    onClick={() => applySuggestion(suggestion)}
                                                                    className="flex items-center gap-3 p-3 hover:bg-white/10 cursor-pointer transition-colors"
                                                                >
                                                                    <div
                                                                        className="w-6 h-6 rounded-md flex items-center justify-center text-white"
                                                                        style={{ backgroundColor: suggestion.color }}
                                                                    >
                                                                        <Icon className="w-3 h-3" />
                                                                    </div>
                                                                    <span className="text-sm font-bold text-white">{suggestion.label}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Ícone Grid */}
                            <FormField
                                control={form.control}
                                name="icon"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Ícone</FormLabel>
                                        <div className="grid grid-cols-4 gap-2">
                                            {BLOCK_ICONS.map((item) => (
                                                <div
                                                    key={item.name}
                                                    onClick={() => field.onChange(item.name)}
                                                    className={cn(
                                                        "h-12 rounded-xl flex items-center justify-center cursor-pointer border transition-all hover:bg-white/5",
                                                        field.value === item.name
                                                            ? "bg-white/10 border-primary text-primary shadow-[0_0_10px_-2px_var(--primary)]"
                                                            : "bg-white/5 border-transparent text-zinc-500"
                                                    )}
                                                >
                                                    <item.icon className="w-5 h-5" />
                                                </div>
                                            ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Cor */}
                            <FormField
                                control={form.control}
                                name="color"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Cor do Card</FormLabel>
                                        <div className="flex flex-wrap gap-3">
                                            {COLORS.map(c => (
                                                <div
                                                    key={c.hex}
                                                    onClick={() => field.onChange(c.hex)}
                                                    className={cn(
                                                        "w-10 h-10 rounded-xl cursor-pointer transition-all border-2",
                                                        c.class,
                                                        field.value === c.hex ? "border-white scale-110 shadow-lg" : "border-transparent opacity-60 hover:opacity-100 hover:scale-105"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Tempo */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="startTime"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Início</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input type="time" {...field} className="bg-white/5 border-white/10 h-14 rounded-2xl text-white font-mono font-bold focus-visible:ring-primary/50" />
                                                    <Clock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none" />
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="totalDuration"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Duração (Min)</FormLabel>
                                            <FormControl>
                                                <Input type="number" {...field} className="bg-white/5 border-white/10 h-14 rounded-2xl text-white font-mono font-bold focus-visible:ring-primary/50" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Subtarefas */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Tarefas</FormLabel>
                                    <Button
                                        type="button"
                                        onClick={() => append({ title: "", duration: 15 })}
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-[10px] text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 font-bold uppercase"
                                    >
                                        + Adicionar
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-[150px] overflow-y-auto custom-scrollbar pr-2">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="flex gap-2 items-center animate-in fade-in slide-in-from-top-2 duration-200">
                                            <FormField
                                                control={form.control}
                                                name={`subTasks.${index}.title`}
                                                render={({ field }) => (
                                                    <Input {...field} placeholder="Nome da subtarefa..." className="flex-1 bg-white/5 border-white/5 h-10 rounded-lg text-xs" />
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`subTasks.${index}.duration`}
                                                render={({ field }) => (
                                                    <Input {...field} type="number" placeholder="Min" className="w-16 bg-white/5 border-white/5 h-10 rounded-lg text-xs font-mono text-center" />
                                                )}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => remove(index)}
                                                className="h-10 w-8 text-zinc-600 hover:text-red-500 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    {fields.length === 0 && (
                                        <div className="text-center py-4 bg-white/5 rounded-xl border border-dashed border-white/10">
                                            <p className="text-[10px] text-zinc-600 uppercase font-bold">Nenhuma subtarefa</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Mode Toggle */}
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="isRecurring"
                                    render={({ field }) => (
                                        <>
                                            <div
                                                className={cn(
                                                    "h-14 rounded-2xl flex items-center justify-center gap-3 cursor-pointer border transition-all",
                                                    !field.value ? "bg-white/5 border-primary/50 text-white shadow-[0_0_15px_-5px_#3b82f6]" : "bg-transparent border-white/5 text-zinc-600 hover:bg-white/5"
                                                )}
                                                onClick={() => field.onChange(false)}
                                            >
                                                <div className={cn("w-3 h-3 rounded-full transition-colors", !field.value ? "bg-red-500" : "bg-zinc-700")} />
                                                <span className="text-xs font-black uppercase">Única</span>
                                            </div>
                                            <div
                                                className={cn(
                                                    "h-14 rounded-2xl flex items-center justify-center gap-3 cursor-pointer border transition-all",
                                                    field.value ? "bg-white/5 border-emerald-500/50 text-white shadow-[0_0_15px_-5px_#10b981]" : "bg-transparent border-white/5 text-zinc-600 hover:bg-white/5"
                                                )}
                                                onClick={() => field.onChange(true)}
                                            >
                                                <div className={cn("w-3 h-3 rounded-full transition-colors", field.value ? "bg-emerald-500" : "bg-zinc-700")} />
                                                <span className="text-xs font-black uppercase">Recorrente</span>
                                            </div>
                                        </>
                                    )}
                                />
                            </div>

                            {/* Replicate Checkbox - Only visible if Recurring */}
                            {isRecurring && (
                                <FormField
                                    control={form.control}
                                    name="replicateWeekdays"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-xl border border-white/5 p-4 bg-white/5 animate-in slide-in-from-top-2">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    className="data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500 border-white/20"
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel className="text-xs font-bold text-white uppercase">
                                                    Replicar (Seg - Sex)
                                                </FormLabel>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            )}

                            <div className="pt-2 gap-3 flex flex-col">
                                <Button type="submit" className="w-full h-16 bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest text-lg rounded-2xl uppercase shadow-xl transition-all hover:scale-[1.02]">
                                    {isEditing ? "Atualizar" : "Salvar"}
                                </Button>
                                <Button type="button" variant="ghost" className="h-auto py-2 text-[10px] font-black uppercase text-zinc-600 hover:text-zinc-300" onClick={() => setOpen(false)}>
                                    Cancelar
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}

