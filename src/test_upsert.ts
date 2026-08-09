import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.SUPABASE_ANON_KEY!;
console.log("URL:", supabaseUrl);
console.log("Has key:", !!supabaseKey);

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        console.log("Testing Supabase upsert...");
        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .upsert(
                { session_id: 'test_session_id', key_name: 'test_key', key_value: { hello: 'world' } },
                { onConflict: 'session_id, key_name' }
            );
        if (error) {
            console.error("Supabase error:", error);
        } else {
            console.log("Supabase success:", data);
        }
    } catch (e) {
        console.error("Upsert threw exception:", e);
    }
}

run();
