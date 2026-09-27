import { useState, useCallback, useEffect } from "react";
import PatientSidebar, { type PatientData } from "@/components/PatientSidebar";
import UploadZone from "@/components/UploadZone";
import ManualRxEntry, { type ManualMedication } from "@/components/ManualRxEntry";
import VerdictCards, { type VerdictData } from "@/components/VerdictCards";
import LoadingOverlay from "@/components/LoadingOverlay";
import { analyzePrescriptionWithGemini } from "@/lib/geminiClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, PenLine, Stethoscope, Upload, Zap } from "lucide-react";

const defaultPatient: PatientData = {
  name: "",
  age: "",
  gender: "male",
  weight: "",
  bloodGroup: "",
  allergies: [],
  conditions: [],
};

export default function Dashboard() {
  const [patient, setPatient] = useState<PatientData>(defaultPatient);

  // Upload state
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reportPreview, setReportPreview] = useState<string | null>(null);
  const [rxFile, setRxFile] = useState<File | null>(null);
  const [rxPreview, setRxPreview] = useState<string | null>(null);

  // Rx input mode
  const [rxMode, setRxMode] = useState<"upload" | "manual">("upload");
  const [manualMeds, setManualMeds] = useState<ManualMedication[]>([]);

  // AI instructions
  const [instructions, setInstructions] = useState("");

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [verdict, setVerdict] = useState<VerdictData | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const hasPrescriptionInput =
    rxMode === "upload" ? rxFile !== null : manualMeds.some((m) => m.name.trim() !== "");
  const hasCorePatientInfo = patient.age.trim() !== "" && patient.weight.trim() !== "";
  const canAnalyze = hasCorePatientInfo && hasPrescriptionInput;

  const handleAnalyze = useCallback(async () => {
    if (!canAnalyze) return;

    setAnalysisError(null);
    setVerdict(null);
    setAnalyzing(true);
    setLoadingStep(0);

    try {
      const result = await analyzePrescriptionWithGemini({
        patient,
        reportFile,
        prescriptionFile: rxMode === "upload" ? rxFile : null,
        manualMedications: rxMode === "manual" ? manualMeds : [],
        instructions,
      });

      setVerdict(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed. Please try again.";
      setAnalysisError(message);
    } finally {
      setAnalyzing(false);
    }
  }, [canAnalyze, instructions, manualMeds, patient, reportFile, rxFile, rxMode]);

  // Keep progress indicator moving while request is in flight
  useEffect(() => {
    if (!analyzing) return;

    const timer = setInterval(() => setLoadingStep((s) => (s + 1) % 5), 900);
    return () => clearInterval(timer);
  }, [analyzing]);

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <PatientSidebar patient={patient} onChange={setPatient} />

      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* Header */}
        <header className="border-b border-border bg-card px-4 py-4 sticky top-0 z-10 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-foreground leading-tight sm:text-lg">
                  Clinical Intelligence & Prescription Validator
                </h1>
                <p className="text-xs text-muted-foreground">
                  AI-powered dosage analysis and validation system
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 space-y-6 max-w-5xl sm:p-6">
          {/* Upload Section */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Analysis Command Center
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UploadZone
                title="Lab / Diagnostic Reports"
                subtitle="PDF, JPG, PNG - blood work, imaging, etc."
                accept=".pdf,.jpg,.jpeg,.png"
                icon="report"
                file={reportFile}
                preview={reportPreview}
                onFileChange={(f, p) => {
                  setReportFile(f);
                  setReportPreview(p);
                }}
              />

              <div className="space-y-2">
                {/* Toggle between Upload and Manual */}
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setRxMode("upload")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                      rxMode === "upload"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Rx
                  </button>
                  <button
                    onClick={() => setRxMode("manual")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                      rxMode === "manual"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <PenLine className="w-3.5 h-3.5" /> Write Manually
                  </button>
                </div>

                {rxMode === "upload" ? (
                  <UploadZone
                    title="Current Prescription"
                    subtitle="JPG, PNG - handwritten or printed Rx"
                    accept=".jpg,.jpeg,.png"
                    icon="prescription"
                    file={rxFile}
                    preview={rxPreview}
                    onFileChange={(f, p) => {
                      setRxFile(f);
                      setRxPreview(p);
                    }}
                  />
                ) : (
                  <ManualRxEntry medications={manualMeds} onChange={setManualMeds} />
                )}
              </div>
            </div>
          </section>

          {/* AI Instructions */}
          <section>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Special Instructions for AI
            </Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g., Check if this dosage is safe given the patient's low creatinine levels in the report..."
              className="mt-1.5 bg-card text-sm resize-none"
              rows={3}
            />
            {!hasCorePatientInfo && (
              <p className="mt-2 text-xs text-muted-foreground">
                Add at least age and weight so dosage checks can be clinically meaningful.
              </p>
            )}
          </section>

          {/* Analyze Button */}
          <Button
            size="lg"
            disabled={!canAnalyze || analyzing}
            onClick={handleAnalyze}
            className="w-full md:w-auto px-8 gap-2 font-semibold"
          >
            <Zap className="w-4 h-4" />
            {analyzing ? "Analyzing..." : "Analyze and Validate Dosage"}
          </Button>

          {/* Output */}
          {analyzing && <LoadingOverlay step={loadingStep} />}
          {verdict && !analyzing && <VerdictCards data={verdict} />}
          {analysisError && !analyzing && (
            <Alert variant="destructive" className="bg-card">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Analysis failed</AlertTitle>
              <AlertDescription>{analysisError}</AlertDescription>
            </Alert>
          )}

          {/* Empty state */}
          {!verdict && !analyzing && !analysisError && (
            <div className="border border-dashed border-border rounded-lg py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <Stethoscope className="w-8 h-8" />
              <p className="text-sm font-medium">No analysis yet</p>
              <p className="text-xs">Upload a prescription and click "Analyze" to begin</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
