
'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobApplication } from "@/lib/types";
import { Button } from "../ui/button";
import { FileText } from "lucide-react";

interface CandidateDocumentsCardProps {
  application: JobApplication;
}

export function CandidateDocumentsCard({ application }: CandidateDocumentsCardProps) {
  const hasDocuments = application.cvUrl || application.ijazahUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumen Kandidat</CardTitle>
      </CardHeader>
      <CardContent>
        {hasDocuments ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {application.cvUrl && (
              <Button asChild variant="outline">
                <a href={application.cvUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-2 h-4 w-4" />
                  Lihat CV
                </a>
              </Button>
            )}
            {application.ijazahUrl && (
              <Button asChild variant="outline">
                <a href={application.ijazahUrl} target="_blank" rel="noopener noreferrer">
                  <FileText className="mr-2 h-4 w-4" />
                  Lihat Ijazah/SKL
                </a>
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Kandidat belum mengunggah dokumen yang diminta.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
