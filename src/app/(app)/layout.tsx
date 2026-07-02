import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { Bell } from "../../components/Bell";
import { Nav } from "../../components/Nav";
import { UserMenu } from "../../components/UserMenu";
import { ToastProvider } from "../../components/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const unread = await prisma.notification.count({
    where: { userId: session.userId, readAt: null },
  });

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="flex flex-col gap-4 bg-night px-4 py-5 md:min-h-screen md:w-60 md:shrink-0">
          <div className="flex items-center justify-between md:block">
            <a href="/dashboard" className="block">
              <span className="font-display text-2xl font-bold tracking-tight text-white">
                ShiftPay<span className="text-accent-soft">.</span>
              </span>
              <span className="mt-0.5 hidden font-mono text-[0.6rem] uppercase tracking-[0.18em] text-night-text md:block">
                schedules · hours · payroll
              </span>
            </a>
          </div>
          <Nav role={session.role} />
          <div className="mt-auto hidden border-t border-night-line pt-3 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-night-text/70 md:block">
            Ledger no. 001 — {new Date().getFullYear()}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 flex items-center justify-end gap-3 border-b border-line bg-paper/90 px-6 py-3 backdrop-blur">
            <Bell initialUnread={unread} />
            <UserMenu name={session.name} role={session.role} />
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 md:px-8">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
