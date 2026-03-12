import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/Avenir_Logo.avif';

type AuthSceneProps = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  cardClassName?: string;
};

export function AuthScene({ title, children, footer, cardClassName }: AuthSceneProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,hsl(222,47%,11%),hsl(224,71%,11%))] text-white">
      <AuthBackdrop />

      <div className="relative z-10 flex min-h-screen">
        <aside className="pointer-events-none absolute inset-y-0 left-0 hidden w-[46%] px-12 py-14 lg:block xl:px-16">
          <div />
        </aside>

        <div className="flex w-full items-center justify-center px-6 py-10 lg:px-10">
          <div className="w-full max-w-xl">
            <div
              className={cn(
                "overflow-hidden rounded-[1.75rem] bg-white/[0.98] text-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.34)] backdrop-blur-xl",
                cardClassName,
              )}
            >
              <div className="h-[1.5px] w-full bg-gradient-to-r from-blue-700 via-blue-800 to-blue-700" />
              <div className="px-8 py-10 sm:px-10 sm:py-12">
                <div className="mb-10 flex justify-center">
                  <img src={logo} alt="Avenir Engineering" className="h-12 w-auto sm:h-14" />
                </div>
                <div className="mb-8 text-center">
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h2>
                </div>
                {children}
              </div>
            </div>
            <div className="mt-6 text-center text-xs tracking-wide text-white/40">
              {footer || `© ${new Date().getFullYear()} Avenir Engineering`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MicrosoftSignInButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group inline-flex w-full items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-left text-white transition-all duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex items-center gap-4">
        <MicrosoftMark />
        <span className="text-base font-medium">{children || 'Sign in with Microsoft'}</span>
      </span>
      <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
    </button>
  );
}

function MicrosoftMark() {
  return (
    <span className="grid h-5 w-5 grid-cols-2 gap-[2px] rounded-[4px] bg-white/8 p-[1px]">
      <span className="rounded-[1px] bg-[#f25022]" />
      <span className="rounded-[1px] bg-[#7fba00]" />
      <span className="rounded-[1px] bg-[#00a4ef]" />
      <span className="rounded-[1px] bg-[#ffb900]" />
    </span>
  );
}

function AuthBackdrop() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:50px_50px]" />
      <div className="pointer-events-none absolute -left-20 top-20 h-72 w-72 animate-[floatOrb_14s_ease-in-out_infinite] rounded-full bg-blue-600/18 blur-3xl" />
      <div className="pointer-events-none absolute right-20 top-28 h-56 w-56 animate-[floatOrb_18s_ease-in-out_infinite_reverse] rounded-full bg-cyan-400/14 blur-3xl" />
      <div className="pointer-events-none absolute bottom-24 right-[28%] h-64 w-64 animate-[floatOrb_16s_ease-in-out_infinite] rounded-full bg-indigo-500/12 blur-3xl" />
      <div className="pointer-events-none absolute right-14 top-12 h-28 w-28 rounded-full border border-white/12" />
      <div className="pointer-events-none absolute right-28 top-24 h-12 w-12 rounded-full border border-white/10" />

      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-64 w-full opacity-40" viewBox="0 0 1440 320" fill="none" preserveAspectRatio="none">
        <path d="M0 276C136 246 251 180 394 188C537 196 588 287 745 286C902 285 978 192 1120 181C1242 171 1328 219 1440 244" stroke="rgba(96,165,250,0.45)" strokeWidth="2">
          <animate attributeName="d" dur="14s" repeatCount="indefinite" values="M0 276C136 246 251 180 394 188C537 196 588 287 745 286C902 285 978 192 1120 181C1242 171 1328 219 1440 244;M0 250C128 225 248 194 389 210C530 226 628 292 768 276C908 260 978 165 1121 161C1264 157 1334 227 1440 234;M0 276C136 246 251 180 394 188C537 196 588 287 745 286C902 285 978 192 1120 181C1242 171 1328 219 1440 244" />
        </path>
        <path d="M0 300C119 282 250 232 395 236C540 240 631 307 770 302C910 297 983 223 1127 214C1251 206 1331 242 1440 278" stroke="rgba(191,219,254,0.28)" strokeWidth="1.5">
          <animate attributeName="d" dur="18s" repeatCount="indefinite" values="M0 300C119 282 250 232 395 236C540 240 631 307 770 302C910 297 983 223 1127 214C1251 206 1331 242 1440 278;M0 290C134 270 252 212 390 224C528 236 639 316 777 310C915 304 1001 240 1137 236C1273 232 1338 260 1440 286;M0 300C119 282 250 232 395 236C540 240 631 307 770 302C910 297 983 223 1127 214C1251 206 1331 242 1440 278" />
        </path>
      </svg>
    </>
  );
}
