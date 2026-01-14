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
import { changelogData } from './changelogData';
import { Version } from './changelogData';
import { Setting } from 'obsidian';
import './changelog.css';

import { renderFooter } from '../sections/calendars/renderFooter';

interface ChangelogProps {
  onBack: () => void;
}

interface VersionSectionProps {
  version: Version;
  isInitiallyOpen: boolean;
  embedded?: boolean;
}

const parseLinks = (text: string): React.ReactNode[] => {
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <a
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        key={match.index}
        onClick={e => e.stopPropagation()}
      >
        {match[1]}
      </a>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts;
};

export const VersionSection = ({
  version,
  isInitiallyOpen,
  embedded = false
}: VersionSectionProps) => {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <div className={`full-calendar-version-container ${embedded ? 'embedded' : ''}`}>
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
              <div className="change-title">{parseLinks(change.title)}</div>
              <div className="change-description">{parseLinks(change.description)}</div>
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
        <div className="u-flex-grow-1" ref={settingRef}></div>
      </div>
      {changelogData.map((version, index) => (
        <VersionSection key={version.version} version={version} isInitiallyOpen={index === 0} />
      ))}
      <div ref={footerRef}></div>
    </div>
  );
};
