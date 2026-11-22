import { Suspense } from "react";
import {
  ConfirmEmailCardTitle,
  ConfirmEmailForm,
} from "@/components/auth/confirm-email-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Public email-change confirmation route.
 *
 * Deliberately outside the `(app)` group like `/reset-password`: the visitor
 * opens the link from their mailbox, possibly in a browser with no session.
 * The token binds the change to the account that requested it, so no sign-in
 * is required. Reading the token from the URL needs a Suspense boundary so
 * the rest of the route can still be prerendered.
 */
export default function ConfirmEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <ConfirmEmailCardTitle />
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="grid gap-4" aria-hidden="true">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full" />
              </div>
            }
          >
            <ConfirmEmailForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
