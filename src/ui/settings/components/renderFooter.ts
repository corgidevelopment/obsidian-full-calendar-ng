export function renderFooter(containerEl: HTMLElement): void {
  const footerEl = containerEl.createDiv({ cls: 'settings-footer' });

  footerEl.createEl('p', {
    text: 'Do you like what you see?',
    cls: 'settings-footer-text'
  });

  const linksContainer = footerEl.createDiv({ cls: 'settings-footer-links' });

  linksContainer.createEl('a', {
    text: '☕ Buy me a coffee',
    attr: { href: 'https://ko-fi.com/youfoundjk' },
    cls: 'settings-footer-link'
  });
  linksContainer.createEl('a', {
    text: '💡 Suggest new feature',
    attr: {
      href: 'https://github.com/YouFoundJK/plugin-full-calendar/discussions/new?category=polls'
    },
    cls: 'settings-footer-link'
  });
  linksContainer.createEl('a', {
    text: '🐛 Raise an issue',
    attr: {
      href: 'https://github.com/YouFoundJK/plugin-full-calendar/issues/new?template=bug_report.yaml'
    },
    cls: 'settings-footer-link'
  });
}
