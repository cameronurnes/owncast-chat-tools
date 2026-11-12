# Chat Tools

Adds a "who's here" list to the viewer page, for small streams where everyone in chat knows each other.

## Setup

None. Enable the plugin and approve its permissions. There are no settings.

## Usage

A button reading "N in chat" appears in the page header, next to the viewer's own name menu. Clicking it opens a list of everyone currently connected to chat.

- Each person is listed once, however many tabs or devices they have open.
- Moderators are marked with the shield icon and listed first.
- The list updates live as people join, leave or change their name.
- The button is hidden while chat is unavailable, such as when the stream is offline.

Only display names and moderator status are shown to viewers. IP addresses, user agents and user ids never leave the server.

Live updates are limited to 64 viewers at a time. Beyond that the list still works, but refreshes every 30 seconds.

### Inline image previews

When someone posts a link to an image or GIF in chat, a preview appears under the link. The message itself is unchanged; previews are drawn in each viewer's browser. Clicking a preview opens the image full size in an overlay on the same page; Escape, the Close button or a click outside the image dismisses it.

- Only `https` links are previewed, and only when they end in an image extension or come from a known GIF service.
- Viewers' browsers fetch the image directly from the linked site, so that site sees their IP address. Set **imageHosts** in the plugin's settings to restrict previews to sites you trust, or turn **inlineImages** off.

GIFs chosen from the search and images uploaded through this plugin always show as previews, even with **inlineImages** off. That setting only covers links pasted from other sites.

### GIF picker

With **gifSearch** on and a GIPHY API key set, a GIF button appears inside the chat box, beside the emoji button. It opens a search panel showing trending GIFs, or results as the viewer types. Picking one posts it to chat as that viewer.

- Get a key at https://developers.giphy.com/dashboard/ (choose "API", not "SDK") and paste it into **giphyApiKey**.
- GIPHY requires searches to come from the viewer's browser, so the key is sent to viewers. A free key allows 100 searches an hour across everyone.
- **giphyRating** caps the content rating of results.
- Turn **gifSearch** off to remove the button without deleting the key. It is independent of image uploads.

### Image uploads

An image button beside it lets anyone in chat upload a GIF, PNG, JPEG or WebP from their device. The file is stored on this server and posted to chat as a link, which shows as a preview.

- **maxUploadMB** sets the size limit (default 10) and **uploadsPerHour** limits each person (default 20).
- Files are checked by their contents, not their name, and only people who have joined chat can upload.
- Uploads are removed after **uploadRetentionDays** (default 30; 0 keeps them forever). Owncast does not let a plugin delete a published file, so an expired image is replaced by a tiny placeholder, which frees the space, and chat shows "Image expired" in its place.
- Set **allowUploads** to off to remove the button.

## Permissions

- **chat.history**: read the list of clients connected to chat.
- **users.read**: look up each person's moderator status.
- **http.serve**: serve the list, settings and upload endpoints to the viewer page, along with the moderator icon.
- **http.sse**: push live updates to viewers when the list changes.
- **ui.modify**: add the buttons and their styles to the viewer page.
- **storage.fs**: hold the pieces of an upload privately until the whole file has arrived.
- **storage.upload**: publish a finished upload so it can be shown in chat.
