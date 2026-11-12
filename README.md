# Chat Tools

An [Owncast](https://owncast.online) plugin with extras for chat. Requires Owncast 0.3.0 or later.

- **Who's here:** an "N in chat" button in the page header that lists everyone connected to chat, with moderators marked.
- **Inline images:** image and GIF links posted in chat show as previews, and open full size in an overlay on the same page.
- **YouTube and Instagram links:** shown as click-to-load players and posts.
- **GIF search:** a GIPHY search button inside the chat box (needs a GIPHY API key).
- **Image upload:** a button inside the chat box to upload a GIF, PNG, JPEG or WebP of up to 10 MB.
- **Pick a name before chatting (optional):** asks viewers with an auto-generated name to choose one before typing, without blocking the stream.

Each feature has its own switch on the plugin's settings page. See [INSTRUCTIONS.md](INSTRUCTIONS.md) for what admins need to know, including what each permission is for.

The slug is `chat-tools`, which is the build artifact filename and the URL prefix Owncast routes to the plugin.

## Licence

MIT; see [LICENSE](LICENSE). The moderator icon in `public/moderator.svg` comes from the Owncast project, which is also MIT licensed.

The plugin icon (`icon.png`, source in `art/icon.svg`) uses the "messages-square" glyph from [Lucide](https://lucide.dev), ISC licence, copyright Lucide Contributors and Cole Bemis.

## Develop

```sh
npm install          # one-time, fetches the prebuilt test/serve host binaries
npm run build        # bundle src/plugin.js into chat-tools.js
npm test             # build, then run scenarios from __tests__/
npm run serve        # build, then host the plugin on http://localhost:8080
npm run package      # build, then bundle into chat-tools.ocpkg for distribution
```

Plugins ship as source and run on the JavaScript engine the Owncast host embeds,
so there's no wasm compile step and no toolchain to install. `npm install` only
fetches the host binaries `test`/`serve` use, and caches them after the first run.

## Ship

`npm run package` produces `chat-tools.ocpkg`. Install it through the Owncast admin: open **Plugins**, click **Upload plugin**, and pick the file. (You can also copy it directly to the server's `data/plugins/` directory if the admin UI isn't an option.) Toggle **Enabled** to load it.

## Files

- `src/plugin.js`, your handler code. Edit this
- `plugin.manifest.json`, the manifest: display name, slug, version, permissions, and optional `bot.displayName` for the chat identity
- `__tests__/plugin.test.js`, a sample scenario test. Add more
- `icon.png` (optional), drop a square PNG here and it bundles into the `.ocpkg` automatically. The admin uses it in the plugin list and sidebar, no permission required. Plugins without one fall back to a generic puzzle-piece glyph.
- `INSTRUCTIONS.md` (optional), edit this and it bundles into the `.ocpkg` automatically. The admin renders it as markdown in an **Instructions** tab on the plugin's details page, no permission required.

## Learn more

The full author guide covers every event handler, host API, permission, and testing pattern:

**[→ Owncast Plugin Author Guide](https://github.com/owncast/plugin-sdk/blob/main/docs/PLUGIN_AUTHOR_GUIDE.md)**

TypeScript declarations in `@owncast/plugin-sdk` give editor autocomplete on every API.
