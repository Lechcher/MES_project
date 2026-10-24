import { QuickAddView } from "@/components/jobs/quick-add-view";

// The viewer is resolved in the browser from `/api/mes/session`, so this screen
// has no prerendered content. Declaring the segment as allowed to block stops the
// framework from reporting it as an unrenderable segment during validation.

export default function QuickAddPage() {
  return <QuickAddView />;
}
