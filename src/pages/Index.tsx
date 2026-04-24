import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Send,
  Trash2,
  Mail,
  User,
  Bot,
  Bell,
  Loader2,
  AlertTriangle,
  Scale,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Wallet,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Classification = {
  category: string;
  service_name: string;
  trial_end_date: string;
  amount: string;
  currency: string;
  frequency: string;
};

type Message =
  | { role: "user"; content: string; id: string }
  | { role: "assistant"; result: Classification; id: string };

type SavedRow = Classification & {
  id: string;
  email_body: string;
  created_at: string;
};

const SAMPLE = `Hi Alex,

Welcome to Notion! Your 14-day Pro free trial has started today.
Your trial ends on May 8, 2026. After that, you'll be billed $10 USD per month
unless you cancel.

— The Notion Team`;

const categoryStyles: Record<string, string> = {
  FREE_TRIAL_STARTED: "bg-info/10 text-info border-info/20",
  TRIAL_ENDING_SOON: "bg-warning/10 text-warning border-warning/30",
  PAYMENT_CONFIRMED: "bg-success/10 text-success border-success/20",
  SUBSCRIPTION_RENEWAL: "bg-primary/10 text-primary border-primary/20",
  NOT_RELEVANT: "bg-muted text-muted-foreground border-border",
};

const Index = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<SavedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("classifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as SavedRow[]);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const body = (text ?? input).trim();
    if (!body || loading) return;

    const userMsg: Message = { role: "user", content: body, id: crypto.randomUUID() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("classify-email", {
        body: { email_body: body },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data as Classification;
      setMessages((m) => [...m, { role: "assistant", result, id: crypto.randomUUID() }]);

      await supabase.from("classifications").insert({
        email_body: body,
        category: result.category,
        service_name: result.service_name || null,
        trial_end_date: result.trial_end_date || null,
        amount: result.amount || null,
        currency: result.currency || null,
        frequency: result.frequency || null,
      });
      loadHistory();
    } catch (e) {
      toast({
        title: "Classification failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => setMessages([]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container max-w-6xl py-8">
        <header className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by Lovable AI
          </div>
          <h1 className="mt-4 bg-gradient-primary bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl">
            Subscription Email Classifier
          </h1>
          <p className="mt-3 text-muted-foreground">
            Paste any email — the agent detects subscription signals and extracts structured data.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Chat */}
          <Card className="flex h-[640px] flex-col overflow-hidden border-border/60 shadow-elegant">
            <div className="flex items-center justify-between border-b border-border/60 bg-card/50 px-5 py-3 backdrop-blur">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-primary">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Email Agent</p>
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearChat} disabled={!messages.length}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1" ref={scrollRef as never}>
              <div className="space-y-4 p-5">
                {messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
                      <Mail className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">Paste an email to get started</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Or try a sample below
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => send(SAMPLE)}>
                      Try sample email
                    </Button>
                  </div>
                )}

                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end gap-3">
                      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-primary px-4 py-3 text-sm text-primary-foreground shadow-soft">
                        <pre className="whitespace-pre-wrap font-sans">{m.content}</pre>
                      </div>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-primary">
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <ResultCard result={m.result} />
                    </div>
                  ),
                )}

                {loading && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-primary">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-card px-4 py-3 shadow-soft">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t border-border/60 bg-card/50 p-3 backdrop-blur">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Paste an email here..."
                  className="min-h-[60px] resize-none border-border/60 bg-background"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <Button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  size="icon"
                  className="h-auto w-12 bg-gradient-primary hover:opacity-90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">⌘/Ctrl + Enter to send</p>
            </div>
          </Card>

          {/* History */}
          <Card className="flex h-[640px] flex-col overflow-hidden border-border/60 shadow-soft">
            <div className="border-b border-border/60 bg-card/50 px-5 py-3 backdrop-blur">
              <p className="text-sm font-semibold">Recent classifications</p>
              <p className="text-xs text-muted-foreground">{history.length} saved</p>
            </div>
            <SummaryPanel historyCount={history.length} />
            <ScrollArea className="flex-1">
              <div className="space-y-2 p-3">
                {history.length === 0 && (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                    History will appear here.
                  </p>
                )}
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-lg border border-border/60 bg-background p-3 transition-shadow hover:shadow-soft"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${categoryStyles[h.category] ?? ""}`}
                      >
                        {h.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(h.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {h.service_name && (
                      <p className="mt-2 text-sm font-medium">{h.service_name}</p>
                    )}
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {h.email_body}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
};

type ReminderType = "upcoming" | "last_day";

const reminderMeta: Record<
  ReminderType,
  { label: string; short: string; tone: string; icon: typeof Bell }
> = {
  upcoming: {
    label: "Reminder",
    short: "Generate reminder",
    tone: "border-warning/30 bg-warning/10 text-warning",
    icon: Bell,
  },
  last_day: {
    label: "Last-day warning",
    short: "Last-day warning",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
};

const ResultCard = ({ result }: { result: Classification }) => {
  const [reminders, setReminders] = useState<Partial<Record<ReminderType, string>>>({});
  const [loadingType, setLoadingType] = useState<ReminderType | null>(null);

  const fields: { label: string; value: string }[] = [
    { label: "Service", value: result.service_name },
    { label: "Trial ends", value: result.trial_end_date },
    {
      label: "Amount",
      value: [result.amount, result.currency].filter(Boolean).join(" "),
    },
    { label: "Frequency", value: result.frequency },
  ].filter((f) => f.value);

  const canRemind =
    result.category !== "NOT_RELEVANT" &&
    (result.service_name || result.trial_end_date || result.amount);

  const generate = async (type: ReminderType) => {
    setLoadingType(type);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reminder", {
        body: {
          service_name: result.service_name,
          trial_end_date: result.trial_end_date,
          amount: result.amount,
          currency: result.currency,
          type,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReminders((r) => ({ ...r, [type]: data.reminder }));
    } catch (e) {
      toast({
        title: "Couldn't generate notification",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div className="max-w-[85%] space-y-3 rounded-2xl rounded-tl-sm border border-border/60 bg-card p-4 shadow-soft">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Category
        </p>
        <Badge
          variant="outline"
          className={`mt-1 ${categoryStyles[result.category] ?? ""}`}
        >
          {result.category}
        </Badge>
      </div>

      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
          {fields.map((f) => (
            <div key={f.label}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="text-sm font-medium">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      {canRemind && (
        <div className="space-y-2 border-t border-border/60 pt-3">
          {(Object.keys(reminderMeta) as ReminderType[]).map((type) => {
            const meta = reminderMeta[type];
            const Icon = meta.icon;
            const text = reminders[type];
            const isLoading = loadingType === type;

            if (text) {
              return (
                <div key={type} className={`rounded-lg border p-3 ${meta.tone}`}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      {meta.label}
                    </p>
                  </div>
                  <p className="text-sm text-foreground">{text}</p>
                  <button
                    onClick={() => generate(type)}
                    disabled={isLoading}
                    className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {isLoading ? "Regenerating..." : "Regenerate"}
                  </button>
                </div>
              );
            }

            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                onClick={() => generate(type)}
                disabled={isLoading}
                className="w-full justify-start"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon className="mr-2 h-3.5 w-3.5" />
                )}
                {meta.short}
              </Button>
            );
          })}
        </div>
      )}

      {canRemind && <DecisionPanel result={result} />}

      <details className="border-t border-border/60 pt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          View JSON
        </summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[11px]">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
};

type Decision = { decision: "KEEP" | "CANCEL" | "ASK_USER"; reason: string };

const decisionMeta: Record<
  Decision["decision"],
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  KEEP: {
    label: "Keep",
    tone: "border-success/30 bg-success/10 text-success",
    icon: CheckCircle2,
  },
  CANCEL: {
    label: "Cancel",
    tone: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: XCircle,
  },
  ASK_USER: {
    label: "Ask user",
    tone: "border-info/30 bg-info/10 text-info",
    icon: HelpCircle,
  },
};

const DecisionPanel = ({ result }: { result: Classification }) => {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState("");
  const [preference, setPreference] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);

  const decide = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("decide-subscription", {
        body: {
          service_name: result.service_name,
          amount: result.amount,
          currency: result.currency,
          usage,
          preference,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDecision(data as Decision);
    } catch (e) {
      toast({
        title: "Couldn't decide",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <div className="border-t border-border/60 pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="w-full justify-start"
        >
          <Scale className="mr-2 h-3.5 w-3.5" />
          Decide: keep or cancel?
        </Button>
      </div>
    );
  }

  const meta = decision ? decisionMeta[decision.decision] : null;
  const Icon = meta?.icon;

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <div className="flex items-center gap-1.5">
        <Scale className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Decide action
        </p>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted-foreground">Usage</label>
          <Input
            value={usage}
            onChange={(e) => setUsage(e.target.value)}
            placeholder="e.g. 2 hours/month, daily, never opened"
            className="mt-1 h-9 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">User preference</label>
          <Input
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
            placeholder="e.g. cutting subscriptions, want to keep tools I love"
            className="mt-1 h-9 text-sm"
          />
        </div>
      </div>

      <Button
        size="sm"
        onClick={decide}
        disabled={loading}
        className="w-full bg-gradient-primary hover:opacity-90"
      >
        {loading ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Scale className="mr-2 h-3.5 w-3.5" />
        )}
        {decision ? "Re-decide" : "Get decision"}
      </Button>

      {decision && meta && Icon && (
        <div className={`rounded-lg border p-3 ${meta.tone}`}>
          <div className="mb-1 flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" />
            <p className="text-xs font-semibold uppercase tracking-wide">
              {meta.label}
            </p>
          </div>
          <p className="text-sm text-foreground">{decision.reason}</p>
        </div>
      )}
    </div>
  );
};

export default Index;
