import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const crmLeadsTable = pgTable("crm_leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  message: text("message"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  source: text("source").default("facebook"),
  status: text("status").default("new"),
  type: text("type").default("unknown"),
  channel: text("channel").default("inbox"),
  facebookUserId: text("facebook_user_id").unique(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCrmLeadSchema = createInsertSchema(crmLeadsTable).omit({ id: true, createdAt: true });
export type NewCrmLead = z.infer<typeof insertCrmLeadSchema>;
export type CrmLead = typeof crmLeadsTable.$inferSelect;
