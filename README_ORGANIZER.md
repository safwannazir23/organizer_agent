# File Organizer Agent

This agent uses Gemini 2.0 Flash to analyze your directory and propose a logical structure.

## Setup

1. Ensure you have the required dependencies:
   ```bash
   pip install google-genai python-dotenv
   ```
2. Configure your API key in the `.env` file:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
3. Update `config.json` to point to your target directory and set `dry_run` to `false` when you are ready to move files.

## Usage

Run the agent:
```bash
python organizer_agent.py
```

## Configuration (`config.json`)

- `ignore_patterns`: List of files/folders to skip (e.g., `.git`, `node_modules`).
- `dry_run`: If `true`, the agent will only print what it *would* do.
- `target_directory`: The path to the folder you want to organize.
