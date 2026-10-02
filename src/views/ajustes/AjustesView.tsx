import { AppearancePanel } from "./AppearancePanel";
import { BackupPanel } from "./BackupPanel";
import { DataFolderPanel } from "./DataFolderPanel";
import { FieldsPanel } from "./FieldsPanel";
import { SheetImportPanel } from "./SheetImportPanel";
import { SyncPanel } from "./SyncPanel";

export function AjustesView() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 relative overflow-auto lg:grid-cols-2">
      <DataFolderPanel />
      <BackupPanel />
      <div className="lg:col-span-2">
        <AppearancePanel />
      </div>
      <div className="lg:col-span-2">
        <SyncPanel />
      </div>
      <div className="lg:col-span-2">
        <SheetImportPanel />
      </div>
      <div className="lg:col-span-2">
        <FieldsPanel />
      </div>
    </div>
  );
}
