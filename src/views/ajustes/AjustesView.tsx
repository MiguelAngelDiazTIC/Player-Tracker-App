import { AboutPanel } from "./AboutPanel";
import { AppearancePanel } from "./AppearancePanel";
import { AutoBackupPanel } from "./AutoBackupPanel";
import { BackupPanel } from "./BackupPanel";
import { DataFolderPanel } from "./DataFolderPanel";
import { ExportPanel } from "./ExportPanel";
import { FieldsPanel } from "./FieldsPanel";
import { HelpPanel } from "./HelpPanel";
import { SheetImportPanel } from "./SheetImportPanel";

interface AjustesViewProps {
  onShowTutorial: () => void;
}

export function AjustesView({ onShowTutorial }: AjustesViewProps) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 relative overflow-auto lg:grid-cols-2">
      <DataFolderPanel />
      <BackupPanel />
      <ExportPanel />
      <AutoBackupPanel />
      <AppearancePanel />
      <HelpPanel onShowTutorial={onShowTutorial} />
      <div id="importar-hoja" className="lg:col-span-2">
        <SheetImportPanel />
      </div>
      <div className="lg:col-span-2">
        <FieldsPanel />
      </div>
      <div className="lg:col-span-2">
        <AboutPanel />
      </div>
    </div>
  );
}
