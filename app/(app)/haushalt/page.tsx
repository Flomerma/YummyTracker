import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AbmeldeFormular } from "@/components/abmelde-formular";
import { AnzeigenameFormular } from "@/components/haushalt/anzeigename";
import { EinladungErzeugen } from "@/components/haushalt/einladung";
import { Button, Card, Notice, PageHeader } from "@/components/ui";
import { currentContext } from "@/lib/services/current";
import { loadHouseholdOverview } from "@/lib/services/household";

import { mitgliedEntfernenAction } from "./actions";

export const metadata: Metadata = {
  title: "Haushalt — yummytracker",
};

export default async function HaushaltSeite() {
  const context = await currentContext();
  if (context.state !== "ready") redirect("/");

  const overview = await loadHouseholdOverview(context.household.id);

  if (!overview.ok) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Haushalt" />
        <Notice tone="error">{overview.message}</Notice>
      </div>
    );
  }

  const { household, members, me } = overview.data;
  const istEigentuemer = me.role === "owner";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={household.name}
        subtitle={
          members.length === 1
            ? "Du bist allein hier. Lad jemanden ein, dann seht ihr denselben Vorrat."
            : `${members.length} Mitglieder`
        }
      />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">
          Mitglieder
        </h2>
        <ul className="flex flex-col">
          {members.map((member) => {
            const ichSelbst = member.userId === me.userId;
            return (
              <li
                key={member.userId}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-100 py-2 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-neutral-900">
                    {member.displayName ?? "Ohne Namen"}
                    {ichSelbst && (
                      <span className="text-neutral-400"> · du</span>
                    )}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {member.role === "owner" ? "Eigentümer" : "Mitglied"}
                  </span>
                </span>

                {/*
                  Entfernen kann nur der Eigentuemer, und sich selbst nicht.
                  Beides prueft die Dienstschicht ohnehin nach; der Knopf
                  fehlt hier nur, damit niemand auf etwas klickt, das dann
                  abgelehnt wird.
                */}
                {istEigentuemer && !ichSelbst && (
                  <form action={mitgliedEntfernenAction}>
                    <input type="hidden" name="userId" value={member.userId} />
                    <Button type="submit" variant="danger">
                      Entfernen
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">
          Jemanden einladen
        </h2>
        <EinladungErzeugen />
      </Card>

      <Card>
        <AnzeigenameFormular aktuell={me.displayName} />
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Konto</h2>
        <AbmeldeFormular />
      </Card>
    </div>
  );
}
