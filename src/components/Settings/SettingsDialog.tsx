import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { EncryptionSettings } from "./Security";
import { UpdateSettings } from "./Updates";

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Settings" onClose={() => { if (!busy) onClose(); }}>
      <EncryptionSettings setBusy={setBusy} />
      <UpdateSettings setBusy={setBusy} />
    </Dialog>
  );
}
