import { pgTable, text, timestamp, integer, uuid, jsonb, boolean } from 'drizzle-orm/pg-core';

// 1. TABELA DE UTILIZADORES (Sincronizada via Webhook do Clerk ou Login)
export const users = pgTable('users', {
    id: text('id').primaryKey(), // ID vindo diretamente do Clerk (user_id)
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. TABELA DE BLOCOS DE MISSÃO (A unidade principal da Timeline)
export const missionBlocks = pgTable('mission_blocks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(), // Ex: "Foco Profundo", "Treino Tático"

    date: text('date').notNull(), // Formato: YYYY-MM-DD (Facilita a filtragem por dia)
    startTime: text('start_time').notNull(), // Formato: HH:mm

    color: text('color').default('#3b82f6'), // Cor do tema do bloco

    // Guardamos as sub-tarefas como um objeto JSON estruturado
    // Ex: [ { "task": "Codar API", "duration": 45, "done": false } ]
    subTasks: jsonb('sub_tasks').notNull().default([]),

    totalDuration: integer('total_duration').notNull(), // Soma total em minutos
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. TABELA DE BACKLOG (Tarefas em Espera)
export const backlogTasks = pgTable('backlog_tasks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),

    priority: text('priority').default('media'), // 'baixa' | 'media' | 'alta'
    estimatedDuration: integer('estimated_duration').default(30),

    // Opcional: Vincula a tarefa a um tipo de bloco (ex: só sugerir em blocos de "Estudo")
    linkedBlockType: text('linked_block_type'),

    status: text('status').default('pending'), // 'pending' | 'completed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. TABELA DE CARDS TÁTICOS (O Deck de Poder)
export const tacticalCards = pgTable('tactical_cards', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull(), // Ex: "fa-bolt"
    color: text('color').notNull(),

    totalCharges: integer('total_charges').default(3),
    usedCharges: integer('used_charges').default(0),

    effect: text('effect'), // O bónus que o card dá
    penalty: text('penalty'), // O custo/sacrifício
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
