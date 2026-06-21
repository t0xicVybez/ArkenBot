---
sidebar_label: X / Twitter Feeds
---

# X / Twitter Feeds

ArkenBot can monitor X (Twitter) accounts and post a Discord notification whenever they publish a new tweet. The bot checks every 5 minutes.

## Requirements

X/Twitter alerts require a Bearer Token in the bot's `.env` file:

```
TWITTER_BEARER_TOKEN=your_bearer_token
```

A free X Developer account with a **Basic** app is sufficient. Sign up at [developer.x.com](https://developer.x.com) and generate a Bearer Token from your app dashboard.

## Setup

1. Go to **Dashboard → X / Twitter Feeds**
2. Click **Add Alert**
3. Enter the **username** of the account to monitor (with or without `@` — e.g. `@shroud` or `shroud`)
4. Select the **Discord channel** to post in
5. Customize the **message template** using the available variables
6. Click **Save**

## Message Variables

| Variable | Replaced with |
|---|---|
| `{streamer}` | `@handle` of the account |
| `{title}` | Text content of the tweet |
| `{url}` | Direct link to the tweet |

**Example template:**
```
New tweet from {streamer}: {url}
```

## Managing Feeds

All configured feeds are listed on the page. Click the trash icon to remove a feed.

## Tips

- Replies and retweets may be included depending on your API plan
- The bot only detects new tweets from the point it was configured — it does not backfill historical tweets
- If you don't set a Bearer Token, Twitter alerts are silently skipped with a warning in the bot logs
