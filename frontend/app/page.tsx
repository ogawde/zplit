import { ZplitDashboard } from "@/components/dashboard/zplit-dashboard";
import { SiteHeader } from "@/components/layout/site-header";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <ZplitDashboard />
    </div>
  );
}
