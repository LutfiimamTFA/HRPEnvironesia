import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DocumentsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumen</CardTitle>
        <CardDescription>Kelola CV, portofolio, dan dokumen pendukung lainnya.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center p-8 border rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            Fitur unggah dokumen sedang dalam tahap pengembangan.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
