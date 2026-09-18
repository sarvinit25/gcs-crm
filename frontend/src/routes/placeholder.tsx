import { Construction } from "lucide-react";
import { PageHeader } from "../components/app-shell";

/** Stands in for modules whose API isn't built yet, so the nav is complete and walkable. */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="px-6 py-5">
        <div className="card flex flex-col items-center gap-3 px-6 py-20 text-center">
          <Construction className="h-8 w-8 text-gold" />
          <div>
            <p className="font-semibold text-navy">{title} is not built yet</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">{description}</p>
          </div>
        </div>
      </div>
    </>
  );
}
