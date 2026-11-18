import { useState } from "react";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/app-shell";
import { WebsiteContent } from "../components/website-content";
import { CaLegalManager } from "../components/ca-legal-manager";
import { CaLegalEnquiries } from "../components/ca-legal-enquiries";

const TABS = [
  { id: "services", label: "Services & menu", admin: true },
  { id: "text", label: "Page & service text", admin: true },
  { id: "wording", label: "Service page wording", admin: true },
  { id: "enquiries", label: "Enquiries", admin: false },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Everything for the CA & Legal pages of the website in one place: what is offered, how it reads, and who has asked. */
export function CaLegalPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const tabs = TABS.filter((t) => isAdmin || !t.admin);
  const [tab, setTab] = useState<TabId>(isAdmin ? "services" : "enquiries");

  return (
    <>
      <PageHeader title="CA & Legal" subtitle="The CA & Legal pages of the website: what is offered, how it reads, and who has asked" />
      <div className="px-4 py-4 lg:px-6">
        <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold transition",
                tab === t.id ? "border-navy text-navy" : "border-transparent text-muted hover:text-navy",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "services" && isAdmin && <CaLegalManager />}
        {tab === "text" && isAdmin && <WebsiteContent scope="calegal" />}
        {tab === "wording" && isAdmin && <WebsiteContent scope="servicepages" />}
        {tab === "enquiries" && <CaLegalEnquiries />}
      </div>
    </>
  );
}
