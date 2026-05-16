# Stream Alerts

Post automatic notifications in Discord when a creator goes live, posts a tweet, a subreddit gets a new post, or an RSS feed updates.

## Setup

Go to **Stream Alerts** in the sidebar.

## Supported Platforms

| Platform | What Triggers an Alert |
|---|---|
| **Twitch** | Stream goes live |
| **Kick** | Stream goes live |
| **X (Twitter)** | New tweet |
| **Reddit** | New post in a subreddit |
| **RSS / Podcast** | New item in a feed |

> **Note:** Twitch requires API credentials configured on the server. Kick, Reddit, and RSS work without credentials. X (Twitter) requires a Bearer Token. Contact your bot administrator if alerts are not firing.

## Creating an Alert

1. Click **Add Alert**
2. Select the **Platform**
3. Enter the channel username, handle, subreddit, or feed URL (the label updates based on platform)
4. Select the **Discord Channel** to post alerts in
5. Optionally enter a **Custom Message**
6. Click **Create Alert**

## Custom Messages

Each platform supports template variables in the custom message field:

| Platform | Available Variables |
|---|---|
| Twitch | `{streamer}`, `{title}`, `{url}`, `{game}` |
| Kick | `{streamer}`, `{title}`, `{url}` |
| X (Twitter) | `{streamer}`, `{title}`, `{url}` |
| Reddit | `{streamer}`, `{title}`, `{url}`, `{author}` |
| RSS / Podcast | `{streamer}`, `{title}`, `{url}` |

**Example:**
```
@everyone {streamer} is live playing {game}! 🎮 {url}
```

## Managing Alerts

- **Enable/Disable** — Toggle the switch in the Enabled column to pause an alert without deleting it
- **Edit** — Click **Edit** to update the username or custom message
- **Delete** — Click the trash icon to permanently remove the alert

## Username / URL Format

| Platform | What to Enter |
|---|---|
| Twitch | Channel username (e.g. `shroud`) |
| Kick | Channel username (e.g. `shroud`) |
| X (Twitter) | Username with @ (e.g. `@shroud`) |
| Reddit | Subreddit name without r/ (e.g. `gaming`) |
| RSS / Podcast | Full feed URL (e.g. `https://example.com/feed.xml`) |
