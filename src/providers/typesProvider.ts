import { ComponentType } from 'react';
import { OFCEvent, EventLocation } from '../types';

/**
 * The persistent, source-of-truth locator for an event within its source.
 */
export type EventHandle = {
  persistentId: string;
  location?: any;
};

/**
 * Contextual information passed from the Settings UI to a provider's configuration component.
 */
export type ProviderConfigContext = {
  allDirectories: string[];
  usedDirectories: string[];
  headings: string[];
};

/**
 * A generic type for a React component used in the provider interface.
 */
export type FCReactComponent<T> = ComponentType<T>;
