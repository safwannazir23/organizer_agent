import os
import json
import shutil
from dotenv import load_dotenv
from google import genai

# Load environment variables and configuration
load_dotenv()

def load_config(config_path="config.json"):
    try:
        with open(config_path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading config: {e}")
        return None

def get_file_list(target_dir, ignore_patterns):
    file_list = []
    for root, dirs, files in os.walk(target_dir):
        # Filter directories in-place
        dirs[:] = [d for d in dirs if d not in ignore_patterns]
        
        for file in files:
            if file in ignore_patterns:
                continue
            # Get relative path for cleaner prompt
            rel_path = os.path.relpath(os.path.join(root, file), target_dir)
            file_list.append(rel_path)
    return file_list

def get_reorganization_plan(client, file_list, template="Generic"):
    template_guidelines = {
        "Next.js": "Follow Next.js best practices: `src/components`, `src/pages` or `src/app`, `src/styles`, `public/assets`. Group by component features if possible.",
        "Python": "Follow standard Python project structure: `src/` for source code, `tests/` for unit tests, `docs/` for documentation, `scripts/` for utility scripts.",
        "Data Science": "Organize for data science workflows: `data/raw`, `data/processed`, `notebooks/`, `src/features`, `src/models`, `reports/figures/`.",
        "Generic": "Group files by their purpose, type, or architectural role (e.g., components, styles, utilities, docs, tests)."
    }
    
    guideline = template_guidelines.get(template, template_guidelines["Generic"])

    prompt = f"""
    You are an expert software architect and codebase organizer.
    
    TASK:
    Analyze the current file structure and propose a logical reorganization ONLY if the current structure is messy or disorganized. 
    If a file is already in a logical location, KEEP its current path.
    
    TEMPLATE:
    The user wants to follow the **{template}** architecture. 
    Guidelines: {guideline}
    
    CONSTRAINTS:
    - Do NOT change filenames unless it's critical for clarity.
    - If the codebase is already well-organized, return the same paths as the keys.
    - Focus on moving files from the root or from vague folders into specific, logical subdirectories.
    
    Files:
    {json.dumps(file_list, indent=2)}
    
    Return a JSON object where the keys are the current file paths and the values are the new proposed relative paths.
    Only return the JSON object, nothing else.
    
    Example format:
    {{
      "app.js": "src/app.js",
      "src/styles.css": "src/styles.css" 
    }}
    """
    
    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt
        )
        
        # Robust JSON extraction
        text = response.text.strip()
        if "{" in text and "}" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            json_str = text[start:end]
            return json.loads(json_str)
        
        return json.loads(text)
    except Exception as e:
        print(f"Error communicating with Gemini or parsing JSON: {e}")
        print(f"Raw response: {response.text if 'response' in locals() else 'No response'}")
        return None

def execute_plan(target_dir, plan):
    print("\n--- Executing Reorganization ---")
    
    for old_rel_path, new_rel_path in plan.items():
        # Normalize paths for comparison (Windows/Unix compatibility)
        old_norm = os.path.normpath(old_rel_path)
        new_norm = os.path.normpath(new_rel_path)
        
        old_path = os.path.join(target_dir, old_norm)
        new_path = os.path.join(target_dir, new_norm)
        
        if old_norm == new_norm:
            continue
            
        print(f"[MOVING] {old_rel_path} -> {new_rel_path}")
        os.makedirs(os.path.dirname(new_path), exist_ok=True)
        try:
            shutil.move(old_path, new_path)
        except Exception as e:
            print(f"Error moving {old_rel_path}: {e}")

def setup_test_environment(target_dir):
    if not os.path.exists(target_dir):
        print(f"Target directory {target_dir} does not exist. Creating it for testing...")
        os.makedirs(target_dir, exist_ok=True)
    
    if "test_messy_codebase" in target_dir:
        test_files = [
            "index.html", "script.js", "styles.css", 
            "utils.py", "main.py", "test_main.py",
            "README.md", "notes.txt", "logo.png",
            "api.js", "auth.js", "header.css"
        ]
        for f in test_files:
            file_path = os.path.join(target_dir, f)
            if not os.path.exists(file_path):
                open(file_path, 'a').close()
        print(f"Verified/Created dummy files in {target_dir}")

if __name__ == "__main__":
    config = load_config()
    if not config:
        exit(1)
        
    target_dir = config.get("target_directory", "./")
    ignore_patterns = config.get("ignore_patterns", [])
    dry_run = config.get("dry_run", True)
    
    # Check if target directory exists
    if not os.path.exists(target_dir):
        print(f"Target directory {target_dir} does not exist. Run setup_test_data.py first if you want to test.")
        exit(1)

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    print(f"Scanning {target_dir}...")
    files = get_file_list(target_dir, ignore_patterns)
    
    if not files:
        print("No files found to organize.")
        exit(0)
        
    print(f"Found {len(files)} files. Asking Gemini for a plan...")
    plan = get_reorganization_plan(client, files)
    
    if plan:
        confirm = input(f"\nWARNING: About to move {len(plan)} files. Proceed? (y/n): ")
        if confirm.lower() != 'y':
            print("Execution cancelled.")
            exit(0)
            
        execute_plan(target_dir, plan)
    else:
        print("Failed to generate a plan.")
