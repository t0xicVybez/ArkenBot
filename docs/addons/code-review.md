# Code Review

Analyze code snippets for issues, style problems, and formatting directly in Discord.

## Setup

Install the **Code Review** addon from the Addon Manager. Optionally configure the **Maximum Code Length** setting (default: 4000 characters, max: 4000).

For AI-powered reviews, a Groq API key must be configured on the server. Without it, the addon falls back to static analysis.

## Commands

### /reviewcode

Analyze a code snippet for issues and formatting.

| Option | Required | Description |
|---|---|---|
| `language` | No | Language hint — skip for auto-detection |

After running the command, a modal appears where you paste your code. Results include:
- Detected or confirmed language
- Error, warning, and info counts
- List of issues with severity and descriptions
- Formatted/corrected version of the code

### Supported Languages

| Language | Analysis |
|---|---|
| JavaScript | Errors, style issues, potential bugs |
| TypeScript | Type issues, errors, style |
| Python | Syntax issues, style (PEP 8) |
| JSON | Syntax validation and formatting |
| CSS | Validation |
| HTML | Structure issues |
| Auto-detect | Automatically detects the language |

## Analysis Modes

**AI-powered (Groq)** — When a Groq API key is configured, the addon sends code to an LLM for a comprehensive review including a summary, specific issues, and a corrected/formatted version.

**Static analysis (fallback)** — When no API key is available, the addon uses built-in rules for JavaScript, TypeScript, Python, JSON, and CSS.

## Addon Settings

| Setting | Description | Default |
|---|---|---|
| `maxLength` | Maximum characters allowed per review | 4000 |
