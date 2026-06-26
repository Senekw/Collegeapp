// Settings — connect Gemini via the browser (personal, local-only convenience).
// The key is saved server-side in the local DB; it never ships to the client.

import { ApiKeyForm } from "@/components/settings/api-key-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGeminiKeyStatus } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const status = await getGeminiKeyStatus();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Connect Gemini to enable AI scoring, profile synthesis, Spike Index
          calibration, and web-grounded program enrichment.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Gemini API key</CardTitle>
          <CardDescription>
            Stored server-side in your local database (gitignored) — it is never
            bundled into the browser, never shown back to you, and never
            committed. A key set here overrides the <code>.env.local</code> value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeyForm initialStatus={status} />
        </CardContent>
      </Card>
    </div>
  );
}
