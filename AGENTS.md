# Project-Specific Notes for Agents

## Settings Page URL Management

When updating features that modify the settings page (e.g., adding the routine persistence feature), remember:

### Testing Workflow

1. **URL Configuration:** The settings page URL is defined in `gymtracker/src/pkjs/index.js`:
   ```javascript
   var myConfigUrl = isDevMode ? 'https://silentjay.github.io/solid-lamp/index.html' : 'https://silentjay.github.io/solid-lamp/';
   ```

2. **For local testing:** The URL should point to **your fork's GitHub Pages** (`silentjay.github.io/solid-lamp/`) so you can test your changes. Also ensure GitHub Pages is serving from your feature branch (Settings → Pages → select branch).

3. **Before PR:** Revert URL back to the **upstream maintainer's URL** before committing:
   ```javascript
   var myConfigUrl = isDevMode ? 'https://oliverano95.github.io/GymTracker/index.html' : 'https://oliverano95.github.io/GymTracker/';
   ```

### Important Reminder
- **Use YOUR fork URL** when developing/testing features
- **Use UPSTREAM URL** when finalizing for a PR (to avoid exposing dev URLs in merged code)

### GitHub Pages Branch Configuration

When testing features on GitHub Pages that are on a non-main branch:
- Go to **Settings** → **Pages** → Select branch from dropdown
- This allows GitHub Pages to serve code from feature branches
- Remember to switch back after testing

## Communication — No Three-Letter Abbreviations
- Never use three-letter abbreviations in identifiers, comments, documentation, dashboard text, issue text, or conversation. Write full words: `temporary` not `tmp`, `configuration` not `cfg`, `message` not `msg`, `average` not `avg`, `heart rate` not `hr`, `movement counts` not `vmc`.
- Leave untouched: programming language keywords and standard library names; names fixed by external contracts (software development kit fields, wire protocol keys, message keys, columns owned by another system); file paths and commands owned by other projects. Where such a name must stay, expand it on first use in prose.
- Renaming a live database column additionally requires explicit migration handling plus matching updates in queries, dashboards, and documentation — never rename without all three.

## Long-Running Commands

Never run a command that may exceed ~1 minute in the foreground. Run it as a
background process that writes its logs to a logfile under `/tmp/opencode/`
so it can be monitored or checked later:

```bash
nohup <command> > /tmp/opencode/<task-name>.log 2>&1 &
```

Monitor with `tail -f /tmp/opencode/<task-name>.log`, or read the log later if
the task fails or you need to diagnose it.