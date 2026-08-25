import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import { createClient } from '@supabase/supabase-js';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('indicacoes').select('*');
  console.log("error:", error);
  console.log("data size:", data ? data.length : 0);
  console.log("data:", JSON.stringify(data, null, 2));
}

run();
