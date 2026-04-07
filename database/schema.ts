import {
  pgTable,
  varchar,
  timestamp,
  integer,
  json,
} from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  username: varchar("username").primaryKey().notNull(),
  email: varchar("email").notNull(),
  pfp: varchar("pfp").default(""),
  points: integer("points").default(0).notNull(),
  level: integer("level").default(0).notNull(),
  last_played: timestamp("last_played").defaultNow().notNull(),
  joined_at: timestamp("joined_at").defaultNow().notNull(),
});

export const games = pgTable("games", {
  id: varchar("id").primaryKey().notNull(),
  player_scores: json("player_scores").default([]).notNull(),
  round: integer("round").default(0).notNull(),
  played_at: timestamp("played_at").defaultNow().notNull(),
});
