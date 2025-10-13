import * as React from 'react';
import { HeadingInput } from '../../ui/components/forms/HeadingInput';
import { DailyNoteProviderConfig } from './typesDaily';
import { ProviderConfigContext } from '../typesProvider';
import { t } from '../../features/i18n/i18n';

interface DailyNoteConfigComponentProps {
  config: Partial<DailyNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<DailyNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: DailyNoteProviderConfig) => void;
  onClose: () => void; // Required prop
}

export const DailyNoteConfigComponent: React.FC<DailyNoteConfigComponentProps> = ({
  config,
  onConfigChange,
  context,
  onSave,
  onClose // Destructure prop
}) => {
  const [heading, setHeading] = React.useState(config.heading || '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!heading) return;

    setIsSubmitting(true);
    onSave({ ...config, id: config.id || '', heading });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.dailyNote.heading.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.dailyNote.heading.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <HeadingInput
            value={heading}
            onChange={newValue => {
              setHeading(newValue);
              onConfigChange({ ...config, heading: newValue });
            }}
            headings={context.headings}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button className="mod-cta" type="submit" disabled={isSubmitting || !heading}>
            {t('ui.buttons.addCalendar')}
          </button>
        </div>
      </div>
    </form>
  );
};
