const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    const { device_token } = await req.json();
    if (!device_token) {
      return new Response(JSON.stringify({ ok: false, error: "Falta device_token" }), { status: 400 });
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/nova_device_tokens`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({ device_token, activo: true })
    });

    return new Response(JSON.stringify({ ok: r.ok }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
