import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CandidateRegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Segera Hadir</CardTitle>
          <CardDescription>
            Halaman pendaftaran untuk kandidat baru sedang dalam pengembangan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/careers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali ke Halaman Karir
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
