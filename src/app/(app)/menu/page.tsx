import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { Icon } from "../../../components/icons";
import { NAV_SECTIONS } from "../../../components/nav-data";
import { PageHeader } from "../../../components/ui";

export default async function MenuPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const sections = NAV_SECTIONS[session.role] ?? NAV_SECTIONS.WORKER;

  return (
    <>
      <PageHeader title="Menu" sub={`Everything in ShiftPay, ${session.name.split(" ")[0]}.`} />
      {sections.map((section) => (
        <div key={section.label} className="rise mb-6">
          <h2 className="mb-2 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {section.label}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-4 py-3.5 text-sm font-medium hover:border-accent hover:text-accent"
              >
                <Icon name={item.icon} className="size-4.5" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
