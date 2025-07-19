import pandas as pd
import json
import sys

# --- Configuration ---
CSV_INPUT_PATH = 'hyg_v42.csv'
JSON_OUTPUT_PATH = 'stars.json'
# ---------------------

def process_star_data():
    """
    Reads the HYG star database CSV, processes it, and saves it as a JSON file
    compatible with the 3D Star Map project.
    """
    try:
        print(f"Reading star data from '{CSV_INPUT_PATH}'...")
        # Define data types to prevent warnings and ensure correct parsing
        dtype_spec = {'spect': str, 'proper': str, 'ci': float}
        df = pd.read_csv(CSV_INPUT_PATH, dtype=dtype_spec, usecols=[
            'proper', 'dist', 'mag', 'spect', 'ci', 'x', 'y', 'z'
        ])
        print(f"Successfully loaded {len(df)} stars from the database.")
    except FileNotFoundError:
        print(f"ERROR: The file '{CSV_INPUT_PATH}' was not found.", file=sys.stderr)
        print("Please download it from https://github.com/astronexus/HYG-Database and place it in the same directory as this script.", file=sys.stderr)
        sys.exit(1)

    # 1. Ensure required numeric fields are valid.
    required_numeric = ['dist', 'mag', 'ci', 'x', 'y', 'z']
    df.dropna(subset=required_numeric, inplace=True)
    
    # 2. Remove the existing 'Sol' entry from the database to prevent duplicates.
    # We will add our own canonical version of the Sun.
    df = df[df['proper'] != 'Sol']
    print(f"Found {len(df)} stars with all required data fields (excluding Sol).")

    # 3. The original project's coordinate system seems to be Y-up, while the
    #    standard astronomical system (used in HYG) is Z-up.
    #    To maintain visual consistency with the original project, we swap Y and Z.
    #    Standard: X=Vernal Equinox, Y=90deg East, Z=North Celestial Pole
    #    Remapped: X'=X, Y'=Z, Z'=-Y (to make it right-handed and Y-up)
    df_remapped = df.copy()
    df_remapped['x'] = df['x']
    df_remapped['y'] = df['z']   # New Y is the old Z
    df_remapped['z'] = -df['y']  # New Z is the inverted old Y

    # 4. Create the list of dictionaries for the JSON output.
    # Replace NaN in 'proper' and 'spect' with None, which becomes 'null' in JSON.
    # This is important for the JavaScript side to handle missing names gracefully.
    df_remapped['proper'] = df_remapped['proper'].where(pd.notna(df_remapped['proper']), None)
    df_remapped['spect'] = df_remapped['spect'].where(pd.notna(df_remapped['spect']), None)
    output_data = df_remapped[['proper', 'dist', 'mag', 'spect', 'ci', 'x', 'y', 'z']].to_dict(orient='records')

    # 5. Add our own Sun to the data, as it's not in the HYG database in this format.
    sun_data = {
        "proper": "Sol", "dist": 0.0000048481, "mag": -26.74, "ci": 0.656,
        "x": 0, "y": 0, "z": 0, "spect": "G2V"
    }
    output_data.insert(0, sun_data)

    # 6. Write to the JSON file.
    try:
        with open(JSON_OUTPUT_PATH, 'w') as f:
            # Using a compact format to save space
            json.dump(output_data, f, separators=(',', ':'))
        print(f"\nSuccess! Saved {len(output_data)} stars to '{JSON_OUTPUT_PATH}'.")
        print("You can now reload the web application.")
    except IOError as e:
        print(f"ERROR: Could not write to file '{JSON_OUTPUT_PATH}'. Reason: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    process_star_data()