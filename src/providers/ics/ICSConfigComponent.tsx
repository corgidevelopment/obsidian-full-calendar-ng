import * as React from 'react';
import { UrlInput } from '../../ui/components/forms/UrlInput';
import { ICSProviderConfig } from './typesICS';

interface ICSConfigComponentProps {
  config: Partial<ICSProviderConfig>;
  onConfigChange: (newConfig: Partial<ICSProviderConfig>) => void;
  onSave: (finalConfig: ICSProviderConfig) => void;
  onClose: () => void; // Required prop
}

export const ICSConfigComponent: React.FC<ICSConfigComponentProps> = ({
  config,
  onConfigChange,
  onSave,
  onClose // Destructure prop
}) => {
  const [url, setUrl] = React.useState(config.url || '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url) return;

    setIsSubmitting(true);
    onSave({ ...config, id: config.id || '', url });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">URL</div>
          <div className="setting-item-description">URL of the .ics file</div>
        </div>
        <div className="setting-item-control">
          <UrlInput
            value={url}
            onChange={newValue => {
              setUrl(newValue);
              onConfigChange({ ...config, url: newValue });
            }}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button className="mod-cta" type="submit" disabled={isSubmitting || !url}>
            Add Calendar
          </button>
        </div>
      </div>
    </form>
  );
};
