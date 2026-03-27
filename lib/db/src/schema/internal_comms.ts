import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  recipientStaffId: integer("recipient_staff_id"),
  senderStaffId: integer("sender_staff_id"),
  type: text("type").notNull().default("info"),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  linkType: text("link_type").default(""),
  linkId: integer("link_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messageRoomsTable = pgTable("message_rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("group"),
  linkType: text("link_type").default(""),
  linkId: integer("link_id"),
  createdByStaffId: integer("created_by_staff_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const roomMembersTable = pgTable("room_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  staffId: integer("staff_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
  lastReadAt: timestamp("last_read_at").defaultNow(),
});

export const internalMessagesTable = pgTable("internal_messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull(),
  senderStaffId: integer("sender_staff_id"),
  senderName: text("sender_name").notNull().default("Hệ thống"),
  content: text("content").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
