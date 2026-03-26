import { pgTable, serial, text, timestamp, integer, numeric, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  orderCode: text("order_code"),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  shootDate: date("shoot_date").notNull(),
  shootTime: text("shoot_time"),
  serviceCategory: text("service_category").notNull().default("wedding"),
  packageType: text("package_type").notNull(),
  location: text("location"),
  status: text("status").notNull().default("pending"),
  items: jsonb("items").notNull().default([]),
  surcharges: jsonb("surcharges").notNull().default([]),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  depositAmount: numeric("deposit_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  assignedStaff: jsonb("assigned_staff").notNull().default([]),
  internalNotes: text("internal_notes"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
