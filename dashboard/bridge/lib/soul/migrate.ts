import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY!
);

async function main() {
  // Supabase JS can't run DDL directly, so we create tables through
  // individual insert-and-check pattern. But first, let's check if
  // we have a Supabase CLI or can use the management API.

  // Alternative: use the Supabase management API with personal access token
  // For now, let's check if Supabase CLI is available
  console.log("Checking if supabase CLI is available...");

  const tables = ["memory_associations", "memory_queries", "dream_insights"];

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(0);
    if (error) {
      console.log(`${table}: MISSING`);
    } else {
      console.log(`${table}: OK`);
    }
  }
}

main();
