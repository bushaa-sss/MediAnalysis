import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const STEPS = [
  "Enhancing prescription image for OCR...",
  "Extracting medications from prescription...",
  "Fuzzy-matching medicines against formulary...",
  "Cross-referencing with lab reports...",
  "Validating dosages against patient profile...",
];

export default function LoadingOverlay({ step }: { step: number }) {
  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-3 h-3 rounded-full bg-primary clinical-pulse" />
          <span className="text-sm font-medium text-foreground">
            {STEPS[Math.min(step, STEPS.length - 1)]}
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Skeleton cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
