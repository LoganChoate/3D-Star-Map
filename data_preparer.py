import json
import re
import os
import sys

# Define file paths
STAR_JSON_PATH = 'stars.json'
DETAILS_JS_PATH = 'star_details.js'
PLACEHOLDER_TEXT = "Details to be added."

def get_all_proper_names():
    """Reads stars.json and returns a set of all unique proper names."""
    try:
        with open(STAR_JSON_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        proper_names = set()
        for star in data:
            if star.get('proper') and star['proper'].strip():
                proper_names.add(star['proper'].lower())
        return proper_names
    except (IOError, json.JSONDecodeError) as e:
        print(f"Error reading or parsing {STAR_JSON_PATH}: {e}")
        return set()

def get_existing_details():
    """Reads star_details.js, parses it, and returns a dictionary of details."""
    try:
        with open(DETAILS_JS_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Extract the JSON-like object from the JavaScript function
        match = re.search(r'return\s*({[\s\S]*});', content)
        if not match:
            print(f"Could not find a return object in {DETAILS_JS_PATH}")
            return {}
            
        json_str = match.group(1)
        
        # Python's json module is stricter than JS. Remove trailing commas before parsing.
        json_str = re.sub(r',\s*([}\]])', r'\1', json_str)
        
        return json.loads(json_str)
    except IOError:
        print(f"{DETAILS_JS_PATH} not found. A new file will be created.")
        return {}
    except (json.JSONDecodeError, TypeError) as e:
        print(f"Error parsing {DETAILS_JS_PATH}: {e}")
        return {}

def update_details_file():
    """Updates star_details.js with placeholders for missing named stars."""
    all_names = get_all_proper_names()
    existing_details = get_existing_details()
    
    if not all_names:
        print("No proper names found in star data. Aborting.")
        return

    update_count = 0
    for name in sorted(list(all_names)):
        if name not in existing_details:
            existing_details[name] = {"description": PLACEHOLDER_TEXT}
            update_count += 1
            
    if update_count == 0:
        print("star_details.js is already up to date. No changes made.")
        return

    details_json_string = json.dumps(existing_details, indent=4)
    js_content = f"function getStarDetails() {{\n    return {details_json_string};\n}}\n"
    
    with open(DETAILS_JS_PATH, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"Successfully updated {DETAILS_JS_PATH} with {update_count} new placeholder entries.")

def main():
    """Main execution function with force flag handling."""
    if '--force' in sys.argv or '-f' in sys.argv:
        if os.path.exists(DETAILS_JS_PATH):
            print(f"Force flag detected. Deleting existing '{DETAILS_JS_PATH}' to perform a clean rebuild.")
            os.remove(DETAILS_JS_PATH)
    update_details_file()

if __name__ == '__main__':
    main()