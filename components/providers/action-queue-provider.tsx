"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export type ActionType = "DELETE_BLOCK" | "EDIT_BLOCK";

interface QueuedAction {
    id: string;
    type: ActionType;
    data?: any;
}

interface ActionQueueContextType {
    enqueue: (type: ActionType, itemId: string, optimisticData: any, serverAction: () => Promise<{ error?: string, success?: boolean }>) => void;
    deleteQueue: Set<string>;
    editQueue: Record<string, any>;
}

const ActionQueueContext = createContext<ActionQueueContextType | undefined>(undefined);

export function ActionQueueProvider({ children }: { children: React.ReactNode }) {
    const [deleteQueue, setDeleteQueue] = useState<Set<string>>(new Set());
    const [editQueue, setEditQueue] = useState<Record<string, any>>({});
    const router = useRouter();

    // Armazena os timeouts para poder limpá-los caso o usuário desfaça
    const timeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

    const enqueue = useCallback((type: ActionType, itemId: string, optimisticData: any, serverAction: () => Promise<{ error?: string, success?: boolean }>) => {
        // 1. Aplica o Update Otimista Imediato
        if (type === "DELETE_BLOCK") {
            setDeleteQueue(prev => {
                const newSet = new Set(prev);
                newSet.add(itemId);
                return newSet;
            });
        } else if (type === "EDIT_BLOCK") {
            setEditQueue(prev => ({
                ...prev,
                [itemId]: optimisticData
            }));
        }

        let isUndone = false;
        let actionMessage = type === "DELETE_BLOCK" ? "Bloco deletado" : "Bloco atualizado";

        // 2. Dispara a notificação com suporte ao botão de desfazer
        const toastId = toast.success(actionMessage, {
            action: {
                label: "Desfazer",
                onClick: () => {
                    isUndone = true;
                    // Limpa fila otimista
                    if (type === "DELETE_BLOCK") {
                        setDeleteQueue(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(itemId);
                            return newSet;
                        });
                    } else if (type === "EDIT_BLOCK") {
                        setEditQueue(prev => {
                            const copy = { ...prev };
                            delete copy[itemId];
                            return copy;
                        });
                    }
                    if (timeoutsRef.current[`${type}-${itemId}`]) {
                        clearTimeout(timeoutsRef.current[`${type}-${itemId}`]);
                        delete timeoutsRef.current[`${type}-${itemId}`];
                    }
                    toast.success("Ação desfeita!");
                }
            },
            duration: 5000 // 5 segundos de fresta
        });

        // 3. Executa a Ação Real no Servidor após 5 segundos
        const timeoutId = setTimeout(async () => {
            if (!isUndone) {
                // Note: Quando a serverAction terminar, a UI reprocessará do Servidor graças ao revalidatePath.
                // Contudo, removemos da fila otimista local para permitir que os dados da API assumam.
                if (type === "DELETE_BLOCK") {
                    setDeleteQueue(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(itemId);
                        return newSet;
                    });
                } else if (type === "EDIT_BLOCK") {
                    setEditQueue(prev => {
                        const copy = { ...prev };
                        delete copy[itemId];
                        return copy;
                    });
                }

                const res = await serverAction();
                if (res?.error) {
                    toast.error(`Falha: ${res.error}`);
                }
            }
        }, 5000);

        timeoutsRef.current[`${type}-${itemId}`] = timeoutId;

    }, [router]);

    return (
        <ActionQueueContext.Provider value={{ enqueue, deleteQueue, editQueue }}>
            {children}
        </ActionQueueContext.Provider>
    );
}

export function useActionQueue() {
    const context = useContext(ActionQueueContext);
    if (context === undefined) {
        throw new Error("useActionQueue must be used within an ActionQueueProvider");
    }
    return context;
}
