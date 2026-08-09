const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL + '/';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        console.log("Checking columns of whatsapp_sessions...");
        // Query pg_attribute or information_schema through RPC or SQL if possible.
        // Or we can just try to insert a large payload to see if it fails.
        const largePayload = { test: "a".repeat(100 * 1024) }; // 100KB
        console.log("Testing upsert with 100KB payload...");
        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .upsert(
                { session_id: 'test_session_id', key_name: 'test_large_key', key_value: largePayload },
                { onConflict: 'session_id, key_name' }
            );
        if (error) {
            console.error("Upsert failed with error:", error);
        } else {
            console.log("Upsert succeeded!");
        }
    } catch (e) {
        console.error("Exception:", e);
    }
}

run();
