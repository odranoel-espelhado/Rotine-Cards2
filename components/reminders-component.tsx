"use client";

import { useState, useEffect } from "react";
import { Plus, Settings, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReminderType, createReminderAction, deleteReminderAction, getRemindersAction, getAllRemindersAction, decreaseReminderChargeAction } from "@/lib/actions/reminders.actions";
import { ScrollArea } from "@/components/ui/scroll-area";

const reminderSchema = z.object({
    title: z.string().min(1, "O título é obrigatório."),
    color: z.string().min(1, "A cor é obrigatória."),
    targetDate: z.string().min(1, "A data é obrigatória."),
    description: z.string().optional(),
    repeatPattern: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly', 'workdays', 'monthly_on', 'custom']).default('none'),
    occurrencesLimit: z.number().optional(),
    charges: z.number().optional(),
    weekdays: z.array(z.number()).optional(),
    monthlyDays: z.array(z.number()).optional(),
    monthlyNth: z.object({
        nth: z.number(),
        weekday: z.number()
    }).nullable().optional(),
    time: z.string().optional(),
    notifications: z.array(z.number()).default([]),
});

const NOTIFICATION_OPTIONS = [
    { label: "No horário (0min)", value: 0 },
    { label: "5min antes", value: 5 },
    { label: "15min antes", value: 15 },
    { label: "30min antes", value: 30 },
    { label: "1 hora antes", value: 60 },
    { label: "2 horas antes", value: 120 },
    { label: "1 dia antes", value: 1440 },
    { label: "7 dias antes", value: 10080 },
];

const DEFAULT_COLORS = [
    { label: 'Azul', value: '#3b82f6' },
    { label: 'Verde', value: '#10b981' },
    { label: 'Vermelho', value: '#ef4444' },
    { label: 'Amarelo', value: '#eab308' },
    { label: 'Roxo', value: '#a855f7' },
    { label: 'Cinza', value: '#52525b' },
];

const DAYS_OF_WEEK = [
    { label: 'Segunda-feira', value: 1 },
    { label: 'Terça-feira', value: 2 },
    { label: 'Quarta-feira', value: 3 },
    { label: 'Quinta-feira', value: 4 },
    { label: 'Sexta-feira', value: 5 },
    { label: 'Sábado', value: 6 },
    { label: 'Domingo', value: 0 },
];

const NTH_OPTIONS = [
    { label: '1º', value: 1 },
    { label: '2º', value: 2 },
    { label: '3º', value: 3 },
    { label: '4º', value: 4 },
    { label: 'Último', value: -1 },
];

export function RemindersComponent({ currentDate }: { currentDate: string }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [reminders, setReminders] = useState<ReminderType[]>([]);
    const [allReminders, setAllReminders] = useState<ReminderType[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [monthlyTab, setMonthlyTab] = useState<'weekdays' | 'days'>('weekdays');

    const loadReminders = async () => {
        const todayReminders = await getRemindersAction(currentDate);
        setReminders(todayReminders);
    };

    const loadAllReminders = async () => {
        const all = await getAllRemindersAction();
        setAllReminders(all);
    };

    useEffect(() => {
        loadReminders();
        loadAllReminders();
    }, [currentDate]);

    const form = useForm<z.infer<typeof reminderSchema>>({
        resolver: zodResolver(reminderSchema) as any,
        defaultValues: {
            title: "",
            color: "#3b82f6",
            description: "",
            targetDate: currentDate,
            repeatPattern: "none",
            weekdays: [],
            monthlyDays: [],
            monthlyNth: { nth: 1, weekday: 1 },
            time: "09:00",
            notifications: [],
        },
    });

    useEffect(() => {
        if (isCreateOpen) {
            form.reset({
                title: "",
                color: "#3b82f6",
                description: "",
                targetDate: currentDate,
                repeatPattern: "none",
                weekdays: [],
                monthlyDays: [],
                monthlyNth: { nth: 1, weekday: 1 },
                time: "09:00",
                notifications: [],
            });
        }
    }, [isCreateOpen, currentDate, form]);

    const onSubmit = async (values: z.infer<typeof reminderSchema> | any) => {
        const payload = {
            ...values,
            description: values.description || "",
        };

        if (payload.repeatPattern === "monthly_on") {
            if (monthlyTab === 'weekdays') {
                payload.monthlyDays = []; // Just use Nth
            } else {
                payload.monthlyNth = null; // Just use days array
            }
        }

        const res = await createReminderAction(payload);

        if (res.success) {
            toast.success("Lembrete criado com sucesso!");
            form.reset();
            setIsCreateOpen(false);
            loadReminders();
            loadAllReminders();
        } else {
            toast.error("Erro ao criar lembrete.");
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Deletar este lembrete?")) {
            await deleteReminderAction(id);
            toast.success("Lembrete removido!");
            loadReminders();
            loadAllReminders();
        }
    };

    const handleDecreaseCharge = async (id: string) => {
        await decreaseReminderChargeAction(id);
        loadReminders();
        loadAllReminders();
    };

    return (
        <div className="flex flex-col border-b border-white/5 bg-[#050506]">
            {/* Header Lembretes */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                    )}
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider select-none">Lembretes</h2>
                    {reminders.length > 0 && (
                        <Badge variant="outline" className="text-zinc-500 border-white/10">{reminders.length}</Badge>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Botão + Novo Lembrete */}
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <div className="bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black uppercase text-xs h-8 px-4 w-fit flex items-center justify-center rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:scale-105 active:scale-95 cursor-pointer">
                                <Plus className="w-3 h-3 mr-1" /> Novo Lembrete
                            </div>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px] bg-[#050506] border border-white/10 text-white gap-0 rounded-[2rem] p-6">
                            <DialogTitle className="text-xl font-black uppercase text-white italic text-center mb-6">
                                Novo Lembrete
                            </DialogTitle>

                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Título</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-white/5 border-white/10 h-10 rounded-xl text-sm" placeholder="Ex: Beber água" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Descrição</FormLabel>
                                                <FormControl>
                                                    <Textarea {...field} className="bg-white/5 border-white/10 rounded-xl text-xs resize-none" placeholder="Detalhes (opcional)..." rows={2} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex gap-4">
                                        <FormField
                                            control={form.control}
                                            name="color"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1 block mb-2">Cor de Fundo</FormLabel>
                                                    <div className="flex flex-wrap gap-2">
                                                        {DEFAULT_COLORS.map(c => (
                                                            <div
                                                                key={c.value}
                                                                onClick={() => field.onChange(c.value)}
                                                                style={{ backgroundColor: c.value }}
                                                                className={cn(
                                                                    "w-6 h-6 rounded-full cursor-pointer transition-all border-2",
                                                                    field.value === c.value ? "border-white scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"
                                                                )}
                                                                title={c.label}
                                                            />
                                                        ))}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="targetDate"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Data</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="date"
                                                            {...field}
                                                            className="bg-white/5 border-white/10 h-10 rounded-xl text-xs uppercase"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="repeatPattern"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Repetir</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-white/5 border-white/10 h-10 rounded-xl text-xs w-full">
                                                            <SelectValue placeholder="Selecione..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-[#050506] border-white/10 text-white">
                                                        <SelectItem value="none">Sem repetição</SelectItem>
                                                        <SelectItem value="daily">Todo dia</SelectItem>
                                                        <SelectItem value="weekly">Toda semana</SelectItem>
                                                        <SelectItem value="monthly">Todo mês</SelectItem>
                                                        <SelectItem value="yearly">Todo ano</SelectItem>
                                                        <SelectItem value="workdays">Dias selecionados</SelectItem>
                                                        <SelectItem value="monthly_on">Mensal no(a)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {form.watch("repeatPattern") === "workdays" && (
                                        <FormField
                                            control={form.control}
                                            name="weekdays"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Dias da Semana</FormLabel>
                                                    <div className="space-y-1 mt-2 bg-white/5 border border-white/10 rounded-xl p-3">
                                                        {DAYS_OF_WEEK.map(day => {
                                                            const isSelected = field.value?.includes(day.value);
                                                            return (
                                                                <div
                                                                    key={day.value}
                                                                    className="flex items-center justify-between cursor-pointer group py-1"
                                                                    onClick={() => {
                                                                        const current = field.value || [];
                                                                        const next = isSelected ? current.filter(v => v !== day.value) : [...current, day.value];
                                                                        field.onChange(next);
                                                                    }}
                                                                >
                                                                    <span className={cn("text-xs font-medium transition-colors", isSelected ? "text-white" : "text-zinc-500 group-hover:text-zinc-300")}>{day.label}</span>
                                                                    <div className={cn("w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors", isSelected ? "border-emerald-500 bg-emerald-500" : "border-white/20 hover:border-white/40")}>
                                                                        {isSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 4L3.5 6.5L9 1" stroke="#050506" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {form.watch("repeatPattern") === "monthly_on" && (
                                        <div className="space-y-4 mt-2 bg-white/5 border border-white/10 rounded-xl p-3">
                                            {/* Tabs Dias da Semana vs 1-31 dias */}
                                            <div className="flex bg-black/40 rounded-lg p-1">
                                                <button
                                                    type="button"
                                                    className={cn("flex-1 text-[10px] font-bold uppercase py-1.5 rounded-md transition-colors", monthlyTab === 'weekdays' ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
                                                    onClick={() => setMonthlyTab('weekdays')}
                                                >
                                                    Dias da Semana
                                                </button>
                                                <button
                                                    type="button"
                                                    className={cn("flex-1 text-[10px] font-bold uppercase py-1.5 rounded-md transition-colors", monthlyTab === 'days' ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")}
                                                    onClick={() => setMonthlyTab('days')}
                                                >
                                                    1-31 dias
                                                </button>
                                            </div>

                                            {monthlyTab === 'weekdays' && (
                                                <FormField
                                                    control={form.control}
                                                    name="monthlyNth"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs text-zinc-400">A cada</span>
                                                                <div className="flex-1">
                                                                    <Select
                                                                        value={field.value?.nth?.toString() || "1"}
                                                                        onValueChange={(val) => field.onChange({ ...field.value, weekday: field.value?.weekday || 1, nth: parseInt(val) })}
                                                                    >
                                                                        <SelectTrigger className="bg-black/40 border-white/10 h-8 rounded-lg text-xs">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent className="bg-[#050506] border-white/10 text-white">
                                                                            {NTH_OPTIONS.map(opt => (
                                                                                <SelectItem key={opt.value} value={opt.value.toString()}>{opt.label}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                                <div className="flex-[1.5]">
                                                                    <Select
                                                                        value={field.value?.weekday?.toString() || "1"}
                                                                        onValueChange={(val) => field.onChange({ ...field.value, nth: field.value?.nth || 1, weekday: parseInt(val) })}
                                                                    >
                                                                        <SelectTrigger className="bg-black/40 border-white/10 h-8 rounded-lg text-xs">
                                                                            <SelectValue />
                                                                        </SelectTrigger>
                                                                        <SelectContent className="bg-[#050506] border-white/10 text-white">
                                                                            {DAYS_OF_WEEK.map(day => (
                                                                                <SelectItem key={day.value} value={day.value.toString()}>{day.label.toLowerCase()}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                </div>
                                                            </div>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            )}

                                            {monthlyTab === 'days' && (
                                                <FormField
                                                    control={form.control}
                                                    name="monthlyDays"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <div className="grid grid-cols-7 gap-1 mt-2">
                                                                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                                                                    const isSelected = field.value?.includes(day);
                                                                    return (
                                                                        <div
                                                                            key={day}
                                                                            onClick={() => {
                                                                                const current = field.value || [];
                                                                                const next = isSelected ? current.filter(d => d !== day) : [...current, day];
                                                                                field.onChange(next);
                                                                            }}
                                                                            className={cn("aspect-square flex items-center justify-center text-[10px] sm:text-xs font-medium cursor-pointer rounded-md transition-colors", isSelected ? "bg-[#3b82f6] text-white font-bold" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200")}
                                                                        >
                                                                            {day}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            )}
                                        </div>
                                    )}
                                    {/* Configurações de Tempo e Notificação */}
                                    <div className="flex flex-col gap-4 mt-2">
                                        <div className="flex gap-4">
                                            {/* Hora */}
                                            <div className="flex flex-col gap-2 flex-1">
                                                <FormField
                                                    control={form.control}
                                                    name="time"
                                                    render={({ field }) => (
                                                        <FormItem className="flex-1">
                                                            <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1 block whitespace-nowrap">Hora</FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    type="time"
                                                                    {...field}
                                                                    className="bg-white/5 border-white/10 h-10 rounded-xl text-sm justify-center w-full"
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            {/* Notificações */}
                                            <div className="flex flex-col gap-2 flex-[2]">
                                                <FormField
                                                    control={form.control}
                                                    name="notifications"
                                                    render={({ field }) => {
                                                        const notes = field.value || [];
                                                        return (
                                                            <FormItem className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1 flex-1">
                                                                        Notificações
                                                                    </FormLabel>
                                                                    {notes.length > 0 && notes.length < 3 && (
                                                                        <Button
                                                                            type="button"
                                                                            onClick={() => field.onChange([...notes, 15])}
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="h-6 text-[10px] text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 font-bold uppercase"
                                                                        >
                                                                            + Adicionar
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {notes.length === 0 && (
                                                                        <div className="flex gap-2 items-center">
                                                                            <Select
                                                                                onValueChange={(val) => {
                                                                                    if (val !== "none") field.onChange([Number(val)]);
                                                                                }}
                                                                                value="none"
                                                                            >
                                                                                <FormControl>
                                                                                    <SelectTrigger className="bg-white/5 border-white/10 h-10 rounded-xl text-xs w-full">
                                                                                        <SelectValue placeholder="Sem Notificação" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent className="bg-[#050506] border-white/10 text-white">
                                                                                    <SelectItem value="none">Sem Notificação</SelectItem>
                                                                                    {NOTIFICATION_OPTIONS.map((opt) => (
                                                                                        <SelectItem key={opt.value} value={opt.value.toString()}>
                                                                                            {opt.label}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                    )}

                                                                    {notes.map((notif, index) => (
                                                                        <div key={index} className="flex gap-2 items-center">
                                                                            <Select
                                                                                onValueChange={(val) => {
                                                                                    const current = [...notes];
                                                                                    if (val === "none") {
                                                                                        current.splice(index, 1);
                                                                                    } else {
                                                                                        current[index] = Number(val);
                                                                                    }
                                                                                    field.onChange(current);
                                                                                }}
                                                                                value={notif.toString()}
                                                                            >
                                                                                <FormControl>
                                                                                    <SelectTrigger className="bg-white/5 border-white/10 h-10 rounded-xl text-xs w-full">
                                                                                        <SelectValue placeholder="Selecione..." />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent className="bg-[#050506] border-white/10 text-white">
                                                                                    <SelectItem value="none">Remover</SelectItem>
                                                                                    {NOTIFICATION_OPTIONS.map((opt) => (
                                                                                        <SelectItem key={opt.value} value={opt.value.toString()}>
                                                                                            {opt.label}
                                                                                        </SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <FormMessage />
                                                            </FormItem>
                                                        );
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Toggle Avançado */}
                                    <div
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="flex items-center gap-1 cursor-pointer text-[10px] font-black text-zinc-500 uppercase ml-1 hover:text-zinc-300 transition-colors select-none w-fit"
                                    >
                                        <span>Avançado</span>
                                        {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </div>

                                    {showAdvanced && (
                                        <div className="flex gap-4 pt-1 pb-2">
                                            <FormField
                                                control={form.control}
                                                name="occurrencesLimit"
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1 block whitespace-nowrap">Ocorrências</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                {...field}
                                                                value={field.value || ''}
                                                                onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                                                className="bg-white/5 border-white/10 h-10 rounded-xl text-sm text-center"
                                                                placeholder="Nº"
                                                                min="1"
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="charges"
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1 block whitespace-nowrap">Cargas</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                {...field}
                                                                value={field.value || ''}
                                                                onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                                                className="bg-white/5 border-white/10 h-10 rounded-xl text-sm text-center"
                                                                placeholder="Nº"
                                                                min="1"
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>
                                    )}

                                    <div className="pt-4 flex flex-col gap-2">
                                        <Button type="submit" className="w-full h-11 bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black tracking-widest text-sm rounded-xl uppercase">
                                            Salvar Lembrete
                                        </Button>
                                        <Button type="button" onClick={() => setIsCreateOpen(false)} variant="ghost" className="w-full h-8 text-zinc-500 hover:text-white text-[10px] uppercase">
                                            Cancelar
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>

                    {/* Botão Engrenagem (Configurações / Lembretes Gerais) */}
                    <Dialog open={isSettingsOpen} onOpenChange={(open) => {
                        setIsSettingsOpen(open);
                        if (open) loadAllReminders();
                    }}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg">
                                <Settings className="w-4 h-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[450px] bg-[#050506] border border-white/10 text-white gap-0 rounded-[2rem] p-6">
                            <DialogTitle className="text-xl font-black uppercase text-white italic text-center mb-6">
                                Configurações de Lembretes
                            </DialogTitle>

                            <ScrollArea className="max-h-[300px] w-full pr-4 custom-scrollbar">
                                {allReminders.length === 0 && (
                                    <div className="text-center py-8 text-zinc-600 text-xs">
                                        Nenhum lembrete configurado no geral.
                                    </div>
                                )}
                                <div className="space-y-3">
                                    {allReminders.map(rem => (
                                        <div key={rem.id} className="p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rem.color }} />
                                                    <span className="font-bold text-sm text-zinc-200">{rem.title}</span>
                                                </div>
                                                <div className="text-xs text-zinc-500 mt-1 pl-4">
                                                    Alvo: <span className="text-zinc-400">{rem.targetDate}</span> | Repetição: <span className="text-zinc-400">{rem.repeatPattern}</span>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-500 hover:bg-white/5 rounded-lg shrink-0" onClick={() => handleDelete(rem.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Corpo / Lista de Lembretes do Relatório */}
            <div className={cn("transition-all duration-300 overflow-hidden", isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
                <div className="p-4 flex gap-3 overflow-x-auto custom-scrollbar">
                    {reminders.length === 0 ? (
                        <div className="text-center py-4 w-full text-zinc-600 text-[11px] uppercase tracking-widest font-bold opacity-50">
                            Nenhum lembrete para hoje
                        </div>
                    ) : (
                        reminders.map(rem => (
                            <div
                                key={rem.id}
                                style={{ backgroundColor: rem.color + '20', borderColor: rem.charges === 0 ? '#10b981' : rem.color + '40' }}
                                className={cn(
                                    "shrink-0 w-[200px] min-h-[4.5rem] p-3 rounded-2xl border flex flex-col justify-center relative overflow-hidden group",
                                    rem.charges === 0 ? "shadow-[0_0_15px_rgba(16,185,129,0.4)]" : ""
                                )}
                            >
                                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-3 h-3 text-white/50 hover:text-red-400 cursor-pointer" onClick={() => handleDelete(rem.id)} />
                                </div>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rem.color, boxShadow: `0 0 8px ${rem.color}` }} />
                                    <span className="font-black text-sm text-white/90 truncate pr-4">{rem.title}</span>
                                </div>
                                {rem.description && (
                                    <p className="text-[10px] text-white/60 line-clamp-2 leading-relaxed ml-3.5">
                                        {rem.description}
                                    </p>
                                )}
                                {rem.charges !== undefined && rem.charges !== null && rem.charges > 0 && (
                                    <div
                                        onClick={(e) => { e.stopPropagation(); handleDecreaseCharge(rem.id); }}
                                        className="absolute bottom-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full cursor-pointer transition-all active:scale-95 border border-white/10 flex items-center shadow-lg hover:text-primary z-10"
                                        title="Reduzir carga"
                                    >
                                        <span>{rem.charges}x</span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div >
    );
}
