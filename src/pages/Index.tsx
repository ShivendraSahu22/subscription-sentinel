import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
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
  Scissors,
  LogOut,
  Inbox,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Classification = {
  id: string;
  category: string;
  service_name: string | null;
  trial_end_date: string | null;
  amount: string | null;
  currency: string | null;
  frequency: string | null;
};

type Message =
  | { role: "user"; content: string; id: string }
  | { role: "assistant"; result: Classification; id: string };

type SavedRow = Classification & {
  email_body: string;
  created_at: string;
};

type ReminderType = "upcoming" | "last_day";
type ReminderRow = { id: string; classification_id: string; type: ReminderType; message: string };
type DecisionRow = {
  id: string;
  classification_id: string;
  decision: "KEEP" | "CANCEL" | "ASK_USER";
  reason: string;
  usage: string | null;
  preference: string | null;
};
type SuggestionRow = {
  id: string;
  classification_id: string;
  suggestion: string;
  usage: string | null;
};

// (sample email removed — users now scan their own inbox)

const categoryStyles: Record<string, string> = {
  FREE_TRIAL_STARTED: "bg-info/10 text-info border-info/20",
  TRIAL_ENDING_SOON: "bg-warning/10 text-warning border-warning/30",
  PAYMENT_CONFIRMED: "bg-success/10 text-success border-success/20",
  SUBSCRIPTION_RENEWAL: "bg-primary/10 text-primary border-primary/20",
  NOT_RELEVANT: "bg-muted text-muted-foreground border-border",
};

const Index = () => {
  const { user, session, signOut } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<SavedRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadAll = async () => {
    const [h, r, d, s] = await Promise.all([
      supabase
        .from("classifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("reminders").select("*"),
      supabase.from("decisions").select("*"),
      supabase.from("cancellation_suggestions").select("*"),
    ]);
    if (h.data) setHistory(h.data as SavedRow[]);
    if (r.data) setReminders(r.data as ReminderRow[]);
    if (d.data) setDecisions(d.data as DecisionRow[]);
    if (s.data) setSuggestions(s.data as SuggestionRow[]);
  };

  useEffect(() => {
    loadAll();
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

      const result: Classification = {
        id: data.id,
        category: data.category,
        service_name: data.service_name || null,
        trial_end_date: data.trial_end_date || null,
        amount: data.amount || null,
        currency: data.currency || null,
        frequency: data.frequency || null,
      };
      setMessages((m) => [...m, { role: "assistant", result, id: crypto.randomUUID() }]);
      loadAll();
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

  const reconnectGmail = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: {
        scope:
          "openid email profile https://www.googleapis.com/auth/gmail.readonly",
        access_type: "offline",
        prompt: "consent",
      },
    });
    if (result.error) {
      toast({
        title: "Google sign-in failed",
        description: result.error.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  const hasGmailToken = !!session?.provider_token;

  const scanInbox = async () => {
    const token = session?.provider_token;
    if (!token) {
      // No token in session — trigger reconnect directly from this click
      // (browsers allow popups only when triggered by user gesture)
      await reconnectGmail();
      return;
    }
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-emails", {
        body: { provider_token: token, max_emails: 50 },
      });
      if (error) throw error;
      if (data?.error) {
        if (data.code === "NO_TOKEN" || data.code === "AUTH_FAILED") {
          toast({
            title: "Gmail access expired",
            description: "Click Connect Gmail to sign in again.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(data.error);
      }
      toast({
        title: "Scan complete",
        description: `Scanned ${data.scanned ?? 0} emails — found ${data.found ?? 0} subscription${data.found === 1 ? "" : "s"}.`,
      });
      loadAll();
    } catch (e) {
      toast({
        title: "Scan failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const reminderFor = (classificationId: string, type: ReminderType) =>
    reminders.find((r) => r.classification_id === classificationId && r.type === type);
  const decisionFor = (classificationId: string) =>
    decisions.find((d) => d.classification_id === classificationId);
  const suggestionFor = (classificationId: string) =>
    suggestions.find((s) => s.classification_id === classificationId);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container max-w-6xl py-8">
        <header className="mb-8 text-center">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={scanInbox} disabled={scanning}>
              {scanning ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Inbox className="mr-1.5 h-3.5 w-3.5" />
              )}
              {scanning ? "Scanning..." : hasGmailToken ? "Scan mails" : "Connect Gmail"}
            </Button>
            <span className="text-xs text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
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
                      <p className="font-medium">Find your subscriptions</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Scan your inbox or paste a single email below
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={scanInbox}
                      disabled={scanning}
                      className="bg-gradient-primary hover:opacity-90"
                    >
                      {scanning ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Inbox className="mr-2 h-4 w-4" />
                      )}
                      {scanning ? "Scanning..." : "Scan your mails"}
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
                      <ResultCard
                        result={m.result}
                        existingReminders={{
                          upcoming: reminderFor(m.result.id, "upcoming")?.message,
                          last_day: reminderFor(m.result.id, "last_day")?.message,
                        }}
                        existingDecision={decisionFor(m.result.id) ?? null}
                        existingSuggestion={suggestionFor(m.result.id) ?? null}
                        onChange={loadAll}
                      />
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

const ResultCard = ({
  result,
  existingReminders,
  existingDecision,
  existingSuggestion,
  onChange,
}: {
  result: Classification;
  existingReminders: Partial<Record<ReminderType, string>>;
  existingDecision: DecisionRow | null;
  existingSuggestion: SuggestionRow | null;
  onChange: () => void;
}) => {
  const [reminders, setReminders] =
    useState<Partial<Record<ReminderType, string>>>(existingReminders);
  const [loadingType, setLoadingType] = useState<ReminderType | null>(null);

  useEffect(() => setReminders(existingReminders), [existingReminders]);

  const fields: { label: string; value: string }[] = [
    { label: "Service", value: result.service_name ?? "" },
    { label: "Trial ends", value: result.trial_end_date ?? "" },
    {
      label: "Amount",
      value: [result.amount, result.currency].filter(Boolean).join(" "),
    },
    { label: "Frequency", value: result.frequency ?? "" },
  ].filter((f) => f.value);

  const canRemind =
    result.category !== "NOT_RELEVANT" &&
    !!(result.service_name || result.trial_end_date || result.amount);

  const generate = async (type: ReminderType) => {
    setLoadingType(type);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reminder", {
        body: { classification_id: result.id, type },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReminders((r) => ({ ...r, [type]: data.reminder }));
      onChange();
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
        <Badge variant="outline" className={`mt-1 ${categoryStyles[result.category] ?? ""}`}>
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
                    <p className="text-xs font-semibold uppercase tracking-wide">{meta.label}</p>
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

      {canRemind && (
        <DecisionPanel
          result={result}
          existingDecision={existingDecision}
          existingSuggestion={existingSuggestion}
          onChange={onChange}
        />
      )}

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

const DecisionPanel = ({
  result,
  existingDecision,
  existingSuggestion,
  onChange,
}: {
  result: Classification;
  existingDecision: DecisionRow | null;
  existingSuggestion: SuggestionRow | null;
  onChange: () => void;
}) => {
  const [open, setOpen] = useState(!!existingDecision || !!existingSuggestion);
  const [usage, setUsage] = useState(existingDecision?.usage ?? existingSuggestion?.usage ?? "");
  const [preference, setPreference] = useState(existingDecision?.preference ?? "");
  const [decision, setDecision] = useState<Decision | null>(
    existingDecision ? { decision: existingDecision.decision, reason: existingDecision.reason } : null,
  );
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(
    existingSuggestion?.suggestion ?? null,
  );
  const [suggestLoading, setSuggestLoading] = useState(false);

  const decide = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("decide-subscription", {
        body: { classification_id: result.id, usage, preference },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDecision(data as Decision);
      onChange();
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

  const suggestCancellation = async () => {
    setSuggestLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-cancellation", {
        body: { classification_id: result.id, usage },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestion(data.suggestion);
      onChange();
    } catch (e) {
      toast({
        title: "Couldn't draft suggestion",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSuggestLoading(false);
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
            <p className="text-xs font-semibold uppercase tracking-wide">{meta.label}</p>
          </div>
          <p className="text-sm text-foreground">{decision.reason}</p>
        </div>
      )}

      <div className="space-y-2 border-t border-border/60 pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={suggestCancellation}
          disabled={suggestLoading}
          className="w-full justify-start"
        >
          {suggestLoading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Scissors className="mr-2 h-3.5 w-3.5" />
          )}
          {suggestion ? "Redraft cancellation suggestion" : "Suggest cancellation"}
        </Button>

        {suggestion && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
            <div className="mb-1 flex items-center gap-1.5">
              <Scissors className="h-3.5 w-3.5" />
              <p className="text-xs font-semibold uppercase tracking-wide">
                Cancellation suggestion
              </p>
            </div>
            <p className="text-sm text-foreground">{suggestion}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryPanel = ({ historyCount }: { historyCount: number }) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Load latest saved summary on mount
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("summaries")
        .select("summary, classifications_count")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setSummary(data.summary);
        setCount(data.classifications_count);
      }
    })();
  }, []);

  // Invalidate when history changes
  useEffect(() => {
    if (summary && historyCount !== count) setSummary(null);
  }, [historyCount, count, summary]);

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("summarize-subscriptions", {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary);
      setCount(data.count ?? 0);
    } catch (e) {
      toast({
        title: "Couldn't summarize",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (historyCount === 0) return null;

  return (
    <div className="border-b border-border/60 bg-accent/40 p-3">
      {summary ? (
        <div className="rounded-lg border border-primary/20 bg-card p-3 shadow-soft">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Spend summary
              </p>
            </div>
            <button
              onClick={generate}
              disabled={loading}
              className="text-[10px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              {loading ? "..." : "Refresh"}
            </button>
          </div>
          <p className="text-sm leading-relaxed text-foreground">{summary}</p>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={generate}
          disabled={loading}
          className="w-full justify-start"
        >
          {loading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wallet className="mr-2 h-3.5 w-3.5" />
          )}
          Summarize my subscriptions
        </Button>
      )}
    </div>
  );
};

export default Index;
