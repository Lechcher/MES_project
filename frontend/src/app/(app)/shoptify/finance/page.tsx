import { FinancePanel } from "@/components/shoptify/finance-panel";
import { ShoptifyScreen } from "@/components/shoptify/shoptify-screen";

// The viewer is resolved in the browser from `/api/mes/session`, so this screen
// has no prerendered content. Declaring the segment as allowed to block stops the
// framework from reporting it as an un-renderable segment during validation.

export default function ShoptifyFinancePage() {
  return (
    <ShoptifyScreen>
      <FinancePanel />
    </ShoptifyScreen>
  );
}
