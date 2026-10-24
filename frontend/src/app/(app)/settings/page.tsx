import { SettingsView } from "@/components/settings/settings-view";

// The viewer is resolved in the browser from `/api/mes/session`, so this screen
// has no prerendered content. Declaring the segment as allowed to block stops the
// framework from reporting it as an unrenderable segment during validation.

export default function SettingsPage() {
  return <SettingsView />;
}
