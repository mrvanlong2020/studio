import { pgTable, serial, text, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { staffTable } from "./tasks";
import { bookingsTable } from "./bookings";

// ─── Nhật ký chấm công ────────────────────────────────────────────────────────
// type: check_in | check_out
// method: qr | offsite | manual
export const attendanceLogsTable = pgTable("attendance_logs", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("check_in"),
  method: text("method").notNull().default("qr"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  accuracyM: numeric("accuracy_m", { precision: 8, scale: 2 }),
  distanceM: numeric("distance_m", { precision: 8, scale: 2 }),
  bookingId: integer("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Quy tắc chấm công ────────────────────────────────────────────────────────
export const attendanceRulesTable = pgTable("attendance_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Mặc định"),
  checkInFrom: text("check_in_from").notNull().default("07:30"),
  checkInTo: text("check_in_to").notNull().default("09:00"),
  weeklyOnTimeBonus: numeric("weekly_on_time_bonus", { precision: 12, scale: 2 }).notNull().default("50000"),
  isActive: integer("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Quy tắc phạt đi muộn ─────────────────────────────────────────────────────
// lateFromTime / lateToTime: HH:mm format, e.g. "08:05"
// lateToTime = null means "from lateFromTime and beyond"
export const attendanceLateRulesTable = pgTable("attendance_late_rules", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => attendanceRulesTable.id, { onDelete: "cascade" }),
  lateFromTime: text("late_from_time").notNull().default("08:00"),
  lateToTime: text("late_to_time"),
  penaltyAmount: numeric("penalty_amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Điều chỉnh thủ công ──────────────────────────────────────────────────────
// type: bonus | penalty | manual
export const attendanceAdjustmentsTable = pgTable("attendance_adjustments", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull().default("bonus"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  reason: text("reason"),
  createdBy: integer("created_by").references(() => staffTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAttendanceLogSchema = createInsertSchema(attendanceLogsTable).omit({ id: true, createdAt: true });
export type InsertAttendanceLog = z.infer<typeof insertAttendanceLogSchema>;
export type AttendanceLog = typeof attendanceLogsTable.$inferSelect;

export const insertAttendanceRuleSchema = createInsertSchema(attendanceRulesTable).omit({ id: true, createdAt: true });
export type InsertAttendanceRule = z.infer<typeof insertAttendanceRuleSchema>;
export type AttendanceRule = typeof attendanceRulesTable.$inferSelect;
