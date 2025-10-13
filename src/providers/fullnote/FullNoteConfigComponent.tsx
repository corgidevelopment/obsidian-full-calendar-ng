import * as React from 'react';
import { DirectorySelect } from '../../ui/components/forms/DirectorySelect';
import { FullNoteProviderConfig } from './typesLocal';
import { ProviderConfigContext } from '../typesProvider';
import { t } from '../../features/i18n/i18n';

interface FullNoteConfigComponentProps {
  config: Partial<FullNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<FullNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: FullNoteProviderConfig) => void;
  onClose: () => void; // Required prop
}

export const FullNoteConfigComponent: React.FC<FullNoteConfigComponentProps> = ({
  config,
  onConfigChange,
  context,
  onSave,
  onClose // Destructuring the new prop
}) => {
  const [directory, setDirectory] = React.useState(config.directory || '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!directory) return;

    setIsSubmitting(true);
    onSave({ ...config, id: config.id || '', directory });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">
            {t('settings.calendars.fullNote.directory.label')}
          </div>
          <div className="setting-item-description">
            {t('settings.calendars.fullNote.directory.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <DirectorySelect
            value={directory}
            onChange={newValue => {
              setDirectory(newValue);
              onConfigChange({ ...config, directory: newValue });
            }}
            directories={context.allDirectories}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button className="mod-cta" type="submit" disabled={isSubmitting || !directory}>
            {t('ui.buttons.addCalendar')}
          </button>
        </div>
      </div>
    </form>
  );
};
