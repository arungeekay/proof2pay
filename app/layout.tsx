import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { switchPersona } from "@/app/actions";
import { MainNav } from "@/components/main-nav";
import { PersonaSwitcher } from "@/components/persona-switcher";
import { SimTag, Tag } from "@/components/status";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/format";
import { paypalConfigured } from "@/lib/paypal/client";
import { currentUser, listPersonas } from "@/lib/session";
import "./globals.css";

const fontSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const fontMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Proof2Pay",
  description: "Every shipment, every promise, every payment: verified. Contracts, delivery proof and PayPal settlement for B2B logistics.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [user, personas, pending] = await Promise.all([currentUser(), listPersonas(), db.approvalRequest.count({ where: { status: "PENDING" } })]);
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="antialiased">
        <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
            <Link href="/" className="text-primary text-lg font-semibold tracking-tight">
              Proof2Pay
            </Link>
            <MainNav pending={pending} />
            <div className="ml-auto flex items-center gap-3">
              {paypalConfigured() ? <Tag tone="info">PayPal sandbox</Tag> : <SimTag>PayPal mocked</SimTag>}
              <PersonaSwitcher
                currentId={user.id}
                action={switchPersona}
                personas={personas.map((p) => ({ id: p.id, label: `${p.name} · ${ROLE_LABEL[p.role]}` }))}
              />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="text-muted-foreground mx-auto max-w-7xl px-4 pb-8 text-xs">
          Demo data is fictional. PayPal runs in sandbox only. The insurer is simulated, and Indian domestic payments are manually verified records.
        </footer>
      </body>
    </html>
  );
}
