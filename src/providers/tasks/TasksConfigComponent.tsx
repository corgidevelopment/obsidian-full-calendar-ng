/**
 * @file TasksConfigComponent.tsx
 * @brief Configuration component for the Tasks provider.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { TasksProviderConfig } from './typesTask';
import { ProviderConfigContext } from '../typesProvider';

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
          <div className="setting-item-name">Zero Configuration Required</div>
          <div className="setting-item-description">
            This provider automatically reads your existing Obsidian Tasks plugin settings. All
            tasks with due dates will be displayed on the calendar as read-only events.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">Calendar Name</div>
            <div className="setting-item-description">Display name for this calendar</div>
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
            <div className="setting-item-name">Read-Only Calendar</div>
            <div className="setting-item-description">
              Tasks can be viewed but not modified through the calendar interface. To edit tasks,
              use the Tasks plugin or modify your notes directly.
            </div>
          </div>
        </div>

        <div className="setting-item">
          <button type="submit" className="mod-cta" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Adding...' : 'Add Calendar'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ marginLeft: '10px' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
