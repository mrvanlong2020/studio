import { pgTable, serial, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dressesTable = pgTable("dresses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  color: text("color").notNull(),
  size: text("size").notNull(),
  style: text("style"),
  rentalPrice: numeric("rental_price", { precision: 12, scale: 2 }).notNull(),
  depositRequired: numeric("deposit_required", { precision: 12, scale: 2 }).notNull(),
  isAvailable: boolean("is_available").notNull().default(true),
  rentalStatus: text("rental_status").notNull().default("san_sang"),
  condition: text("condition").notNull().default("tot"),
  notes: text("notes"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDressSchema = createInsertSchema(dressesTable).omit({ id: true, createdAt: true });
export type InsertDress = z.infer<typeof insertDressSchema>;
export type Dress = typeof dressesTable.$inferSelect;
