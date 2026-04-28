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
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  email: string;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
};

export const ScanOtpDialog = ({ open, email, onOpenChange, onVerified }: Props) => {
  const [step, setStep] = useState<"send" | "verify">("send");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("send");
      setCode("");
      setSending(false);
      setVerifying(false);
    }
  }, [open]);

  const sendCode = async () => {
    if (!email) return;
    setSending(true);
    try {
      // Send a 6-digit OTP to the user's registered email.
      // shouldCreateUser:false — user must already exist (they're signed in).
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
      toast({
        title: "Couldn't send code",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (code.length < 6) return;
    setVerifying(true);
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
      toast({
        title: "Invalid code",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
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

        {step === "verify" && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Verification code</label>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="tracking-[0.4em] text-center text-lg"
            />
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
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Send verification code
            </Button>
          ) : (
            <Button
              onClick={verify}
              disabled={verifying || code.length < 6}
              className="w-full"
            >
              {verifying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Verify & scan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
