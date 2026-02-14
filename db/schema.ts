import { pgTable, text, timestamp, integer, uuid, jsonb } from 'drizzle-orm/pg-core';

// 1. TABELA DE UTILIZADORES (Sincronizada via Clerk)
// O ID aqui é TEXT para aceitar o formato "user_..." do Clerk
export const users = pgTable('users', {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. TABELA DE BLOCOS DE MISSÃO (Timeline)
export const missionBlocks = pgTable('mission_blocks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    date: text('date').notNull(), // Formato: YYYY-MM-DD
    startTime: text('start_time').notNull(), // Formato: HH:mm
    color: text('color').default('#3b82f6'),

    // Sub-tarefas guardadas como JSON estruturado
    subTasks: jsonb('sub_tasks').notNull().default([]),

    totalDuration: integer('total_duration').notNull(),
    type: text('type').default('unique'), // 'unique' | 'recurring'
    recurrencePattern: text('recurrence_pattern'), // 'weekdays'
    status: text('status').default('pending'), // 'pending' | 'completed'
    icon: text('icon').default('zap'),
    exceptions: jsonb('exceptions').default([]), // List of YYYY-MM-DD strings to skip
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. TABELA DE BACKLOG (Tarefas em Espera)
export const backlogTasks = pgTable('backlog_tasks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    priority: text('priority').default('media'), // 'baixa' | 'media' | 'alta'
    estimatedDuration: integer('estimated_duration').default(30),
    linkedBlockType: text('linked_block_type'),
    status: text('status').default('pending'),
    subTasks: jsonb('sub_tasks').default([]),
    color: text('color').default('#27272a'), // Default gray like zinc-800
    description: text('description'), // Descrição detalhada (opcional)
    deadline: text('deadline'), // Prazo (dd/mm/yyyy or YYYY-MM-DD)
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. TABELA DE CARDS TÁTICOS (Efeitos de Performance)
export const tacticalCards = pgTable('tactical_cards', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    totalCharges: integer('total_charges').default(3),
    usedCharges: integer('used_charges').default(0),
    effect: text('effect'),
    penalty: text('penalty'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});