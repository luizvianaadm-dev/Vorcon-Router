const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('session_id, key_name');

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Sessions:", data);
  }
}
run();
