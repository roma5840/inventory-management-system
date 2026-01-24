import { createClient } from '@supabase/supabase-js'

// dev
const supabaseUrl = 'https://tsrbomktxkdkklfyfnav.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcmJvbWt0eGtka2tsZnlmbmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MTc5NDcsImV4cCI6MjA4NDM5Mzk0N30.hTRAjgWXHIB3OZP-kBxtr6ig8o1dxU82pjPLGPIfAb4'

// const supabaseUrl = 'https://qaeeziiiyhfmhljpiopr.supabase.co'
// const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhZWV6aWlpeWhmbWhsanBpb3ByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODc5MTAsImV4cCI6MjA4NDc2MzkxMH0.TcE5_VPV59R-GSaTNq70NS1nqbnEzwm2UhGxGOKNkNg'

export const supabase = createClient(supabaseUrl, supabaseKey)