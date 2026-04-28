import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  email: string;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
};

const friendlySendError = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes("rate") || m.includes("too many") || m.includes("seconds"))
    return "Too many requests. Please wait a minute before requesting another code.";
  if (m.includes("not found") || m.includes("no user") || m.includes("signups not allowed"))
    return "We couldn't find an account for this email. Try signing in again.";
  if (m.includes("network") || m.includes("failed to fetch"))
    return "Network error. Check your connection and try again.";
  return msg || "Couldn't send the verification code. Please try again.";
};

const friendlyVerifyError = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes("expired"))
    return "This code has expired. Tap Resend code to get a new one.";
  if (m.includes("invalid") || m.includes("token"))
    return "That code isn't right. Double-check the 6 digits and try again.";
  if (m.includes("network") || m.includes("failed to fetch"))
    return "Network error. Check your connection and try again.";
  return msg || "Verification failed. Please try again.";
};

export const ScanOtpDialog = ({ open, email, onOpenChange, onVerified }: Props) => {
  const [step, setStep] = useState<"send" | "verify">("send");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("send");
      setCode("");
      setSending(false);
      setVerifying(false);
      setSendError(null);
      setVerifyError(null);
    }
  }, [open]);

  const sendCode = async () => {
    if (!email) return;
    setSending(true);
    setSendError(null);
    setVerifyError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      toast({
        title: "Verification code sent",
        description: `We emailed a 6-digit code to ${email}.`,
      });
      setStep("verify");
    } catch (e) {
      setSendError(
        friendlySendError(e instanceof Error ? e.message : "Unknown error"),
      );
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (code.length < 6) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      toast({ title: "Email verified", description: "Scanning your inbox now…" });
      onOpenChange(false);
      onVerified();
    } catch (e) {
      setVerifyError(
        friendlyVerifyError(e instanceof Error ? e.message : "Unknown error"),
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Verify it's you
          </DialogTitle>
          <DialogDescription>
            {step === "send"
              ? `Before we scan your inbox, confirm your identity with a one-time code sent to ${email}.`
              : `Enter the 6-digit code we sent to ${email}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "send" && sendError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{sendError}</span>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Verification code</label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                if (verifyError) setVerifyError(null);
              }}
              placeholder="123456"
              aria-invalid={!!verifyError}
              aria-describedby={verifyError ? "otp-error" : undefined}
              className={`tracking-[0.4em] text-center text-lg ${
                verifyError ? "border-destructive focus-visible:ring-destructive" : ""
              }`}
            />
            {verifyError && (
              <div
                id="otp-error"
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}
            {sendError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{sendError}</span>
              </div>
            )}
            <button
              type="button"
              onClick={sendCode}
              disabled={sending}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {sending ? "Resending…" : "Resend code"}
            </button>
          </div>
        )}

        <DialogFooter>
          {step === "send" ? (
            <Button onClick={sendCode} disabled={sending || !email} className="w-full">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {sendError ? "Try again" : "Send verification code"}
            </Button>
          ) : (
            <Button
              onClick={verify}
              disabled={verifying || code.length < 6}
              className="w-full"
            >
              {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify & scan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
