import { ZplitDashboard } from "@/components/dashboard/zplit-dashboard";
import { PageShell } from "@/components/layout/page-shell";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;

  return (
    <PageShell contentClassName="max-w-6xl">
      <ZplitDashboard
        key={resolvedSearchParams.tab ?? "teams"}
        initialTab={resolvedSearchParams.tab}
      />
    </PageShell>
  );
}
