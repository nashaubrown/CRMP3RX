import { ConstructionIcon } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader className="items-center py-10 text-center">
          <ConstructionIcon className="text-muted-foreground mx-auto mb-2 size-8" />
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>This area ships in {phase}.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
