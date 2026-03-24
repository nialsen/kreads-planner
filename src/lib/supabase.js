import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
