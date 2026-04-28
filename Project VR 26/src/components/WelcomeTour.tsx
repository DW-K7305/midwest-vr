/**
 * First-run guided tour. Triggered when MidWest-VR opens for the first time
 * (no welcome_seen flag in localStorage). 4 simple steps, fully keyboard-able.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Boxes,
  Compass,
  Headphones,
  Plug,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const FLAG = "midwestvr.welcome_v1_seen";

interface Step {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
  cta?: { label: string; route?: string };
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome to MidWest-VR",
    body: (
      <>
        A locally-managed Meta Quest 2 fleet manager built for K-12. Designed
        for non-technical staff: every action is one click, every screen tells
        you what to do next. Three things to know before you start —
      </>
    ),
  },
  {
    icon: Plug,
    title: "Step 1 — Connect a headset",
    body: (
      <>
        Plug a Quest 2 into your Mac via USB-C. The first time, you'll need to
        enable Developer Mode on the headset (one-time, ~90 seconds — the{" "}
        <strong>Connect</strong> tab walks you through it). After the first
        time, plugging in just works.
      </>
    ),
    cta: { label: "Open the Connect guide", route: "/connect" },
  },
  {
    icon: Compass,
    title: "Step 2 — Discover apps",
    body: (
      <>
        The <strong>Discover</strong> tab has a curated catalog of K-12 Quest
        apps (educational + fun + creative). Hit{" "}
        <strong>Install Recommended Pack on All</strong> and walk away while
        the whole pack lands on every plugged-in headset. Default is
        offline-only — turn on Online catalog in Settings to access it.
      </>
    ),
    cta: { label: "See the catalog", route: "/discover" },
  },
  {
    icon: Boxes,
    title: "Step 3 — Manage what's on each headset",
    body: (
      <>
        The <strong>Apps</strong> tab shows what's installed on the selected
        headset, with thumbnails. Tap a card to select; "Remove N selected"
        bulk-uninstalls. <strong>Kiosk</strong> locks a headset to one app for
        classroom stations. <strong>Wi-Fi</strong> pushes network creds to a
        headset. That's the whole app.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Privacy & K-12 safety",
    body: (
      <>
        By default, MidWest-VR makes <strong>zero outbound network calls</strong>.
        Online catalog is opt-in. When enabled, only a hardcoded allowlist of
        trusted hosts is reachable. Every request is visible in{" "}
        <strong>Settings → Network activity log</strong>. No telemetry, no
        accounts, no PII — see <span className="font-mono">docs/SAFETY.md</span>{" "}
        if your IT department asks.
      </>
    ),
  },
];

export function WelcomeTour() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (!localStorage.getItem(FLAG)) {
      setOpen(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  function jumpTo(route?: string) {
    if (route) {
      nav(route);
      dismiss();
    } else {
      next();
    }
  }

  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">{s.title}</DialogTitle>
          <DialogDescription className="text-center leading-relaxed pt-2">
            {s.body}
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === step
                  ? "bg-primary w-6"
                  : i < step
                  ? "bg-primary/40 w-1.5"
                  : "bg-muted w-1.5")
              }
            />
          ))}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="ghost" onClick={dismiss} className="text-xs">
            Skip tour
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {s.cta ? (
              <Button onClick={() => jumpTo(s.cta!.route)}>
                <Rocket className="h-4 w-4 mr-2" />
                {s.cta.label}
              </Button>
            ) : (
              <Button onClick={next}>
                {isLast ? (
                  <>
                    <Headphones className="h-4 w-4 mr-2" />
                    Let's go
                  </>
                ) : (
                  "Next"
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
