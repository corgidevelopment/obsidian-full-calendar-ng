# 🎉 Contributing to Full Calendar

Full Calendar is open to contributions, and we’re excited to have you here! This guide will help you get set up for local development.

---

## 🚀 Getting Started

### 1. Create the Obsidian Vault

To develop locally, set up your development vault and plugin directory:

```bash
mkdir -p .obsidian/.plugins/plugin-full-calender/
cp manifest.json .obsidian/.plugins/plugin-full-calender/manifest.json
````

> 💡 **Note:** Obsidian expects a CSS file named `styles.css`, but **esbuild** will output one named `main.css`.

---

### 2. Build the Plugin

You can build the plugin in two ways:

* For development:

  ```bash
  npm run dev
  ```

* For a production/minified build:

  ```bash
  npm run prod
  ```

All build output will appear in the plugin directory created above.

---

### 3. Open the Vault in Obsidian

1. Open **Obsidian**
2. Go to **Vaults** → **Open Folder as Vault**
3. Select the `obsidian-dev-vault` directory

---

## 🧠 Tips for Developers

> 💡 **Recommended:** Use the [Hot Reload plugin](https://github.com/pjeby/hot-reload) to make development smoother — it auto-reloads your plugin changes.

> 📘 **Start Here:** To understand the architecture and get familiar with the codebase, read our [Architecture Guide](https://github.com/YouFoundJK/plugin-full-calendar/blob/chrono-insights/src/README.md).

---

Thanks for helping improve Full Calendar! 🎨🗓️
