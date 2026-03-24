import { pgTable, serial, text, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("operational"),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  paymentMethod: text("payment_method").notNull().default("cash"),
  expenseDate: date("expense_date").notNull(),
  receiptUrl: text("receipt_url"),
  createdBy: text("created_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
