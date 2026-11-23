import { ShoptifyScreen } from "@/components/shoptify/shoptify-screen";
import { ShoptifyView } from "@/components/shoptify/shoptify-view";

// The viewer is resolved in the browser from `/api/mes/session`, so this screen
// has no prerendered content. Declaring the segment as allowed to block stops the
// framework from reporting it as an un-renderable segment during validation.

export default function ShoptifyPage() {
  return (
    <ShoptifyScreen>
      <ShoptifyView />
    </ShoptifyScreen>
  );
}
