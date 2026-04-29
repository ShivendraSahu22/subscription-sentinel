import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, Mail, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/** Map raw Supabase auth errors to friendly, actionable messages. */
const friendlyAuthError = (raw: string, mode: "signin" | "signup"): string => {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_grant"))
    return "That email and password don't match. Double-check them, or use \"Forgot password\" if you've lost it.";
  if (m.includes("email not confirmed") || m.includes("not confirmed"))
    return "Your email isn't confirmed yet. Check your inbox (and spam) for the confirmation link.";
  if (m.includes("user already registered") || m.includes("already exists") || m.includes("already registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (m.includes("user not found"))
    return "We couldn't find an account for this email. Create one to get started.";
  if (m.includes("password") && (m.includes("short") || m.includes("characters") || m.includes("weak")))
    return "Password is too weak. Use at least 6 characters with a mix of letters and numbers.";
  if (m.includes("rate") || m.includes("too many") || m.includes("retry"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("fetch"))
    return "Network error. Check your connection and try again.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "New sign-ups are currently disabled. Contact support if you need an account.";
  if (m.includes("popup") && m.includes("closed"))
    return "The sign-in window was closed before finishing. Please try again.";
  if (m.includes("provider is not enabled") || m.includes("oauth") || m.includes("unsupported provider"))
    return "Google sign-in couldn't start. Please try again, or use email and password instead.";
  return mode === "signup"
    ? "We couldn't create your account. Please try again."
    : "We couldn't sign you in. Please try again.";
};


const Auth = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Clear any stale/corrupt session tokens that cause "Invalid Refresh Token" errors.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error || (data.session && !data.session.user)) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        // Remove any leftover sb-* keys in localStorage just in case.
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-"))
          .forEach((k) => localStorage.removeItem(k));
      }
    })();
  }, []);

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-subtle">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email || !password) {
      setFormError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast({ title: "Account created", description: "You're signed in." });
        navigate("/", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/", { replace: true });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unknown error";
      setFormError(friendlyAuthError(raw, mode));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setFormError(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: {
          prompt: "consent",
        },
      });

      if (result.error) {
        const message = result.error instanceof Error ? result.error.message : String(result.error);
        setFormError(friendlyAuthError(message, "signin"));
        setBusy(false);
        return;
      }

      if (result.redirected) return;

      navigate("/", { replace: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unknown error";
      setFormError(friendlyAuthError(raw, "signin"));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-subtle p-4">
      <Card className="w-full max-w-md p-6 shadow-elegant">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Subscription Email Classifier
          </div>
          <h1 className="mt-3 text-2xl font-bold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to access your subscriptions"
              : "Sign up to start classifying emails"}
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p>{formError}</p>
              {mode === "signin" &&
                /match|password|credentials/i.test(formError) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setFormError(null);
                    }}
                    className="font-medium underline underline-offset-2"
                  >
                    Create an account instead
                  </button>
                )}
              {mode === "signup" && /already/i.test(formError) && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setFormError(null);
                  }}
                  className="font-medium underline underline-offset-2"
                >
                  Sign in instead
                </button>
              )}
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={google}
          disabled={busy}
        >
          Continue with Google
        </Button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              className="mt-1"
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-gradient-primary hover:opacity-90"
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setFormError(null);
            }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </Card>
    </div>
  );
};

export default Auth;
