import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!
);

async function main() {
  // Test if tables already exist
  const tables = ["memory_associations", "memory_queries", "dream_insights"];
  const results: Record<string, string> = {};

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(0);
    if (error) {
      results[table] = "MISSING";
    } else {
      results[table] = "EXISTS";
    }
  }

  console.log("Table status:", results);

  const allExist = Object.values(results).every((v) => v === "EXISTS");
  if (allExist) {
    console.log("All soul tables already exist. Nothing to do.");
    return;
  }

  console.log("\nSome tables are missing. Run this SQL in Supabase Dashboard:");
  console.log("https://supabase.com/dashboard/project/ptlneqcjsnrxxruutsxm/sql/new");
  console.log("\nSQL file: dashboard/scripts/setup-db-soul.sql");
}

main().catch(console.error);
