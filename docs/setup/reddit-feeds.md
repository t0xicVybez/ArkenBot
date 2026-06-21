---
sidebar_label: Reddit Feeds
---

# Reddit Feeds

ArkenBot can monitor subreddits and post a Discord notification whenever a new post appears. The bot checks every 5 minutes.

## Requirements

Reddit blocks unauthenticated requests from server IPs, even for public subreddits. You must provide Reddit API credentials in the bot's `.env` file:

```
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
```

Create a free **script** app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) to get these values.

## Setup

1. Go to **Dashboard → Reddit Feeds**
2. Click **Add Alert**
3. Enter the **subreddit name** (no `r/` prefix needed — just `gaming`, `worldnews`, etc.)
4. Select the **Discord channel** to post in
5. Customize the **message template** using the available variables
6. Click **Save**

## Message Variables

| Variable | Replaced with |
|---|---|
| `{streamer}` | `r/subreddit` name |
| `{title}` | Post title |
| `{author}` | Reddit username of the poster |
| `{url}` | Direct link to the post |

**Example template:**
```
New post in {streamer} by u/{author}: **{title}** — {url}
```

## Managing Feeds

All configured feeds are listed on the page. Click the trash icon to remove a feed.

## Tips

- You can add the same subreddit to multiple Discord channels with different message templates
- Avoid very high-traffic subreddits (e.g. r/AskReddit) unless you want frequent posts
- The bot only picks up new posts, not edits or comment activity
