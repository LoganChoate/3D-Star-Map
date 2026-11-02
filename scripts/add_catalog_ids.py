"""Add source identities to the legacy export without changing its other fields.

This migration deliberately fails if a record cannot be uniquely matched to HYG.
It does not derive identity from an array index, display name, or spatial position.
The six-field fingerprint is only a bridge back to the source row's existing ID.
"""
import collections
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def fingerprint(values):
    # CSV/pandas may differ at the final floating-point bit. Input coordinates
    # have six decimal places; eight-place comparison preserves their precision.
    return tuple(round(float(value), 8) for value in values)

def add_catalog_ids():
    catalog_path = ROOT / 'stars.json'
    source_path = ROOT / 'hyg_v42.csv'
    before_bytes = catalog_path.read_bytes()
    before = json.loads(before_bytes)
    source_index = collections.defaultdict(list)
    with source_path.open(newline='', encoding='utf-8') as source:
        for row in csv.DictReader(source):
            try:
                values = [row['x'], row['z'], -float(row['y']), row['dist'], row['mag'], row['ci']]
                source_index[fingerprint(values)].append(row)
            except ValueError:
                pass # The original export omitted rows without numeric fields.
    stars = json.loads(before_bytes)
    ids = set()
    max_numeric_difference = 0.0
    for star in stars:
        if star['name'] == 'Sol' and star['x'] == star['y'] == star['z'] == 0:
            identity = 'sol'
        else:
            values = [star[field] for field in ('x', 'y', 'z', 'dist', 'mag', 'ci')]
            matches = source_index[fingerprint(values)]
            if len(matches) != 1:
                raise ValueError(f'Expected unique HYG match for {star["name"]}: {len(matches)} candidates')
            row = matches[0]
            identity = 'hyg:' + row['id']
            source_values = [float(row['x']), float(row['z']), -float(row['y']), float(row['dist']), float(row['mag']), float(row['ci'])]
            max_numeric_difference = max(max_numeric_difference, *(abs(a-b) for a,b in zip(values, source_values)))
        if identity in ids:
            raise ValueError(f'Duplicate source identity: {identity}')
        if 'id' in star and star['id'] != identity:
            raise ValueError(f'Existing identity disagrees with HYG: {star["id"]}')
        ids.add(identity)
        star['id'] = identity
    strip_ids = lambda records: [{k:v for k,v in star.items() if k != 'id'} for star in records]
    assert strip_ids(stars) == strip_ids(before), 'Migration changed existing values or order'
    catalog_path.write_text(json.dumps(stars, indent=2), encoding='utf-8')
    report = {
        'status': 'passed', 'records': len(stars), 'uniqueIds': len(ids),
        'source': 'hyg_v42.csv', 'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
        'catalogBeforeSha256': hashlib.sha256(before_bytes).hexdigest(),
        'catalogAfterSha256': hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
        'idPolicy': 'hyg:<original source id>; sol for the explicitly constructed canonical Sun',
        'uniqueSourceMatches': len(stars)-1, 'ambiguousMatches': 0,
        'maxNumericMatchingDifference': max_numeric_difference,
        'existingValuesAndOrderUnchanged': True,
        'duplicateDisplayNames': {name: count for name,count in collections.Counter(s['name'] for s in stars).items() if count > 1}
    }
    output = ROOT / '.runtime' / 'catalog-identity-migration.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__':
    add_catalog_ids()
