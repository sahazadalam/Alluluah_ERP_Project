import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(JSON.stringify({ 
        error: "Server config missing", 
        hasUrl: !!supabaseUrl, 
        hasAnon: !!anonKey, 
        hasService: !!serviceRoleKey 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client to verify the user's profile (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token", details: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch profile", details: profileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can manage users", role: profile?.role }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action;

    if (action === "update_user") {
      const { user_id, email, full_name, username, role, branch_id, is_active } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updatePayload: Record<string, unknown> = {
        email,
        full_name,
        username,
        role,
        branch_id: branch_id || null,
        is_active,
        updated_at: new Date().toISOString(),
      };

      // Remove undefined keys so the update remains clean and safe.
      Object.keys(updatePayload).forEach((key) => {
        if (updatePayload[key] === undefined) delete updatePayload[key];
      });

      const { error: updateErr } = await adminClient.from("profiles").update(updatePayload).eq("id", user_id);
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const { user_id, new_password } = body;

      if (!user_id || !new_password) {
        return new Response(JSON.stringify({ error: "Missing user_id or new_password" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_user") {
      const { email, password, full_name, username, role, branch_id } = body;

      if (!email || !password || !full_name || !username || !role) {
        return new Response(JSON.stringify({ error: "Missing required fields", fields: { email: !!email, password: !!password, full_name: !!full_name, username: !!username, role: !!role } }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, username, role, branch_id: branch_id || null },
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert profile row — the trigger may have already created it
      const { error: profileErr } = await adminClient
        .from("profiles")
        .upsert({
          id: data.user.id,
          email,
          full_name,
          username,
          role,
          branch_id: branch_id || null,
          is_active: true,
        }, { onConflict: "id" });

      if (profileErr) {
        return new Response(JSON.stringify({ error: "User created but profile upsert failed: " + profileErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user_id: data.user.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const { user_id } = body;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Prevent admin from deleting themselves
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetProfile, error: profileQueryErr } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", user_id)
        .maybeSingle();

      if (profileQueryErr) {
        return new Response(JSON.stringify({ error: profileQueryErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (targetProfile?.role === "admin") {
        return new Response(JSON.stringify({ error: "Admin users cannot be deleted" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete permissions first, then profile, then auth user
      await adminClient.from("permissions").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("id", user_id);
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action", action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", message: err.message, stack: err.stack }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
