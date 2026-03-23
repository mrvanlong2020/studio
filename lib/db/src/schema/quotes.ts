import { pgTable, serial, text, timestamp, integer, numeric, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  title: text("title").notNull(),
  items: jsonb("items").notNull().default([]),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  finalAmount: numeric("final_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  validUntil: date("valid_until"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
