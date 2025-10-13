# Internationalization (i18n) Guide

This document explains how the Full Calendar plugin handles translations and how to contribute new language translations.

## Overview

The Full Calendar plugin uses [i18next](https://www.i18next.com/) for internationalization support. The plugin automatically detects your Obsidian language setting and displays the UI in your preferred language (if available).

## Available Languages

Currently supported languages:
- **English (en)** - Default language

## How It Works

1. **Automatic Detection**: The plugin reads your Obsidian language setting when it loads
2. **Graceful Fallback**: If a translation is missing for your language, the plugin falls back to English
3. **Type-Safe**: All translation keys are validated at compile time to prevent errors

## Adding a New Language

### Step 1: Create a Translation File

1. Navigate to `src/i18n/locales/`
2. Create a new JSON file named with the appropriate [ISO 639-1 language code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)
   - Examples: `fr.json` (French), `es.json` (Spanish), `zh-cn.json` (Simplified Chinese)
3. Copy the contents of `en.json` as a starting template

### Step 2: Translate the Strings

Translate all the text values in your new file. **Important guidelines:**

- Keep the JSON structure intact (don't modify the keys, only translate the values)
- Preserve any special formatting:
  - `{{variableName}}` - These are placeholders that will be replaced with dynamic content
  - Keep HTML tags if present
  - Maintain line breaks and punctuation as needed for your language

Example:
```json
{
  "commands": {
    "newEvent": "Nouvel événement"  // ✅ Correct
  },
  "notices": {
    "providerNotRegistered": "Le fournisseur {{providerType}} n'est pas enregistré."  // ✅ Correct - placeholder preserved
  }
}
```

### Step 3: Register the Translation

Edit `src/i18n/i18n.ts` to import and register your new translation:

```typescript
// Import translation resources
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';  // Add your new import

/**
 * Type-safe translation resources
 */
const resources = {
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr }  // Add your new language
};
```

### Step 4: Test Your Translation

1. Build the plugin: `npm run build`
2. Change your Obsidian language setting to your new language
3. Reload the plugin to see your translations in action
4. Verify all UI elements display correctly

### Step 5: Submit Your Translation

1. Create a new branch: `git checkout -b add-i18n-french`
2. Commit your changes:
   ```bash
   git add src/i18n/locales/fr.json src/i18n/i18n.ts
   git commit -m "Add French (fr) translation"
   ```
3. Push and create a Pull Request on GitHub

## Translation Keys Structure

The translation keys are organized hierarchically:

- `commands.*` - Command palette entries
- `notices.*` - Notification messages
- `ribbon.*` - Ribbon icon tooltips
- `settings.*` - Settings tab strings
  - `settings.calendars.*` - Calendar management section
  - `settings.quickStart.*` - Initial setup guide

## Tips for Translators

1. **Context Matters**: If you're unsure what a string refers to, run the plugin in English first to see where it appears
2. **Stay Concise**: UI space is limited, especially on mobile devices
3. **Maintain Tone**: Keep the friendly, helpful tone of the original English text
4. **Ask Questions**: If anything is unclear, open an issue on GitHub before submitting your translation

## Testing Multi-Language Support

To test language switching:

1. Build the plugin with multiple languages
2. Change Obsidian's language setting (Settings → About → Language)
3. Reload the plugin (disable and re-enable it)
4. Verify the UI updates to the new language

## For Developers

### Using Translations in Code

Import and use the `t` function:

```typescript
import { t } from '../i18n/i18n';

// Simple translation
new Notice(t('notices.cacheReset'));

// With interpolation
new Notice(t('notices.providerNotRegistered', { providerType: 'caldav' }));
```

### Adding New Translation Keys

1. Add the English key to `en.json`
2. Add corresponding keys to all other language files
3. Use the `t()` function in your code
4. The TypeScript compiler will validate the keys at build time

## Resources

- [i18next Documentation](https://www.i18next.com/)
- [ISO 639-1 Language Codes](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

## Questions or Issues?

If you encounter any problems or have questions about translations:
- Open an issue on GitHub
- Tag it with the `i18n` label
- Include your language code and specific questions
