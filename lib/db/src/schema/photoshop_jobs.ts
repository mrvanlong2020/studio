import { pgTable, serial, integer, text, timestamp, boolean, real } from "drizzle-orm/pg-core";

export const photoshopJobsTable = pgTable("photoshop_jobs", {
  id: serial("id").primaryKey(),
  jobCode: text("job_code").notNull(),
  bookingId: integer("booking_id"),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").default(""),
  serviceName: text("service_name").default(""),
  assignedStaffId: integer("assigned_staff_id"),
  assignedStaffName: text("assigned_staff_name").default(""),
  shootDate: text("shoot_date").default(""),
  receivedFileDate: text("received_file_date").default(""),
  internalDeadline: text("internal_deadline").default(""),
  customerDeadline: text("customer_deadline").default(""),
  status: text("status").notNull().default("chua_nhan"),
  progressPercent: real("progress_percent").notNull().default(0),
  totalPhotos: integer("total_photos").default(0),
  donePhotos: integer("done_photos").default(0),
  notes: text("notes").default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
