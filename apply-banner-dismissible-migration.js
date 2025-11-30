// Temporary script to apply the banner dismissible, timeout, and color migration
// Run this with: node apply-banner-dismissible-migration.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';

if (!supabaseUrl.startsWith('http') || !supabaseServiceKey.startsWith('eyJ')) {
  console.error('\n❌ Error: Missing Supabase credentials!');
  console.error('\nPlease set the following environment variables:');
  console.error('  VITE_SUPABASE_URL=your_supabase_url');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  console.error('\nOr edit this file and replace YOUR_SUPABASE_URL and YOUR_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🚀 Applying banner dismissible, timeout, and color migration...\n');

  const settings = [
    {
      key: 'banner_dismissible',
      value: 'false',
      description: 'Allow users to dismiss the banner with an X button'
    },
    {
      key: 'banner_timeout',
      value: '0',
      description: 'Auto-hide banner after N seconds (0 = no timeout)'
    },
    {
      key: 'banner_color',
      value: '#00f0ff',
      description: 'Background color for the admin banner (hex color code)'
    }
  ];

  for (const setting of settings) {
    console.log(`Inserting setting: ${setting.key}...`);

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert(setting, { onConflict: 'key' })
      .select();

    if (error) {
      console.error(`❌ Error inserting ${setting.key}:`, error.message);
    } else {
      console.log(`✅ Successfully inserted ${setting.key}`);
    }
  }

  console.log('\n✨ Migration complete! The banner dismissible, timeout, and color features are now ready to use.');
  console.log('Go to /admin and click the "Banner" tab to configure it.\n');
}

applyMigration().catch(console.error);
