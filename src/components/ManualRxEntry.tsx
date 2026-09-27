import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, X, PenLine } from "lucide-react";

export interface ManualMedication {
  name: string;
  dosage: string;
  frequency: string;
  route: string;
}

interface ManualRxEntryProps {
  medications: ManualMedication[];
  onChange: (meds: ManualMedication[]) => void;
}

const emptyMed: ManualMedication = { name: "", dosage: "", frequency: "", route: "Oral" };

const COMMON_MEDS = [
  { name: "Paracetamol", dosage: "500 mg", frequency: "Three times daily", route: "Oral" },
  { name: "Amoxicillin", dosage: "500 mg", frequency: "Three times daily", route: "Oral" },
  { name: "Metformin", dosage: "500 mg", frequency: "Twice daily", route: "Oral" },
  { name: "Diclofenac", dosage: "50 mg", frequency: "Twice daily", route: "Oral" },
  { name: "Omeprazole", dosage: "20 mg", frequency: "Once daily", route: "Oral" },
];

const FREQUENCIES = ["Once daily", "Twice daily", "Three times daily", "Four times daily", "As needed"];
const ROUTES = ["Oral", "IV", "IM", "Topical", "Sublingual", "Inhaled"];

export default function ManualRxEntry({ medications, onChange }: ManualRxEntryProps) {
  const addMed = () => onChange([...medications, { ...emptyMed }]);
  const addPreset = (preset: ManualMedication) => onChange([...medications, { ...preset }]);

  const updateMed = (i: number, patch: Partial<ManualMedication>) =>
    onChange(medications.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const removeMed = (i: number) => onChange(medications.filter((_, idx) => idx !== i));

  return (
    <Card className="shadow-none border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <PenLine className="w-4 h-4 text-primary" />
          Manual Prescription Entry
        </CardTitle>
        <p className="text-xs text-muted-foreground">Type in medications, dosage & frequency</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {medications.map((med, i) => (
          <div key={i} className="bg-secondary rounded-lg p-3 space-y-2 relative">
            <button
              onClick={() => removeMed(i)}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div>
              <Label className="text-[10px] font-medium text-muted-foreground uppercase">Medication Name</Label>
              <Input
                value={med.name}
                onChange={(e) => updateMed(i, { name: e.target.value })}
                placeholder="e.g., Diclofenac Sodium"
                className="h-8 text-xs bg-card mt-0.5"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] font-medium text-muted-foreground uppercase">Dosage</Label>
                <Input
                  value={med.dosage}
                  onChange={(e) => updateMed(i, { dosage: e.target.value })}
                  placeholder="50 mg"
                  className="h-8 text-xs bg-card mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] font-medium text-muted-foreground uppercase">Frequency</Label>
                <select
                  value={med.frequency}
                  onChange={(e) => updateMed(i, { frequency: e.target.value })}
                  className="w-full h-8 text-xs bg-card mt-0.5 rounded-md border border-input px-2"
                >
                  <option value="">Select...</option>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-[10px] font-medium text-muted-foreground uppercase">Route</Label>
                <select
                  value={med.route}
                  onChange={(e) => updateMed(i, { route: e.target.value })}
                  className="w-full h-8 text-xs bg-card mt-0.5 rounded-md border border-input px-2"
                >
                  {ROUTES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        {medications.length === 0 && (
          <div className="text-center py-3 space-y-2">
            <p className="text-xs text-muted-foreground">Quick add common medications:</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {COMMON_MEDS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => addPreset(preset)}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                >
                  + {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button size="sm" variant="outline" className="w-full gap-1 text-xs" onClick={addMed}>
          <Plus className="w-3 h-3" /> Add Blank Medication
        </Button>
      </CardContent>
    </Card>
  );
}
