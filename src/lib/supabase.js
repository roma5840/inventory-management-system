import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tsrbomktxkdkklfyfnav.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcmJvbWt0eGtka2tsZnlmbmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MTc5NDcsImV4cCI6MjA4NDM5Mzk0N30.hTRAjgWXHIB3OZP-kBxtr6ig8o1dxU82pjPLGPIfAb4'

export const supabase = createClient(supabaseUrl, supabaseKey)