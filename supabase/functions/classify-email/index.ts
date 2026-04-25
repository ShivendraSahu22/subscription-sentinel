import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an AI assistant that detects subscription-related emails.

Classify the email into:
FREE_TRIAL_STARTED, TRIAL_ENDING_SOON, PAYMENT_CONFIRMED, SUBSCRIPTION_RENEWAL, NOT_RELEVANT

Extract:
- service_name
- trial_end_date
- amount
- currency
- frequency (monthly/yearly)

If a field cannot be determined, return an empty string for it.`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    const { email_body } = await req.json();
    if (!email_body || typeof email_body !== "string") {
      return json({ error: "email_body is required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Email:\n${email_body}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_subscription_email",
              description: "Return classification of a subscription email.",
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
                  trial_end_date: { type: "string" },
                  amount: { type: "string" },
                  currency: { type: "string" },
                  frequency: { type: "string", enum: ["monthly", "yearly", ""] },
                },
                required: [
                  "category",
                  "service_name",
                  "trial_end_date",
                  "amount",
                  "currency",
                  "frequency",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_subscription_email" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limit exceeded. Please try again shortly." }, 429);
      if (response.status === 402) return json({ error: "AI credits exhausted. Add funds in workspace settings." }, 402);
      console.error("Gateway error", response.status, await response.text());
      return json({ error: "AI gateway error" }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");
    const result = JSON.parse(toolCall.function.arguments);

    // Persist to DB
    const { data: inserted, error: insertErr } = await supabase
      .from("classifications")
      .insert({
        user_id: userId,
        email_body,
        category: result.category,
        service_name: result.service_name || null,
        trial_end_date: result.trial_end_date || null,
        amount: result.amount || null,
        currency: result.currency || null,
        frequency: result.frequency || null,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert classification error", insertErr);
      return json({ error: "Failed to save classification" }, 500);
    }

    return json({ ...result, id: inserted.id, created_at: inserted.created_at });
  } catch (e) {
    console.error("classify-email error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
