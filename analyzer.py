
import json
from pathlib import Path

JSON_PATH = Path('stars.json')

def analyze_star_data():
    """Analyzes the star data JSON file and prints statistics."""
    try:
        # Use pathlib for more robust path handling and specify encoding
        with JSON_PATH.open('r', encoding='utf-8') as f:
            data = json.load(f)
    except (IOError, json.JSONDecodeError) as e:
        print(f"Error reading or parsing {JSON_PATH}: {e}")
        return

    # Filter out stars with invalid data, similar to the JavaScript
    valid_stars = [s for s in data if s.get('dist') is not None]

    if not valid_stars:
        print("No valid star data found.")
        return

    total_star_count = len(valid_stars)

    # Find the maximum distance (the Garbage Sphere radius)
    # Using max() on a generator expression is more concise and efficient
    try:
        max_dist = max(star['dist'] for star in valid_stars)
    except ValueError:
        print("Could not determine max distance from empty star list.")
        return

    # Count stars in the Garbage Sphere
    garbage_sphere_count = sum(1 for star in valid_stars if star['dist'] == max_dist)

    # Calculate the number of stars NOT in the sphere
    non_garbage_count = total_star_count - garbage_sphere_count
    print(f"Total stars loaded: {total_star_count}")
    print(f"Stars in 'Garbage Sphere': {garbage_sphere_count}")
    print(f"Stars with measured distances: {non_garbage_count}")
    print(f"'Garbage Sphere' is at distance: {max_dist:.4f} pc")

if __name__ == '__main__':
    analyze_star_data()
