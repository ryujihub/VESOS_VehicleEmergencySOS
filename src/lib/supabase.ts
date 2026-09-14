import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iacbdhwtoqjmjnktva.supabase.co'
const supabaseAnonKey = 'sb_publishable_QZQgf9LBDCyuYtcihXMQdw_XhP8Drt4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)