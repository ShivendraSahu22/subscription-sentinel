import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `You are an AI assistant that detects whether an email is related to a subscription, SaaS, OTT, mobile app, or any recurring billing.

Classify into: FREE_TRIAL_STARTED, TRIAL_ENDING_SOON, PAYMENT_CONFIRMED, SUBSCRIPTION_RENEWAL, NOT_RELEVANT

Extract: service_name, subscription_type (trial/paid), amount, currency, frequency (monthly/yearly), next_billing_date (YYYY-MM-DD), trial_end_date (YYYY-MM-DD), cancellation_link (URL if present), sender_email (From address).

Detect risk_signals from: price_increase, auto_renewal_warning, trial_ending_urgency, failed_payment.

Assign priority:
- HIGH: payment/renewal within 3 days, or failed payment
- MEDIUM: trial ending soon, price change
- LOW: informational

Use empty string for unknown text fields and empty array for no signals.`;

const SUBSCRIPTION_QUERY =
  'newer_than:365d (subscription OR receipt OR invoice OR "free trial" OR "trial ends" OR "renews" OR "payment confirmed" OR "billed")';

function decodeBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function extractPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (decoded) return decoded;
  }
  const parts = payload.parts ?? [];
  for (const p of parts) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      return decodeBase64Url(p.body.data);
    }
  }
  for (const p of parts) {
    const nested = extractPlainText(p);
    if (nested) return nested;
  }
  for (const p of parts) {
    if (p.mimeType === "text/html" && p.body?.data) {
      return decodeBase64Url(p.body.data).replace(/<[^>]+>/g, " ");
    }
  }
  return "";
}

function getHeader(headers: any[], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function classifyEmail(emailBody: string, lovableKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Email:\n${emailBody.slice(0, 8000)}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "classify_subscription_email",
            parameters: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: [
                    "FREE_TRIAL_STARTED",
                    "TRIAL_ENDING_SOON",
                    "PAYMENT_CONFIRMED",
                    "SUBSCRIPTION_RENEWAL",
                    "NOT_RELEVANT",
                  ],
                },
                service_name: { type: "string" },
                subscription_type: { type: "string", enum: ["trial", "paid", ""] },
                trial_end_date: { type: "string" },
                next_billing_date: { type: "string" },
                amount: { type: "string" },
                currency: { type: "string" },
                frequency: { type: "string", enum: ["monthly", "yearly", ""] },
                cancellation_link: { type: "string" },
                sender_email: { type: "string" },
                priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
                risk_signals: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "price_increase",
                      "auto_renewal_warning",
                      "trial_ending_urgency",
                      "failed_payment",
                    ],
                  },
                },
              },
              required: [
                "category",
                "service_name",
                "subscription_type",
                "trial_end_date",
                "next_billing_date",
                "amount",
                "currency",
                "frequency",
                "cancellation_link",
                "sender_email",
                "priority",
                "risk_signals",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "classify_subscription_email" } },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) return null;
  try {
    return JSON.parse(tc.function.arguments);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { provider_token, max_emails = 50 } = await req.json().catch(() => ({}));
    if (!provider_token || typeof provider_token !== "string") {
      return json(
        {
          error:
            "Gmail access token required. Please sign in with Google and grant Gmail read access.",
          code: "NO_TOKEN",
        },
        400,
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", SUBSCRIPTION_QUERY);
    listUrl.searchParams.set("maxResults", String(Math.min(max_emails, 100)));

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${provider_token}` },
    });
    if (!listRes.ok) {
      const t = await listRes.text();
      console.error("Gmail list error", listRes.status, t);
      if (listRes.status === 401 || listRes.status === 403) {
        return json(
          {
            error:
              "Gmail access denied. Please sign in with Google again and grant Gmail read access.",
            code: "AUTH_FAILED",
          },
          401,
        );
      }
      return json({ error: "Failed to list Gmail messages" }, 500);
    }
    const listData = await listRes.json();
    const messageIds: string[] = (listData.messages ?? []).map((m: any) => m.id);

    if (messageIds.length === 0) {
      return json({ scanned: 0, found: 0, message: "No subscription emails found." });
    }

    let foundCount = 0;
    let scanned = 0;
    const limited = messageIds.slice(0, max_emails);

    for (const id of limited) {
      try {
        const mRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
          { headers: { Authorization: `Bearer ${provider_token}` } },
        );
        if (!mRes.ok) continue;
        const msg = await mRes.json();
        scanned++;

        const subject = getHeader(msg.payload?.headers ?? [], "Subject");
        const from = getHeader(msg.payload?.headers ?? [], "From");
        const body = extractPlainText(msg.payload).slice(0, 5000);
        const composed = `From: ${from}\nSubject: ${subject}\n\n${body}`;

        const { data: existing } = await supabase
          .from("classifications")
          .select("id")
          .eq("user_id", userId)
          .eq("email_body", composed)
          .maybeSingle();
        if (existing) continue;

        const result = await classifyEmail(composed, LOVABLE_API_KEY);
        if (!result || result.category === "NOT_RELEVANT") continue;

        const { error: insErr } = await supabase.from("classifications").insert({
          user_id: userId,
          email_body: composed,
          category: result.category,
          service_name: result.service_name || null,
          subscription_type: result.subscription_type || null,
          trial_end_date: result.trial_end_date || null,
          next_billing_date: result.next_billing_date || null,
          amount: result.amount || null,
          currency: result.currency || null,
          frequency: result.frequency || null,
          cancellation_link: result.cancellation_link || null,
          sender_email: result.sender_email || from || null,
          priority: result.priority || null,
          risk_signals: Array.isArray(result.risk_signals) && result.risk_signals.length
            ? result.risk_signals
            : null,
        });
        if (!insErr) foundCount++;
      } catch (e) {
        console.error("Message processing error", id, e);
      }
    }

    return json({ scanned, found: foundCount, total_matched: messageIds.length });
  } catch (e) {
    console.error("scan-emails error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
