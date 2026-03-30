import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  customCode: text("custom_code"),
  name: text("name").notNull(),
  gender: text("gender"),
  phone: text("phone").unique(),
  email: text("email"),
  facebook: text("facebook"),
  zalo: text("zalo"),
  address: text("address"),
  source: text("source").notNull().default("other"),
  tags: jsonb("tags").notNull().default([]),
  avatar: text("avatar"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
