import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), data: text('data').notNull(),
}, t => [index('project_owner').on(t.owner)]);
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, {onDelete:'cascade'}), data: text('data').notNull(),
}, t => [index('activity_owner').on(t.owner), index('activity_project').on(t.projectId)]);
export const inspections = sqliteTable('inspections', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, {onDelete:'cascade'}),
  activityId: text('activity_id').notNull().references(() => activities.id, {onDelete:'cascade'}), data: text('data').notNull(),
}, t => [index('inspection_owner').on(t.owner), index('inspection_activity').on(t.activityId)]);
export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  projectId: text('project_id').notNull().references(() => projects.id, {onDelete:'cascade'}),
  inspectionId: text('inspection_id').notNull().references(() => inspections.id, {onDelete:'cascade'}), data: text('data').notNull(),
}, t => [index('action_owner').on(t.owner), index('action_inspection').on(t.inspectionId)]);
