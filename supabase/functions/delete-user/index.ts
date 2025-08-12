// /functions/delete-user/index.ts
import { serve } from "std/http";
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Vytvoříme speciálního "admin" klienta, který má práva mazat uživatele
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Získáme informace o uživateli, který poslal požadavek
    const { data: { user } } = await supabase.auth.getUser(req.headers.get('Authorization')!.replace('Bearer ', ''));

    if (!user) throw new Error("Uživatel nenalezen.");

    // Smažeme uživatele pomocí admin klienta
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (error) throw error;

    return new Response(JSON.stringify({ message: "Účet úspěšně smazán." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});