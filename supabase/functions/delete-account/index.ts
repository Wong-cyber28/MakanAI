import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MEAL_IMAGES_BUCKET = 'meal_images';
const PAGE_SIZE = 100;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function deleteUserMealImages(
  admin: ReturnType<typeof createClient>,
  userId: string
) {
  for (;;) {
    const { data: files, error } = await admin.storage
      .from(MEAL_IMAGES_BUCKET)
      .list(userId, { limit: PAGE_SIZE });

    if (error) {
      throw error;
    }
    if (!files?.length) {
      return;
    }

    const paths = files
      .filter((file) => Boolean(file.name) && Boolean(file.id))
      .map((file) => `${userId}/${file.name}`);

    if (paths.length === 0) {
      return;
    }

    const { error: removeError } = await admin.storage.from(MEAL_IMAGES_BUCKET).remove(paths);
    if (removeError) {
      throw removeError;
    }

    if (files.length < PAGE_SIZE) {
      return;
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await deleteUserMealImages(admin, user.id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return jsonResponse({ error: message }, 500);
  }
});
