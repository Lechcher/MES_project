"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNTS } from "@/lib/mock/db";
import { useSession } from "@/lib/mock/session";
import type { User } from "@/lib/mock/types";

const demoAccounts: User[] = DEMO_ACCOUNTS;

export default function SignInPage() {
  const { setViewer } = useSession();
  const router = useRouter();
  const [error, setError] = useState("");

  const signIn = (user: User) => {
    setError("");
    setViewer(user);
    router.push("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50">
      <Card className="w-full max-w-md shadow-none border border-border">
        <CardHeader>
          <CardTitle className="text-center">
            Sign in to MES Prototype
          </CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Select a demo account to establish your viewer session. No password
            required — mock-data prototype.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2 p-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          {demoAccounts.map((account) => (
            <Button
              key={account.id}
              variant="outline"
              className="w-full justify-between text-left border border-border hover:bg-primary hover:text-primary-foreground"
              onClick={() => signIn(account)}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{account.fullName}</span>
                <span className="text-xs inline-block px-1.5 py-0.5 rounded border border-border">
                  {account.userCode}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-xs">
                <span className="font-medium">{account.roles[0]?.code}</span>
                <span className="text-muted-foreground">
                  {account.department?.name}
                </span>
              </div>
            </Button>
          ))}
        </CardContent>
        <div className="border-t border-border p-4 text-center text-xs text-muted-foreground">
          MES Prototype &middot; mock data only &middot; session clears on
          reload
        </div>
      </Card>
      <Link
        href="/"
        className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Back to home
      </Link>
    </div>
  );
}
