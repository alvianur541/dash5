import { useCallback, useState } from 'react';
import { UnitModel } from '../types';

// Switching unit mid-chat starts a fresh session, so ask first when messages exist.
export function useModelSwitch(opts: {
  selected: UnitModel;
  hasMessages: boolean;
  onSwitch: (model: UnitModel) => void;
}) {
  const { selected, hasMessages, onSwitch } = opts;
  const [modelSheet, setModelSheet] = useState(false);
  const [switchConfirm, setSwitchConfirm] = useState<UnitModel | null>(null);

  const handleSelectModel = useCallback((model: UnitModel) => {
    setModelSheet(false);
    if (model === selected) return;
    if (hasMessages) { setSwitchConfirm(model); return; }
    onSwitch(model);
  }, [selected, hasMessages, onSwitch]);

  const confirmSwitch = useCallback(() => {
    const model = switchConfirm;
    setSwitchConfirm(null);
    if (model) onSwitch(model);
  }, [switchConfirm, onSwitch]);

  return { modelSheet, setModelSheet, switchConfirm, setSwitchConfirm, handleSelectModel, confirmSwitch };
}
