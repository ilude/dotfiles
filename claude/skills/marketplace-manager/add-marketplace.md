# Add Marketplace Command

Parse the user's input to extract:
- `repo`: The GitHub repository (e.g., "NikiforovAll/claude-code-rules")
- `name`: Optional custom name, defaults to repo name (last part after /)

## Steps

1. **Validate input**: Ensure repo format is "user/repo"

2. **Determine marketplace name**:
   - If name provided, use it
   - Otherwise extract from repo (e.g., "NikiforovAll/claude-code-rules" → "claude-code-rules")

3. **Read current known_marketplaces.json**:
   ```bash
   cat ~/.claude/plugins/known_marketplaces.json
   ```

4. **Check if already exists**: If marketplace name already in config, inform user and ask if they want to update

5. **Add to known_marketplaces.json**: Add new entry with structure:
   ```json
   "<name>": {
     "source": {
       "source": "github",
       "repo": "<user/repo>"
     },
     "installLocation": "C:\Users\<username>\.claude\plugins\marketplaces\<name>",
     "lastUpdated": "<ISO timestamp>"
   }
   ```

6. **Clone the repository**:
   ```bash
   git clone https://github.com/<repo>.git ~/.claude/plugins/marketplaces/<name>
   ```

7. **Confirm success**: Tell user the marketplace is ready and they can now install plugins with:
   ```
   /plugin install <plugin-name>@<marketplace-name>
   ```
