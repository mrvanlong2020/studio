import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const crmLeadsTable = pgTable("crm_leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  message: text("message"),
  source: text("source").default("facebook"),
  status: text("status").default("new"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrmLeadSchema = createInsertSchema(crmLeadsTable).omit({ id: true, createdAt: true });
export type NewCrmLead = z.infer<typeof insertCrmLeadSchema>;
export type CrmLead = typeof crmLeadsTable.$inferSelect;
