CREATE TABLE IF NOT EXISTS "games" (
	"id" varchar PRIMARY KEY NOT NULL,
	"player_scores" json DEFAULT '[]'::json NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"played_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"username" varchar PRIMARY KEY NOT NULL,
	"email" varchar NOT NULL,
	"pfp" varchar DEFAULT '',
	"points" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"last_played" timestamp DEFAULT now() NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
