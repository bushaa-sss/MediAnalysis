import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Image, Upload, X } from "lucide-react";

interface UploadZoneProps {
  title: string;
  subtitle: string;
  accept: string;
  icon: "report" | "prescription";
  file: File | null;
  preview: string | null;
  onFileChange: (file: File | null, preview: string | null) => void;
}

export default function UploadZone({ title, subtitle, accept, icon, file, preview, onFileChange }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => onFileChange(f, reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const clear = () => {
    onFileChange(null, null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const Icon = icon === "report" ? FileText : Image;

  return (
    <Card className="shadow-none border-border">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {preview ? (
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
            {file?.type === "application/pdf" ? (
              <div className="flex items-center gap-2 p-4">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-sm font-medium truncate max-w-[180px]">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : (
              <img src={preview} alt="Preview" className="w-full h-40 object-contain bg-secondary" />
            )}
            <button
              onClick={clear}
              className="absolute top-2 right-2 bg-card rounded-full p-1 shadow border border-border hover:bg-secondary"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
              dragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-accent/50"
            }`}
          >
            <Upload className="w-6 h-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground text-center">
              Drag & drop or <span className="text-primary font-medium">browse</span>
            </p>
            <p className="text-[10px] text-muted-foreground">{accept}</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </CardContent>
    </Card>
  );
}
