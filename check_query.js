import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envStr = fs.readFileSync('.env.example', 'utf8');
console.log("envStr", envStr.length);
