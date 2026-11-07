import {sql} from 'drizzle-orm';
import { sqliteTable, text, integer, index, primaryKey, foreignKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('card_workspaces', {
  ownerId: text('owner_id').primaryKey(),
  payload: text('payload').notNull(),
  version: integer('version').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
  saveToken: text('save_token'),
});
export const publicViews = sqliteTable('card_public_views', {
 viewKey: text('view_key').primaryKey(),
 ownerId: text('owner_id').notNull(),
 payload: text('payload').notNull(),
}, table=>[index('card_public_views_owner_idx').on(table.ownerId)]);

export const studioOwner = sqliteTable('card_studio_owner', {
 singleton: integer('singleton').primaryKey(),ownerId: text('owner_id').notNull().unique()
});
export const managerAccess = sqliteTable('card_manager_access', {
 id: text('id').primaryKey(),ownerId: text('owner_id').notNull(),email: text('email').notNull(),userId: text('user_id'),enabled: integer('enabled').notNull().default(0),companyIds: text('company_ids').notNull(),permissions: text('permissions').notNull(),revision: integer('revision').notNull().default(1),updatedAt: text('updated_at').notNull()
});

export const companyRecords = sqliteTable('card_company_records', {
 ownerId:text('owner_id').notNull(),id:text('id').notNull(),payload:text('payload').notNull()
},t=>[primaryKey({columns:[t.ownerId,t.id]})]);
export const groupRecords = sqliteTable('card_group_records', {
 ownerId:text('owner_id').notNull(),id:text('id').notNull(),companyId:text('company_id').notNull(),payload:text('payload').notNull()
},t=>[primaryKey({columns:[t.ownerId,t.id]}),foreignKey({columns:[t.ownerId,t.companyId],foreignColumns:[companyRecords.ownerId,companyRecords.id]})]);
export const profileRecords = sqliteTable('card_profile_records', {
 ownerId:text('owner_id').notNull(),id:text('id').notNull(),companyId:text('company_id').notNull(),name:text('name').notNull(),role:text('role').notNull(),email:text('email').notNull(),archived:integer('archived').notNull(),payload:text('payload').notNull()
},t=>[primaryKey({columns:[t.ownerId,t.id]}),foreignKey({columns:[t.ownerId,t.companyId],foreignColumns:[companyRecords.ownerId,companyRecords.id]}),index('card_profile_company_idx').on(t.ownerId,t.companyId,t.archived,t.id)]);
export const projectionVersions=sqliteTable('card_projection_versions',{ownerId:text('owner_id').primaryKey(),version:integer('version').notNull()});
export const personalProfiles=sqliteTable('card_personal_profiles',{
 ownerId:text('owner_id').primaryKey(),id:text('id').notNull().unique(),draft:text('draft').notNull(),live:text('live'),version:integer('version').notNull().default(1),updatedAt:text('updated_at').notNull(),publishedAt:text('published_at'),saveToken:text('save_token').notNull()
});
export const personalLimits=sqliteTable('card_personal_limits',{ownerId:text('owner_id').primaryKey(),window:integer('window').notNull(),requests:integer('requests').notNull()});
export const personalAccess=sqliteTable('card_personal_access',{
 id:text('id').primaryKey(),studioOwnerId:text('studio_owner_id').notNull(),email:text('email').notNull().unique(),userId:text('user_id').unique(),enabled:integer('enabled').notNull().default(1),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull(),mutationToken:text('mutation_token').notNull()
},t=>[index('card_personal_access_owner_idx').on(t.studioOwnerId,t.email)]);

export const workspaceImages=sqliteTable('card_workspace_images',{ownerId:text('owner_id').notNull(),id:text('id').notNull(),dataUri:text('data_uri').notNull()},t=>[primaryKey({columns:[t.ownerId,t.id]})]);

export const companyAccess=sqliteTable('card_company_access',{
 id:text('id').primaryKey(),studioOwnerId:text('studio_owner_id').notNull(),companyId:text('company_id').notNull(),email:text('email').notNull(),userId:text('user_id'),role:text('role').notNull(),profileId:text('profile_id'),groupIds:text('group_ids').notNull(),editableFields:text('editable_fields').notNull(),permissions:text('permissions').notNull(),enabled:integer('enabled').notNull().default(1),revision:integer('revision').notNull().default(1),mutationToken:text('mutation_token').notNull(),updatedAt:text('updated_at').notNull()
},t=>[uniqueIndex('card_company_access_email_unique').on(t.studioOwnerId,t.companyId,t.email),uniqueIndex('card_company_access_user_unique').on(t.studioOwnerId,t.companyId,t.userId),index('card_company_access_email_idx').on(t.email,t.enabled),uniqueIndex('card_company_employee_profile_idx').on(t.studioOwnerId,t.companyId,t.profileId).where(sql`${t.role}='employee' AND ${t.enabled}=1`)]);
