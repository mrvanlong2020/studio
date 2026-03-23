import { pgTable, serial, text, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { bookingsTable } from "./bookings";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  role: text("role").notNull().default("assistant"),
  email: text("email"),
  salary: text("salary"),
  joinDate: date("join_date").notNull(),
  isActive: integer("is_active").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: integer("assignee_id").references(() => staffTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("todo"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

export const insertStaffSchema = createInsertSchema(staffTable).omit({ id: true, createdAt: true });
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type StaffMember = typeof staffTable.$inferSelect;
