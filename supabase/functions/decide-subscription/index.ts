import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You decide whether a user should keep, cancel, or be asked about a subscription.

Rules:
- Low usage → CANCEL
- High usage → KEEP
- Unknown / ambiguous → ASK_USER
- Always factor in the User Preference if provided
- The "reason" must be one short sentence (max 25 words) in plain English`;

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

    const { classification_id, usage, preference } = await req.json();
    if (!classification_id) return json({ error: "classification_id is required" }, 400);

    const { data: c, error: cErr } = await supabase
      .from("classifications")
      .select("service_name, amount, currency")
      .eq("id", classification_id)
      .single();
    if (cErr || !c) return json({ error: "Classification not found" }, 404);

    const money = [c.amount, c.currency].filter(Boolean).join(" ").trim();
    const userPrompt = `Service: ${c.service_name || "Unknown"}
Usage: ${usage || "Unknown"}
Cost: ${money || "Unknown"}
User Preference: ${preference || "None"}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "decide_subscription",
              description: "Return KEEP, CANCEL, or ASK_USER with a short reason.",
              parameters: {
                type: "object",
                properties: {
                  decision: { type: "string", enum: ["KEEP", "CANCEL", "ASK_USER"] },
                  reason: { type: "string" },
                },
                required: ["decision", "reason"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "decide_subscription" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limit exceeded." }, 429);
      if (response.status === 402) return json({ error: "AI credits exhausted." }, 402);
      console.error("Gateway error", response.status, await response.text());
      return json({ error: "AI gateway error" }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");
    const result = JSON.parse(toolCall.function.arguments);

    // Replace previous decision for this classification
    await supabase.from("decisions").delete().eq("classification_id", classification_id);

    const { error: insertErr } = await supabase.from("decisions").insert({
      user_id: userId,
      classification_id,
      decision: result.decision,
      reason: result.reason,
      usage: usage || null,
      preference: preference || null,
    });
    if (insertErr) {
      console.error("Insert decision error", insertErr);
      return json({ error: "Failed to save decision" }, 500);
    }

    return json(result);
  } catch (e) {
    console.error("decide-subscription error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
