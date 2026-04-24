import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email_body } = await req.json();
    if (!email_body || typeof email_body !== "string") {
      return new Response(JSON.stringify({ error: "email_body is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await response.text();
      console.error("Gateway error", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
