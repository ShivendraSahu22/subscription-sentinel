import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPTS: Record<string, string> = {
  upcoming: `Generate a short reminder notification.

Rules:
- Max 20 words
- Urgent but friendly
- Include money if available
- Plain text only`,
  last_day: `Generate a last-day warning notification.

Rules:
- Max 15 words
- Create urgency
- Mention charge
- Plain text only`,
};

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

    const { classification_id, type } = await req.json();
    if (!classification_id) return json({ error: "classification_id is required" }, 400);
    const reminderType: "upcoming" | "last_day" = type === "last_day" ? "last_day" : "upcoming";

    // Load classification (RLS ensures it belongs to user)
    const { data: c, error: cErr } = await supabase
      .from("classifications")
      .select("service_name, trial_end_date, amount, currency")
      .eq("id", classification_id)
      .single();
    if (cErr || !c) return json({ error: "Classification not found" }, 404);

    const money = [c.amount, c.currency].filter(Boolean).join(" ").trim();
    const userPrompt = `Service: ${c.service_name || "Unknown"}
Trial End: ${c.trial_end_date || "Unknown"}
Amount: ${money || "Unknown"}

Output:`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: PROMPTS[reminderType] },
          { role: "user", content: userPrompt },
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
    const message = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!message) throw new Error("Empty AI response");

    // Upsert: delete existing of same type then insert (no unique constraint, simpler)
    await supabase
      .from("reminders")
      .delete()
      .eq("classification_id", classification_id)
      .eq("type", reminderType);

    const { data: inserted, error: insertErr } = await supabase
      .from("reminders")
      .insert({ user_id: userId, classification_id, type: reminderType, message })
      .select()
      .single();
    if (insertErr) {
      console.error("Insert reminder error", insertErr);
      return json({ error: "Failed to save reminder" }, 500);
    }

    return json({ id: inserted.id, type: reminderType, reminder: message });
  } catch (e) {
    console.error("generate-reminder error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
