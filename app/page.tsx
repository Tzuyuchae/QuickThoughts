import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const mockMemos = [
  { id: "1", title: "Morning dump", status: "ready", date: "Today" },
  { id: "2", title: "Work ideas", status: "classifying", date: "Yesterday" },
  { id: "3", title: "Errands", status: "ready", date: "Jan 18" },
];

export default function HomePage() {
  return (
    <AppShell
      title="Home"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Record a memo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Up to 2 minutes. We’ll transcribe and organize it.
            </p>
            <Button className="w-full">Start Recording</Button>
            <Button variant="outline" className="w-full">
              Upload Audio (later)
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Recent memos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockMemos.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <div className="text-sm font-medium">{m.title}</div>
                  <div className="text-xs text-muted-foreground">{m.date}</div>
                </div>
                <div className="text-xs text-muted-foreground">{m.status}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}