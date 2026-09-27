import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Pill, Activity, Brain } from "lucide-react";

export interface MedicationEntry {
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  category?: string;
}

export interface DosageValidation {
  medication: string;
  status: "safe" | "caution" | "danger";
  action?: "keep" | "increase" | "decrease" | "stop" | "clarify";
  message: string;
  adjustment?: string;
}

export interface VerdictData {
  medications: MedicationEntry[];
  validations: DosageValidation[];
  reasoning: string;
}

const statusConfig = {
  safe: {
    icon: CheckCircle2,
    label: "Correct",
    dotClass: "bg-clinical-safe",
    badgeClass: "bg-clinical-safe text-clinical-safe-foreground",
  },
  caution: {
    icon: AlertTriangle,
    label: "Caution",
    dotClass: "bg-clinical-caution",
    badgeClass: "bg-clinical-caution text-clinical-caution-foreground",
  },
  danger: {
    icon: XCircle,
    label: "Danger",
    dotClass: "bg-clinical-danger",
    badgeClass: "bg-clinical-danger text-clinical-danger-foreground",
  },
};

export default function VerdictCards({ data }: { data: VerdictData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Card 1: Medication Extracted */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Pill className="w-4 h-4 text-primary" />
            Medication Extracted
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {data.medications.map((med, i) => (
              <div key={i} className="bg-secondary rounded-lg p-3">
                <p className="text-sm font-medium text-foreground">{med.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="outline" className="text-[10px]">{med.dosage}</Badge>
                  <Badge variant="outline" className="text-[10px]">{med.frequency}</Badge>
                  <Badge variant="outline" className="text-[10px]">{med.route}</Badge>
                  {med.category && (
                    <Badge variant="outline" className="text-[10px]">
                      {med.category}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Dosage Validation */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Dosage Validation
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {data.validations.map((v, i) => {
              const config = statusConfig[v.status];
              const Icon = config.icon;
              return (
                <div key={i} className="bg-secondary rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${config.dotClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">{v.medication}</span>
                        <Badge className={`text-[10px] ${config.badgeClass} border-0`}>
                          <Icon className="w-3 h-3 mr-0.5" />
                          {config.label}
                        </Badge>
                        {v.action && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {v.action}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{v.message}</p>
                      {v.adjustment && (
                        <p className="text-xs font-medium mt-1 text-foreground">{v.adjustment}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Card 3: AI Reasoning */}
      <Card className="shadow-sm border-border">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            AI Clinical Reasoning
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="bg-secondary rounded-lg p-3">
            <p className="text-xs leading-relaxed text-secondary-foreground whitespace-pre-line">
              {data.reasoning}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
