#!/usr/bin/env node
// test-arena.js - Injects a test command to trigger arena visualization

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from bridge .env
const envPath = join(__dirname, '../bridge/.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
);

const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const TEST_MESSAGE = process.argv[2] || 
  "Arena test: Run a quick system health check and report CPU, memory, and disk usage";

const TARGET_AGENT = process.argv[3] || 'main';

async function injectCommand() {
  console.log(`🔥 Injecting test command to ${TARGET_AGENT}...`);
  console.log(`Message: ${TEST_MESSAGE}`);
  
  const { data, error } = await supabase
    .from('agent_commands')
    .insert({
      agent_id: TARGET_AGENT,
      message: TEST_MESSAGE,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`✅ Command injected! ID: ${data.id}`);
  console.log(`🎮 Watch the arena at http://localhost:3000/arena`);
  console.log(`⏳ You should see:`);
  console.log(`   1. OPERATOR node pulse a command to ${TARGET_AGENT.toUpperCase()}`);
  console.log(`   2. ${TARGET_AGENT.toUpperCase()} node go BUSY (spinning ring + streaming particles)`);
  console.log(`   3. Completion burst when done`);
  
  // Poll for status updates
  let lastStatus = 'pending';
  const pollInterval = setInterval(async () => {
    const { data: cmd } = await supabase
      .from('agent_commands')
      .select('status, response')
      .eq('id', data.id)
      .single();
    
    if (cmd && cmd.status !== lastStatus) {
      lastStatus = cmd.status;
      console.log(`📊 Status update: ${cmd.status}`);
      if (cmd.status === 'completed' || cmd.status === 'failed') {
        console.log(`✨ Arena animation complete!`);
        if (cmd.response) {
          console.log(`📄 Response preview: ${cmd.response.slice(0, 100)}...`);
        }
        clearInterval(pollInterval);
        process.exit(0);
      }
    }
  }, 500);

  // Timeout after 30 seconds
  setTimeout(() => {
    clearInterval(pollInterval);
    console.log('⏱️ Timeout - check arena manually');
    process.exit(0);
  }, 30000);
}

injectCommand();
