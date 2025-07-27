import json
import re
import time
import urllib.parse
import requests
from bs4 import BeautifulSoup

# --- Configuration ---
DETAILS_JS_PATH = 'star_details.js'
PLACEHOLDER_TEXT = "Details to be added."
USER_AGENT = "3DStarMapDataFetcher/1.0 (https://github.com/user/repo; mail@example.com) Python-requests/2.x"

def get_star_details_from_js():
    """Reads and parses the star_details.js file."""
    try:
        with open(DETAILS_JS_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
        match = re.search(r'return\s*({[\s\S]*});', content)
        if not match:
            raise ValueError("Could not find a return object in JS file.")
        json_str = re.sub(r',\s*([}\]])', r'\1', match.group(1))
        return json.loads(json_str)
    except (IOError, ValueError, json.JSONDecodeError) as e:
        print(f"Error reading or parsing {DETAILS_JS_PATH}: {e}")
        return None

def save_star_details_to_js(details_data):
    """Writes the updated details back to the star_details.js file."""
    details_json_string = json.dumps(details_data, indent=4)
    js_content = f"function getStarDetails() {{\n    return {details_json_string};\n}}\n"
    try:
        with open(DETAILS_JS_PATH, 'w', encoding='utf-8') as f:
            f.write(js_content)
        return True
    except IOError as e:
        print(f"Error writing to {DETAILS_JS_PATH}: {e}")
        return False

def scrape_wikipedia_description(star_name):
    """Scrapes the first two paragraphs for a star from Wikipedia."""
    # A more robust way to format names for Wikipedia URLs
    # Capitalizes each word and handles spaces correctly.
    formatted_name = '_'.join(word.capitalize() for word in star_name.split())
    formatted_name = urllib.parse.quote(formatted_name) # Safely encode special characters
    url = f"https://en.wikipedia.org/wiki/{formatted_name}"
    
    print(f"  Fetching: {url}")
    
    try:
        headers = {'User-Agent': USER_AGENT}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status() # Will raise an exception for 4xx or 5xx errors

        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find the main content area
        content_div = soup.find('div', {'id': 'mw-content-text'})
        if not content_div:
            return None

        # Extract text from the first two paragraphs that are direct children of the content div
        paragraphs = content_div.find_all('p', recursive=False, limit=2)
        description = ' '.join(p.get_text() for p in paragraphs)

        # Clean up the text (remove citations like [1], [2], etc. and extra whitespace)
        description = re.sub(r'\[\d+\]', '', description).strip()
        
        return description if description else None

    except requests.RequestException as e:
        print(f"    -> Failed to fetch page for {star_name}: {e}")
        return None

def main():
    star_details = get_star_details_from_js()
    if not star_details:
        return

    updated_count = 0
    failed_count = 0
    for name, data in star_details.items():
        # Only scrape for stars that still have the placeholder description
        if data.get("description", "") == PLACEHOLDER_TEXT:
            description = scrape_wikipedia_description(name)
            if description:
                star_details[name]["description"] = description
                updated_count += 1
                print(f"    -> Success! Updated description for {name.capitalize()}.")
            else:
                failed_count += 1
            # Be a good internet citizen: wait a moment between requests.
            time.sleep(1) 

    if updated_count > 0:
        if save_star_details_to_js(star_details):
            print(f"\nProcess complete.")
            print(f"  Successfully updated {updated_count} star descriptions.")
            if failed_count > 0:
                print(f"  Could not find details for {failed_count} stars (see logs above).")
    else:
        print("\nNo placeholder descriptions found to update.")

if __name__ == '__main__':
    main()