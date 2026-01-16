import * as React from 'react';
import { BasesProviderConfig } from './BasesProvider';
import { ProviderConfigContext } from '../typesProvider';
import FullCalendarPlugin from '../../main';

export interface BasesConfigComponentProps {
  plugin?: FullCalendarPlugin;
  config: Partial<BasesProviderConfig>;
  onConfigChange: (newConfig: Partial<BasesProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: BasesProviderConfig | BasesProviderConfig[]) => void;
  onClose: () => void;
}

export const BasesConfigComponent: React.FC<BasesConfigComponentProps> = ({
  plugin,
  config,
  onConfigChange,
  onSave,
  onClose
}) => {
  const [basePath, setBasePath] = React.useState(config.basePath || '');
  const [baseFiles, setBaseFiles] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!plugin) return;
    const files = plugin.app.vault.getFiles().filter(f => f.extension === 'base');
    setBaseFiles(files.map(f => f.path));
  }, [plugin]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!basePath) return;
    // Default name to filename without extension
    const name = basePath.split('/').pop()?.replace('.base', '') || 'Base';
    onSave({
      type: 'bases',
      basePath,
      name: config.name || name,
      color: config.color || '#3788d8'
    } as BasesProviderConfig);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">Select Base</div>
          <div className="setting-item-description">
            Choose a .base file to use as a calendar source.
          </div>
        </div>
        <div className="setting-item-control">
          <select
            className="dropdown"
            value={basePath}
            onChange={e => {
              setBasePath(e.target.value);
              onConfigChange({ ...config, basePath: e.target.value });
            }}
          >
            <option value="">Select a base...</option>
            {baseFiles.map(path => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-control">
          <button className="mod-cta" type="submit" disabled={!basePath}>
            Add Calendar
          </button>
        </div>
      </div>
    </form>
  );
};
