/**
 * @file TasksConfigComponent.tsx
 * @brief Configuration component for the Tasks provider.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { TasksProviderConfig } from './typesTask';
import { ProviderConfigContext } from '../typesProvider';
import { t } from '../../features/i18n/i18n';

interface TasksConfigComponentProps {
  config: Partial<TasksProviderConfig>;
  onConfigChange: (newConfig: Partial<TasksProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: TasksProviderConfig) => void;
  onClose: () => void;
}

export const TasksConfigComponent: React.FC<TasksConfigComponentProps> = ({
  config,
  onConfigChange,
  context,
  onSave,
  onClose
}) => {
  const [name, setName] = React.useState(config.name || 'Obsidian Tasks');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);
    onSave({ ...config, id: config.id || '', name });
  };

  return (
    <div className="tasks-provider-config">
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.tasks.zeroConfig.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.tasks.zeroConfig.description')}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">
              {t('settings.calendars.tasks.calendarName.label')}
            </div>
            <div className="setting-item-description">
              {t('settings.calendars.tasks.calendarName.description')}
            </div>
          </div>
          <div className="setting-item-control">
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                onConfigChange({ ...config, name: e.target.value });
              }}
              placeholder="Obsidian Tasks"
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('settings.calendars.tasks.readOnly.label')}</div>
            <div className="setting-item-description">
              {t('settings.calendars.tasks.readOnly.description')}
            </div>
          </div>
        </div>

        <div className="setting-item">
          <button type="submit" className="mod-cta" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? t('settings.calendars.tasks.adding') : t('ui.buttons.addCalendar')}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{}}
            className="u-ml-10px"
          >
            {t('settings.calendars.tasks.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
};
