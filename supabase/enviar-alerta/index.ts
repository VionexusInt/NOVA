import { create, Header, Payload } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const AUTH_KEY_P8 = Deno.env.get("APNS_AUTH_KEY")!;
const BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID")!;
const APNS_ENV = Deno.env.get("APNS_ENV") || "production";
const APNS_HOST = APNS_ENV === "sandbox"
  ? "https://api.sandbox.push.apple.com"
  : "https://api.push.apple.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function importP8Key(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function generarTokenApns(): Promise<string> {
  const key = await importP8Key(AUTH_KEY_P8);
  const header: Header = { alg: "ES256", kid: KEY_ID, typ: "JWT" };
  const payload: Payload = { iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) };
  return await create(header, payload, key);
}

async function enviarPushVoip(deviceToken: string, titulo: string, mensaje: string) {
  const jwt = await generarTokenApns();
  const url = `${APNS_HOST}/3/device/${deviceToken}`;

  const body = { aps: {}, titulo, mensaje, tipo: "llamada_urgente" };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": `${BUNDLE_ID}.voip`,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return { ok: r.ok, status: r.status, body: await r.text() };
}

Deno.serve(async (req) => {
  try {
    const { titulo, mensaje } = await req.json();
    if (!titulo || !mensaje) {
      return new Response(JSON.stringify({ ok: false, error: "Falta titulo o mensaje" }), { status: 400 });
    }

    const tokensRes = await fetch(`${SUPABASE_URL}/rest/v1/nova_device_tokens?activo=eq.true&select=device_token`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    const tokens = await tokensRes.json();

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "No hay dispositivos registrados" }), { status: 404 });
    }

    const resultados = [];
    for (const t of tokens) {
      const r = await enviarPushVoip(t.device_token, titulo, mensaje);
      resultados.push({ token: t.device_token.substring(0, 8) + "...", ok: r.ok, status: r.status });
    }

    return new Response(JSON.stringify({ ok: true, resultados }), {
      headers: { "content-type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
