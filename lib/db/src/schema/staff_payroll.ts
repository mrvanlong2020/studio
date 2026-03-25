import { pgTable, serial, text, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./tasks";
import { bookingsTable } from "./bookings";

// ─── Default salary rates per service × role ─────────────────────────────────
// serviceKey = free-text service name OR "default" for fallback
export const staffSalaryRatesTable = pgTable("staff_salary_rates", {
  id: serial("id").primaryKey(),
  serviceKey: text("service_key").notNull(),
  serviceName: text("service_name").notNull(),
  role: text("role").notNull(),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Per-staff overrides (individual rate different from default) ──────────────
export const staffSalaryOverridesTable = pgTable("staff_salary_overrides", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  serviceKey: text("service_key").notNull(),
  role: text("role").notNull(),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Per-job earnings (auto-generated when booking → completed) ───────────────
export const staffJobEarningsTable = pgTable("staff_job_earnings", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  serviceKey: text("service_key").notNull().default(""),
  serviceName: text("service_name").notNull().default(""),
  rate: numeric("rate", { precision: 12, scale: 2 }).notNull().default("0"),
  earnedDate: date("earned_date").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── KPI configuration ────────────────────────────────────────────────────────
export const staffKpiConfigTable = pgTable("staff_kpi_config", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").references(() => staffTable.id, { onDelete: "cascade" }),
  metric: text("metric").notNull().default("jobs_count"),
  targetValue: numeric("target_value", { precision: 12, scale: 2 }).notNull().default("0"),
  bonusAmount: numeric("bonus_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  period: text("period").notNull().default("monthly"),
  isActive: integer("is_active").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSalaryRateSchema = createInsertSchema(staffSalaryRatesTable).omit({ id: true, createdAt: true });
export type InsertSalaryRate = z.infer<typeof insertSalaryRateSchema>;
export type SalaryRate = typeof staffSalaryRatesTable.$inferSelect;

export const insertJobEarningSchema = createInsertSchema(staffJobEarningsTable).omit({ id: true, createdAt: true });
export type InsertJobEarning = z.infer<typeof insertJobEarningSchema>;
export type JobEarning = typeof staffJobEarningsTable.$inferSelect;
