/**
 * @file Changelog.tsx
 * @brief React component for displaying the full, interactive changog.
 *
 * @description
 * This component renders a list of versions from the changelogData, each with a
 * collapsible section for its changes. It manages its own state for which
 * sections are expanded.
 *
 * @license See LICENSE.md
 */

import { useState, useRef, useEffect } from 'react';
import { changelogData } from '../changelogData';
import { Setting } from 'obsidian';
import '../changelog.css';

import { renderFooter } from './renderFooter';

interface ChangelogProps {
  onBack: () => void;
}

interface VersionSectionProps {
  version: (typeof changelogData)[0];
  isInitiallyOpen: boolean;
}

const VersionSection = ({ version, isInitiallyOpen }: VersionSectionProps) => {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div className="full-calendar-version-container">
      <div
        className={`full-calendar-version-header ${isOpen ? 'is-open' : ''}`}
        onClick={toggleOpen}
      >
        <h3>Version {version.version}</h3>
      </div>
      <div className={`full-calendar-version-content ${isOpen ? '' : 'is-collapsed'}`}>
        {version.changes.map((change, idx) => (
          <div className={`full-calendar-change-item change-type-${change.type}`} key={idx}>
            <div className="change-icon">
              {change.type === 'new' && '✨'}
              {change.type === 'improvement' && '🔧'}
              {change.type === 'fix' && '🐛'}
            </div>
            <div className="change-content">
              <div className="change-title">{change.title}</div>
              <div className="change-description">{change.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Changelog = ({ onBack }: ChangelogProps) => {
  const settingRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settingRef.current) {
      settingRef.current.empty(); // Clear on re-render
      new Setting(settingRef.current).setName('Changelog').setHeading();
    }
    if (footerRef.current) {
      footerRef.current.empty();
      renderFooter(footerRef.current);
    }
  }, []); // Run only once on mount

  return (
    <div className="full-calendar-changelog-wrapper">
      <div className="full-calendar-changelog-header">
        <button onClick={onBack}>{'<'}</button>
        {/* Using a Setting for consistent styling with the rest of the tab */}
        <div style={{ flexGrow: 1 }} ref={settingRef}></div>
      </div>
      {changelogData.map((version, index) => (
        <VersionSection key={version.version} version={version} isInitiallyOpen={index === 0} />
      ))}
      <div ref={footerRef}></div>
    </div>
  );
};
