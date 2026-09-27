import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Plus, User, AlertTriangle, Heart } from "lucide-react";

export interface PatientData {
  name: string;
  age: string;
  gender: "male" | "female" | "other";
  weight: string;
  bloodGroup: string;
  allergies: string[];
  conditions: string[];
}

interface PatientSidebarProps {
  patient: PatientData;
  onChange: (patient: PatientData) => void;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const COMMON_ALLERGIES = ["Penicillin", "NSAIDs", "Sulfa", "Aspirin", "Ibuprofen", "Latex"];
const COMMON_CONDITIONS = ["Diabetes", "Hypertension", "CKD", "Asthma", "Heart Disease", "Thyroid"];

export default function PatientSidebar({ patient, onChange }: PatientSidebarProps) {
  const [newAllergy, setNewAllergy] = useState("");
  const [newCondition, setNewCondition] = useState("");

  const update = (patch: Partial<PatientData>) => onChange({ ...patient, ...patch });

  const addAllergy = () => {
    if (newAllergy.trim()) {
      update({ allergies: [...patient.allergies, newAllergy.trim()] });
      setNewAllergy("");
    }
  };

  const removeAllergy = (i: number) =>
    update({ allergies: patient.allergies.filter((_, idx) => idx !== i) });

  const addCondition = () => {
    if (newCondition.trim()) {
      update({ conditions: [...patient.conditions, newCondition.trim()] });
      setNewCondition("");
    }
  };

  const removeCondition = (i: number) =>
    update({ conditions: patient.conditions.filter((_, idx) => idx !== i) });

  return (
    <aside className="w-full min-w-0 bg-clinical-sidebar border-b border-clinical-sidebar-border lg:w-80 lg:min-w-[320px] lg:border-b-0 lg:border-r lg:overflow-y-auto lg:h-screen lg:sticky lg:top-0">
      <div className="p-4 border-b border-clinical-sidebar-border sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Patient Profile
          </h2>
        </div>
      </div>

      <div className="p-4 space-y-5 sm:p-5">
        {/* Basic Info */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Full Name</Label>
            <Input
              value={patient.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Patient name"
              className="mt-1 bg-card"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Age</Label>
              <Input
                type="number"
                value={patient.age}
                onChange={(e) => update({ age: e.target.value })}
                placeholder="Years"
                className="mt-1 bg-card"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Weight (kg)</Label>
              <Input
                type="number"
                value={patient.weight}
                onChange={(e) => update({ weight: e.target.value })}
                placeholder="kg"
                className="mt-1 bg-card"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gender</Label>
            <div className="flex gap-1 mt-1">
              {(["male", "female", "other"] as const).map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={patient.gender === g ? "default" : "outline"}
                  className="flex-1 capitalize text-xs"
                  onClick={() => update({ gender: g })}
                >
                  {g}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Blood Group</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {BLOOD_GROUPS.map((bg) => (
                <Button
                  key={bg}
                  size="sm"
                  variant={patient.bloodGroup === bg ? "default" : "outline"}
                  className="text-xs px-2 py-1 h-7"
                  onClick={() => update({ bloodGroup: bg })}
                >
                  {bg}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Allergies */}
        <Card className="border-clinical-alert-border bg-clinical-alert-bg shadow-none">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-clinical-danger">
              <AlertTriangle className="w-3.5 h-3.5" />
              Critical Allergies
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {patient.allergies.map((a, i) => (
                <Badge
                  key={i}
                  variant="destructive"
                  className="text-xs cursor-pointer gap-1"
                  onClick={() => removeAllergy(i)}
                >
                  {a} <X className="w-3 h-3" />
                </Badge>
              ))}
              {patient.allergies.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No allergies listed</span>
              )}
            </div>
            {/* Quick-add chips */}
            <div className="flex flex-wrap gap-1 mb-2">
              {COMMON_ALLERGIES.filter((a) => !patient.allergies.includes(a)).map((a) => (
                <button
                  key={a}
                  onClick={() => update({ allergies: [...patient.allergies, a] })}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-clinical-alert-border text-muted-foreground hover:text-clinical-danger hover:border-clinical-danger transition-colors"
                >
                  + {a}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={newAllergy}
                onChange={(e) => setNewAllergy(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAllergy()}
                placeholder="Type custom allergy..."
                className="text-xs h-7 bg-card"
              />
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={addAllergy}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Medical History */}
        <Card className="shadow-none border-border">
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground">
              <Heart className="w-3.5 h-3.5" />
              Medical History
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
              {patient.conditions.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-secondary rounded px-2 py-1"
                >
                  <span className="text-xs text-secondary-foreground">{c}</span>
                  <button onClick={() => removeCondition(i)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {patient.conditions.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No conditions listed</span>
              )}
            </div>
            {/* Quick-add chips */}
            <div className="flex flex-wrap gap-1 mb-2">
              {COMMON_CONDITIONS.filter((c) => !patient.conditions.includes(c)).map((c) => (
                <button
                  key={c}
                  onClick={() => update({ conditions: [...patient.conditions, c] })}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                >
                  + {c}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={newCondition}
                onChange={(e) => setNewCondition(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCondition()}
                placeholder="Type custom condition..."
                className="text-xs h-7 bg-card"
              />
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={addCondition}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}
