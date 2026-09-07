import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MEAL_IMAGES_BUCKET = 'meal_images';

async function deleteUserMealImages(
  admin: ReturnType<typeof createClient>,
  userId: string
) {
  const { data: files, error } = await admin.storage
    .from(MEAL_IMAGES_BUCKET)
    .list(userId, { limit: 1000 });

  if (error || !files?.length) {
    return;
  }

  const paths = files
    .map((file) => file.name)
    .filter((name): name is string => Boolean(name))
    .map((name) => `${userId}/${name}`);

  if (paths.length > 0) {
    await admin.storage.from(MEAL_IMAGES_BUCKET).remove(paths);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  await admin.from('meal_logs').delete().eq('user_id', user.id);
  await admin.from('profiles').delete().eq('id', user.id);
  await deleteUserMealImages(admin, user.id);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
