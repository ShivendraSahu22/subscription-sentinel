import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You summarize a user's subscriptions.

Rules:
- Strict max 50 words
- Show approximate total monthly spend (convert yearly to monthly: divide by 12)
- Highlight obvious waste (duplicates, unused, irrelevant)
- Plain text, no markdown, no emoji
- If data is sparse, say so honestly`;

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

    const { data: rows, error: qErr } = await supabase
      .from("classifications")
      .select("category, service_name, amount, currency, frequency")
      .order("created_at", { ascending: false })
      .limit(100);
    if (qErr) {
      console.error("query error", qErr);
      return json({ error: "Failed to load classifications" }, 500);
    }

    if (!rows || rows.length === 0) {
      return json({ summary: "No subscriptions saved yet.", count: 0 });
    }

    const summaryInput = rows
      .map(
        (r) =>
          `- ${r.service_name || "Unknown"} | ${r.category} | ${[r.amount, r.currency]
            .filter(Boolean)
            .join(" ") || "?"} | ${r.frequency || "?"}`,
      )
      .join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Subscriptions:\n${summaryInput}\n\nOutput:` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limit exceeded." }, 429);
      if (response.status === 402) return json({ error: "AI credits exhausted." }, 402);
      console.error("Gateway error", response.status, await response.text());
      return json({ error: "AI gateway error" }, 500);
    }

    const data = await response.json();
    const summary = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!summary) throw new Error("Empty AI response");

    const { error: insertErr } = await supabase.from("summaries").insert({
      user_id: userId,
      summary,
      classifications_count: rows.length,
    });
    if (insertErr) console.error("Insert summary error", insertErr);

    return json({ summary, count: rows.length });
  } catch (e) {
    console.error("summarize-subscriptions error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
