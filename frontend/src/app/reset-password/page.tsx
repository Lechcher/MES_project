import { Suspense } from "react";
import {
  ResetPasswordCardTitle,
  ResetPasswordForm,
} from "@/components/auth/reset-password-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Public password-reset route.
 *
 * Deliberately outside the `(app)` group: the visitor has no session, so the
 * authenticated shell and its viewport guard must not apply. The form reads the
 * token from the URL, which requires a Suspense boundary so the rest of the route
 * can still be prerendered. The card title is a client component so it renders
 * in the active locale.
 */
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <ResetPasswordCardTitle />
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="grid gap-4" aria-hidden="true">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
