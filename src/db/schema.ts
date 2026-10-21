import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
});

export const userinfo = pgTable('userinfo', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipcode: text('zipcode'),
  userId: integer('userid').notNull().unique().references(() => users.id),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserInfo = typeof userinfo.$inferSelect;
export type NewUserInfo = typeof userinfo.$inferInsert;
