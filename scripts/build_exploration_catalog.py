"""Build the bounded exploration catalog from retained JPL results and HYG rows.

Default: offline, using committed raw responses. --refresh-horizons retrieves
the same fixed-epoch queries from JPL before parsing them. No star export edits.
"""
import argparse
import csv
import hashlib
import json
import math
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data'
RAW = OUT / 'horizons'
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
HYG_URL = 'https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md'
PHYSICAL = 'https://ssd.jpl.nasa.gov/planets/phys_par.html'
PLANETS = 'https://science.nasa.gov/solar-system/planets/'
NOMINAL_SUN = 'https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf'
BODY = [
    ('sun',10,695700,'star',None,'The Sun is the Solar System\'s star. Its center defines the origin of this view.'),
    ('mercury',199,2439.4,'terrestrial planet','sol','Mercury is the innermost planet. Its small orbit makes it a useful first stop when comparing planetary distances.'),
    ('venus',299,6051.8,'terrestrial planet','sol','Venus is the second planet from the Sun. Compare its position with Earth in this historical reference snapshot.'),
    ('earth',399,6371.0084,'terrestrial planet','sol','Earth is the third planet from the Sun. The separate Earth–Moon view reveals the distance to its natural satellite.'),
    ('moon',301,1737.4,'natural satellite','solar:earth','The Moon is Earth\'s natural satellite. Its displayed position is heliocentric; subtract Earth\'s position to measure their separation.'),
    ('mars',499,3389.5,'terrestrial planet','sol','Mars is the fourth planet from the Sun and the outermost terrestrial planet.'),
    ('jupiter',599,69911,'gas giant','sol','Jupiter is the largest planet. Its physical radius is listed here, while its on-screen marker is enlarged for visibility.'),
    ('saturn',699,58232,'gas giant','sol','Saturn is a gas giant known for its rings. Its marker identifies its center; the marker does not represent its physical diameter or rings.'),
    ('uranus',799,25362,'ice giant','sol','Uranus is an ice giant in the outer Solar System. The overview preserves its true reference distance from the Sun.'),
    ('neptune',899,24622,'ice giant','sol','Neptune is the outermost of the eight planets. Compare its distance with the inner planets to see the scale of the Solar System.')
]
NEARBY_IDS = ['hyg:70666','hyg:71453','hyg:71456','hyg:87665','hyg:118720','hyg:53879','hyg:32263','hyg:92115','hyg:16496','hyg:57375','hyg:37173','hyg:8087']

def digest(data):
    return hashlib.sha256(data).hexdigest()

def query(code):
    p = {'format':'text','COMMAND':f"'{code}'",'OBJ_DATA':"'YES'",'MAKE_EPHEM':"'NO'" if code == 10 else "'YES'"}
    if code != 10:
        p.update({'EPHEM_TYPE':"'VECTORS'",'CENTER':"'500@10'",'TLIST':"'2451545.0'",'TLIST_TYPE':"'JD'",'TIME_TYPE':"'TDB'",'REF_PLANE':"'ECLIPTIC'",'REF_SYSTEM':"'ICRF'",'OUT_UNITS':"'AU-D'",'VEC_TABLE':"'2'",'VEC_CORR':"'NONE'",'CSV_FORMAT':"'YES'"})
    return API + '?' + urllib.parse.urlencode(p)

def parse_vector(text, code):
    assert re.search(rf'Target body name:[^\r\n]*\({code}\)', text), f'Unexpected target {code}'
    for required in ['Center body name: Sun (10)', 'Reference frame : Ecliptic of J2000.0', 'Output units    : AU-D', 'GEOMETRIC cartesian states', '2000-Jan-01 12:00:00.0000 TDB']:
        assert required in text, f'Missing reference metadata: {required}'
    segment = text.split('$$SOE')[1].split('$$EOE')[0].strip()
    rows = list(csv.reader(segment.splitlines()))
    assert len(rows) == 1
    row = rows[0]
    assert float(row[0]) == 2451545.0
    xyz = [float(v) for v in row[2:5]]
    assert len(xyz) == 3 and all(math.isfinite(v) for v in xyz)
    return xyz

def build(refresh=False):
    RAW.mkdir(parents=True, exist_ok=True)
    solar = []
    for slug, code, radius, kind, parent, description in BODY:
        raw_path = RAW / f'{slug}.txt'
        url = query(code)
        if refresh:
            data = urllib.request.urlopen(url, timeout=60).read()
            raw_path.write_bytes(data)
        raw = raw_path.read_bytes()
        text = raw.decode('utf8')
        position = [0,0,0] if code == 10 else parse_vector(text, code)
        if code == 10:
            assert 'Sun' in text and '695700' in text
        radius_source = 'https://ssd.jpl.nasa.gov/sats/phys_par/' if code == 301 else (NOMINAL_SUN if code == 10 else PHYSICAL)
        overview_source = f'https://science.nasa.gov/{slug}/facts/' if code in [10,301] else PLANETS
        solar.append({
            'id':'sol' if code == 10 else f'solar:{slug}', 'name':slug.title(), 'kind':kind, 'parentId':parent,
            'position':position, 'radiusKm':radius, 'radiusDefinition':'Nominal solar radius' if code == 10 else ('Mean radius' if code == 301 else 'Mean volumetric radius'),
            'description':description, 'horizonsTarget':str(code), 'rawFile':f'data/horizons/{slug}.txt', 'rawSha256':digest(raw),
            'ephemerisSource':re.search(r'Target body name:.*?\{source: ([^}]+)\}',text).group(1) if code != 10 else 'Heliocentric origin',
            'sources':[{'label':'JPL Horizons reference query','url':url},{'label':'Physical radius','url':radius_source},{'label':'NASA overview','url':overview_source}]
        })
    stars_bytes = (ROOT/'stars.json').read_bytes()
    stars = json.loads(stars_bytes)
    lookup = {s['id']:s for s in stars}
    nearby = []
    for sid in NEARBY_IDS:
        s=lookup[sid]
        assert s['dist'] < 5 and all(math.isfinite(s[k]) for k in ['x','y','z','dist','mag'])
        nearby.append({'id':sid,'name':s['name'],'kind':'star','position':[s['x'],s['y'],s['z']],'distancePc':s['dist'],'spectralType':s['spect'],'apparentMagnitude':s['mag'],
          'description':f"The retained HYG catalog lists {s['name']} at {s['dist']} parsecs, with spectral type {s['spect']} and apparent visual magnitude {s['mag']}. This is a curated catalog entry, not a new measurement or a current-position prediction.",
          'sources':[{'label':'HYG catalog documentation and license','url':HYG_URL}]})
    au_km=149597870.7
    au_per_pc=648000/math.pi
    ly_km=299792.458*365.25*86400
    result={
      'schemaVersion':1,
      'constants':{'auKm':au_km,'auPerParsec':au_per_pc,'lightYearKm':ly_km,'lightYearsPerParsec':au_km*au_per_pc/ly_km,'lightYearConvention':'Distance light travels in vacuum in one Julian year of 365.25 days; c = 299792.458 km/s; day = 86400 seconds.'},
      'solar':{'epochLabel':'2000 Jan 1, 12:00 TDB · historical reference snapshot, not current positions','epochJD':2451545.0,'timeScale':'TDB','frame':'Heliocentric ecliptic J2000.0 (ICRF X-axis; IAU 1976 obliquity)','units':'AU','positionType':'Geometric body-center positions; no light-time or aberration corrections','positionNote':'Sun is the exact origin by definition. All other centers are copied from the retained JPL output at the stated epoch. No orbital animation or extrapolation is applied.','sources':[{'label':'JPL Horizons API documentation','url':'https://ssd-api.jpl.nasa.gov/doc/horizons.html'},{'label':'JPL physical parameters','url':PHYSICAL}], 'objects':solar},
      'nearby':{'epochLabel':'HYG catalog epoch/equinox 2000.0; no proper-motion propagation','frame':'Retained HYG equatorial J2000 Cartesian coordinates remapped for the app: [X, Z, -Y]','units':'pc','catalog':'Retained stars.json derived from local hyg_v42.csv','catalogSha256':digest(stars_bytes),'sourceCsvSha256':digest((ROOT/'hyg_v42.csv').read_bytes()),'selectionNote':'Twelve recognizable nearby entries retained from the existing catalog. This selection is not a complete census or a ranking of current best distances.','sources':[{'label':'HYG catalog documentation','url':HYG_URL}],'objects':nearby},
      'displayNotice':'Positions and computed separations use real units. Object markers are enlarged for visibility and do not show physical diameters. Solar and stellar views use different coordinate frames; cross-frame distance measurements require an explicit transformation.'
    }
    assert len(solar)==10 and len(nearby)==12
    assert len({o['id'] for o in solar+nearby})==22
    earth=next(o for o in solar if o['id']=='solar:earth')
    moon=next(o for o in solar if o['id']=='solar:moon')
    separation=math.dist(earth['position'],moon['position'])*au_km
    assert 350000 < separation < 410000
    encoded=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    (OUT/'exploration-catalog.json').write_bytes(encoded.encode('utf8'))
    evidence={'status':'passed','solarObjects':len(solar),'nearbyObjects':len(nearby),'uniqueIds':22,'epochJD':2451545.0,'timeScale':'TDB','earthMoonKm':separation,'earthSunAU':math.dist(earth['position'],[0,0,0]),'neptuneSunAU':math.dist(solar[-1]['position'],[0,0,0]),'rawVectorsChecked':9,'sunOriginByDefinition':True,'catalogSha256':digest(encoded.encode('utf8')),'nearbyValuesMatchRetainedCatalog':True,'starCatalogUnchanged':digest((ROOT/'stars.json').read_bytes())==digest(stars_bytes)}
    (ROOT/'.runtime').mkdir(exist_ok=True)
    (ROOT/'.runtime/exploration-catalog-results.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf8')
    print(json.dumps(evidence))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--refresh-horizons',action='store_true')
    build(p.parse_args().refresh_horizons)
