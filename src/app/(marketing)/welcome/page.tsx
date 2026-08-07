import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { BrandBadge, BrandLogo } from "@/components/layout/brand-logo";
import { MaldivesAnimation } from "@/components/marketing/maldives-animation";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Perx CRM",
  description: "Taking loyalty across the Maldives — one island at a time.",
};

// Public landing shown before sign-in.
//
// The animation is a self-contained 16:9 film: it carries its own title card
// ("1,192 islands. One loyalty network."), legend, counter and closing Perx
// lockup. So the page deliberately adds no headline of its own — competing
// copy would sit on top of the film's. The page supplies only chrome: the
// wordmark for orientation and the way in.
export default function WelcomePage() {
  return (
    <main className="flex min-h-svh flex-col bg-[#0A0A0A] text-white">
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <BrandLogo
            imgClassName="h-5 w-auto invert"
            fallbackClassName="size-7 rounded-md text-sm"
          />
          <BrandBadge>CRM</BrandBadge>
        </div>
        <Link
          href="/login"
          className="hidden text-sm text-white/60 underline-offset-4 hover:text-white hover:underline sm:inline"
        >
          Sign in
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-8">
        <div className="w-full max-w-6xl">
          {/* Fixed 16:9 frame: the film scales itself to fit whatever box it
              is given, so the aspect ratio has to come from here. */}
          <div
            className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-[#0A0A0A] sm:rounded-2xl"
            aria-hidden
          >
            {/* The stage always reserves 44px at the bottom for its authoring
                scrub bar, then centres the film in what's left. We hide that
                bar (globals.css), so hand the stage a box 44px taller than the
                frame — bled 22px above and below so the film ends up centred
                on the frame — and let the clip swallow the overhang. Without
                this the film is letterboxed inside its own frame. */}
            <div className="absolute inset-x-0 -top-[22px] -bottom-[22px]">
              <MaldivesAnimation />
            </div>
          </div>

          <div className="mt-7 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/50">
              Perx CRM — the sales and merchant platform behind Perx Technologies.
            </p>
            <div className="flex items-center gap-4">
              <Link
                href="https://perx.mv"
                className="text-sm text-white/50 underline-offset-4 hover:text-white hover:underline"
              >
                perx.mv
              </Link>
              <Button asChild size="lg" className="rounded-full">
                <Link href="/login">
                  Sign in <ArrowRightIcon />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
