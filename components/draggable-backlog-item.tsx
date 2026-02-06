import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BacklogTask } from "@/lib/actions/backlog.actions";
import { useState } from "react";
import { BacklogItemCard } from "./backlog-item-card";

export function DraggableBacklogItem({ task, onDelete, onEdit }: { task: BacklogTask, onDelete: (id: string) => void, onEdit: (task: BacklogTask) => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        data: { type: 'backlog-task', task }
    });

    const [expanded, setExpanded] = useState(false);

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1, // Visual feedback in list
    };

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
            <BacklogItemCard
                task={task}
                isDragging={isDragging}
                expanded={expanded}
                onToggleExpand={() => setExpanded(!expanded)}
                onEdit={onEdit}
                onDelete={onDelete}
            />
        </div>
    );
}
