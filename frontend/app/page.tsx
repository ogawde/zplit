import { ZplitDashboard } from "@/components/dashboard/zplit-dashboard";
import { SiteHeader } from "@/components/layout/site-header";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <ZplitDashboard
        key={resolvedSearchParams.tab ?? "teams"}
        initialTab={resolvedSearchParams.tab}
      />
    </div>
  );
}
