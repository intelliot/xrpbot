# xrpbot

Monitor ledgers and transactions for high fees and post to Slack.

## Usage

1. Install dependencies with yarn or npm (`yarn` or `npm install`)
2. Get a bot token from Slack (optional) and set it as your `SLACK_TOKEN` environment variable
3. Run the bot with `yarn start` or `npm start`

You may set the `SLACK_TOKEN` env variable inline:
```
 SLACK_TOKEN=xoxb-xxxx yarn start
```

## Console output

Each `.` is one transaction received.

## Options

Set `SUMMARY_SIZE` at the top of `app.js` (default `1000` ledgers).
