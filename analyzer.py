
import json

JSON_PATH = 'stars.json'

def analyze_star_data():
    try:
        with open(JSON_PATH, 'r') as f:
            data = json.load(f)
    except (IOError, json.JSONDecodeError) as e:
        print(f"Error reading or parsing {JSON_PATH}: {e}")
        return

    # Filter out stars with invalid data, similar to the JavaScript
    valid_stars = [s for s in data if s.get('dist') is not None]
    total_star_count = len(valid_stars)

    if not valid_stars:
        print("No valid star data found.")
        return

    # Find the maximum distance (the Garbage Sphere radius)
    max_dist = 0
    for star in valid_stars:
        if star['dist'] > max_dist:
            max_dist = star['dist']

    # Count stars in the Garbage Sphere
    garbage_sphere_count = sum(1 for star in valid_stars if star['dist'] == max_dist)

    # Calculate the number of stars NOT in the sphere
    non_garbage_count = total_star_count - garbage_sphere_count

    print(f"Total stars loaded: {total_star_count}")
    print(f"Stars in 'Garbage Sphere': {garbage_sphere_count}")
    print(f"Stars with measured distances: {non_garbage_count}")
    print(f"'Garbage Sphere' is at distance: {max_dist} pc")

if __name__ == '__main__':
    analyze_star_data()
