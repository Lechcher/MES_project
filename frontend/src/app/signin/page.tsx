"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { demoUsers } from "@/lib/mock/db";
import { useSession } from "@/lib/mock/session";
import { useMockVersion } from "@/lib/mock/use-store";

export default function SignInPage() {
  useMockVersion();
  const { signIn } = useSession();
  const router = useRouter();
  const accounts = demoUsers();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1056px] px-6 py-16">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">
          MES Prototype
        </p>
        <h1 className="mt-3 text-4xl font-light text-foreground">
          Sign in with a demo account
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          No password is required in this mock-data prototype. Choose a role to
          explore the apps exactly as that role sees them. The session is
          ephemeral — reloading the page signs you out.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardHeader>
                <CardTitle>{account.fullName}</CardTitle>
                <CardDescription>
                  {account.roles.map((role) => role.name).join(", ")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{account.email}</p>
                <p className="text-sm text-muted-foreground">
                  {account.department?.name ?? "No department"}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {account.roles.map((role) => role.code).join(", ")}
                </p>
                <Button
                  className="mt-2"
                  onClick={() => {
                    signIn(account);
                    router.push("/");
                  }}
                >
                  Sign in as {account.roles[0].code}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
