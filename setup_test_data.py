import os
from organizer_agent import load_config, setup_test_environment

def main():
    config = load_config()
    if not config:
        print("Config not found. Using defaults.")
        target_dir = "./test_messy_codebase"
    else:
        target_dir = config.get("target_directory", "./test_messy_codebase")
    
    print(f"Initializing test environment in: {target_dir}")
    setup_test_environment(target_dir)
    print("Done.")

if __name__ == "__main__":
    main()
