"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ONBOARD_EVENT, useEscapeClose } from "@/lib/shortcuts";

const FLAG = "tt_onboarded";

const STEPS = [
  {
    label: "Hunter",
    icon: "radar",
    text: "Spot trending ideas, then scan the Play Store for weak competitors to beat.",
  },
  {
    label: "Refine",
    icon: "neurology",
    text: "Talk it through with the AI until the idea becomes a living specification.",
  },
  {
    label: "Design",
    icon: "palette",
    text: "Generate a Stitch prompt, design the screens, and bring them back in.",
  },
  {
    label: "Docs",
    icon: "menu_book",
    text: "Generate the technical documents an AI coder needs to build it.",
  },
  {
    label: "Export",
    icon: "folder_zip",
    text: "Download the build pack, ready for your AI coding tool.",
  },
];

/**
 * First-run overlay: walks through the 5 pipeline steps once, then sets a
 * localStorage flag. Re-triggerable via the ONBOARD_EVENT (header help icon
 * and the Settings page button both dispatch it).
 */
export default function Onboarding() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  // No auto-show: the tour only appears when manually triggered via the
  // help icon or the Settings "Take the pipeline tour" button.
  // (Auto-show kept interrupting users on pages they came to use.)

  useEffect(() => {
    const show = () => setVisible(true);
    window.addEventListener(ONBOARD_EVENT, show);
    return () => window.removeEventListener(ONBOARD_EVENT, show);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(FLAG, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }, []);

  useEscapeClose(dismiss);

  const start = useCallback(() => {
    dismiss();
    router.push("/");
  }, [dismiss, router]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      <div className="card-elevated max-h-[90dvh] w-full max-w-md overflow-y-auto p-6 md:p-7">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="label-caps text-primary">Welcome</p>
            <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight">
              Five steps, one app
            </h2>
          </div>
          <button
            onClick={dismiss}
            aria-label="Close"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="material-symbols text-[20px]">close</span>
          </button>
        </div>

        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                <span className="material-symbols text-[18px]">{s.icon}</span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {i + 1}.{" "}
                  </span>
                  {s.label}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={start}
            className="btn-primary min-h-[48px] w-full"
          >
            <span>Start in Hunter</span>
            <span className="material-symbols text-[18px]">arrow_forward</span>
          </button>
          <button
            onClick={dismiss}
            className="btn-ghost min-h-[44px] w-full"
          >
            <span>Skip tour</span>
          </button>
        </div>
      </div>
    </div>
  );
}
