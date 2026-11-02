"""Deterministic, offline scientific sidecars for the retained HYG atlas.

The CSV is the scientific source. stars.json is an immutable compatibility
input: its identity, selection, order and retained fields are checked, never
rewritten. No pandas, network access, current timestamps or absolute paths are
needed in the exports. Use --check to compare fresh exports without writing.
"""
import argparse
import collections
import csv
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PIPELINE_VERSION = '1.0.0'
SOURCE_SHA256 = 'b2983a8d934e4f031cdb67bdd6c3437f8c5143cd6606a9573a9a9ac4b6375fd2'
UPSTREAM_COMMIT = 'f3b7a9f0a756a55a0d1ddba5507f4750ab7a0bfa'
UPSTREAM_URL = f'https://codeberg.org/astronexus/hyg/media/commit/{UPSTREAM_COMMIT}/data/hyg/OLDER/hyg_v42.csv.gz'
GZIP_SHA256 = '5ca9431ff364c8002a4a3efa91b2b9296746aea1543374db4cb6b4fab049d601'
FIELDS = 'id hip hd hr gl bf proper ra dec dist pmra pmdec rv mag absmag spect ci x y z vx vy vz rarad decrad pmrarad pmdecrad bayer flam con comp comp_primary base lum var var_min var_max'.split()
REQUIRED = ['dist', 'mag', 'ci', 'x', 'y', 'z']
NUMERIC = 'ra dec dist pmra pmdec rv mag absmag ci x y z vx vy vz rarad decrad pmrarad pmdecrad lum var_min var_max'.split()
INTEGER = 'id hip hd hr comp comp_primary'.split()
RUNTIME_FIELDS = {'id', 'name', 'proper', 'dist', 'mag', 'spect', 'ci', 'x', 'y', 'z'}
TOLERANCE = 1e-9
SUN_RUNTIME = {'id':'sol','name':'Sol','proper':'Sol','dist':0.0000048481,'mag':-26.74,'ci':0.656,'x':0,'y':0,'z':0,'spect':'G2V'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(data):
    return (json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode('utf-8')


def number(value, field, source_id, integer=False):
    if value == '':
        return None
    try:
        parsed = float(value)
    except (ValueError, TypeError) as error:
        raise ValueError(f'Invalid {field} for HYG {source_id}: {value!r}') from error
    if not math.isfinite(parsed):
        raise ValueError(f'Nonfinite {field} for HYG {source_id}')
    if integer:
        if not parsed.is_integer() or parsed < 0 or parsed > 2**53 - 1:
            raise ValueError(f'Invalid integer {field} for HYG {source_id}')
        return int(parsed)
    return parsed


def half_decimal_step(value):
    """Half the serialized decimal step; a diagnostic assumption, not an error bar."""
    try:
        return float(Decimal(1).scaleb(Decimal(value).as_tuple().exponent)) / 2
    except (InvalidOperation, ValueError, OverflowError) as error:
        raise ValueError(f'Invalid decimal precision: {value!r}') from error


def equatorial_to_app(position):
    return [position[0], position[2], -position[1]]


def spherical_to_equatorial(ra_hours, dec_degrees, distance_pc):
    ra, dec = ra_hours * math.pi / 12, math.radians(dec_degrees)
    return [distance_pc * math.cos(dec) * math.cos(ra), distance_pc * math.cos(dec) * math.sin(ra), distance_pc * math.sin(dec)]


def coordinate_diagnostics(row):
    predicted = spherical_to_equatorial(float(row['ra']), float(row['dec']), float(row['dist']))
    actual = [float(row[key]) for key in ('x','y','z')]
    residual = math.dist(predicted, actual)
    distance = abs(float(row['dist']))
    bound = (half_decimal_step(row['dist']) + distance * (half_decimal_step(row['ra']) * math.pi / 12 + half_decimal_step(row['dec']) * math.pi / 180)
             + math.sqrt(sum(half_decimal_step(row[key])**2 for key in ('x','y','z'))) + 16 * sys.float_info.epsilon * max(1, distance))
    if not math.isfinite(residual) or not math.isfinite(bound):
        raise ValueError(f'Coordinate diagnostic overflow for HYG {row["id"]}')
    return residual, bound


def display_name(row):
    if row['proper'].strip():
        return row['proper']
    if row['bayer'].strip() and row['con']:
        return f'{row["bayer"].strip()} {row["con"]}'
    if row['flam'] and row['con']:
        return f'{int(row["flam"])} {row["con"]}'
    if row['gl'].strip():
        return f'Gl {row["gl"].strip()}'
    if row['hip']:
        return f'HIP {int(row["hip"])}'
    if row['hd']:
        return f'HD {int(row["hd"])}'
    return f'HYG {row["id"]}'


def identifiers(row):
    integer_names = {'hip':'hip','hd':'hd','hr':'hr','component':'comp','componentPrimary':'comp_primary'}
    result = {target:number(row[source], source, row['id'], True) for target,source in integer_names.items()}
    result.update({target:row[source] or None for target,source in {'gl':'gl','bf':'bf','bayer':'bayer','flam':'flam','constellation':'con','base':'base'}.items()})
    return result


def read_source(source_path):
    rows = []
    seen = set()
    with source_path.open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != FIELDS:
            raise ValueError('Unsupported HYG schema: exact retained v4.2 columns are required')
        for index,row in enumerate(reader, start=2):
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f'Malformed CSV row at line {index}')
            source_id = number(row['id'], 'id', row['id'], True)
            if source_id is None or source_id in seen:
                raise ValueError(f'Missing or duplicate source ID: {row["id"]}')
            seen.add(source_id)
            parsed = {key:number(row[key], key, source_id) for key in NUMERIC}
            for key in INTEGER:
                number(row[key], key, source_id, True)
            for key in ['ra','dec','dist','x','y','z']:
                if parsed[key] is None:
                    raise ValueError(f'Missing essential coordinate {key} for HYG {source_id}')
            if not 0 <= parsed['ra'] < 24 or not -90 <= parsed['dec'] <= 90 or parsed['dist'] < 0:
                raise ValueError(f'Invalid spherical range for HYG {source_id}')
            rows.append((index,row,parsed))
    if not rows:
        raise ValueError('Empty source catalog')
    return rows


def read_runtime(runtime_path):
    def bad_constant(value):
        raise ValueError(f'Nonfinite JSON constant: {value}')
    stars = json.loads(runtime_path.read_text(encoding='utf-8'), parse_constant=bad_constant)
    if not isinstance(stars, list) or not stars:
        raise ValueError('Runtime catalog must be a nonempty array')
    ids = set()
    for star in stars:
        if not isinstance(star, dict) or set(star) != RUNTIME_FIELDS:
            raise ValueError('Unsupported runtime record schema')
        identity = star['id']
        if not isinstance(identity, str) or not identity or identity in ids:
            raise ValueError(f'Missing or duplicate runtime ID: {identity}')
        ids.add(identity)
        for key in REQUIRED:
            value = star[key]
            if isinstance(value, bool) or not isinstance(value, (int,float)) or not math.isfinite(value):
                raise ValueError(f'Invalid runtime numeric field {key} for {identity}')
    if stars[0] != SUN_RUNTIME:
        raise ValueError('Canonical Sun does not match its explicit legacy definition')
    return stars


def build_outputs(source_path, runtime_path):
    rows = read_source(source_path)
    stars = read_runtime(runtime_path)
    records, excluded = [], []
    source_quality = collections.Counter()
    max_residual = {'sourceId':None,'residualPc':-1}
    max_retained_residual = {'sourceId':None,'residualPc':-1}
    max_runtime_difference = 0.0
    empty_identifiers = {key:None for key in identifiers(rows[0][1])}
    records.append({'id':'sol','sourceId':None,'relatedSourceId':0,'sourceLine':None,'name':'Sol','identifiers':empty_identifiers,
                    'coordinates':{'raHours':None,'decDegrees':None,'equatorialPc':[0,0,0],'appPc':[0,0,0],'catalogDistancePc':0,'sphericalResidualPc':None,'roundingBoundPc':None},
                    'photometry':{'apparentMagnitude':-26.74,'absoluteMagnitude':None,'colorIndex':0.656,'spectralType':'G2V','luminositySolar':None},
                    'motion':{'properMotionRaMasYr':None,'properMotionDecMasYr':None,'radialVelocityKmS':None},'uncertainty':None,
                    'quality':{'distanceStatus':'origin','flags':['synthetic-origin','uncertainty-not-provided']}})
    for line,row,parsed in rows:
        source_id = int(row['id'])
        missing = [field for field in REQUIRED if parsed[field] is None]
        residual, bound = coordinate_diagnostics(row)
        sentinel = parsed['dist'] >= 100000
        mismatch = residual > bound
        source_quality['sentinelDistanceRows'] += sentinel
        source_quality['sphericalCartesianMismatchRows'] += mismatch
        if residual > max_residual['residualPc']:
            max_residual = {'sourceId':source_id,'residualPc':residual,'roundingBoundPc':bound}
        if missing or row['proper'] == 'Sol':
            excluded.append({'sourceId':source_id,'sourceLine':line,'reasons':(['missing-required-values'] if missing else []) + (['replaced-by-canonical-sun'] if row['proper']=='Sol' else []),'missingFields':missing})
            continue
        identity = f'hyg:{source_id}'
        if len(records) >= len(stars) or stars[len(records)]['id'] != identity:
            raise ValueError(f'Runtime identity/order/selection mismatch at {identity}')
        star = stars[len(records)]
        app_position = equatorial_to_app([parsed['x'],parsed['y'],parsed['z']])
        expected_numbers = dict(zip(('x','y','z'),app_position), dist=parsed['dist'], mag=parsed['mag'], ci=parsed['ci'])
        for field,expected in expected_numbers.items():
            difference = abs(star[field]-expected)
            max_runtime_difference = max(max_runtime_difference,difference)
            if difference > TOLERANCE:
                raise ValueError(f'Runtime/source numeric mismatch at {identity}.{field}: {difference}')
        name = display_name(row)
        for field, expected in {'name':name,'proper':row['proper'] or None,'spect':row['spect'] or None}.items():
            if star[field] != expected:
                raise ValueError(f'Runtime/source text mismatch at {identity}.{field}: {star[field]!r} != {expected!r}')
        flags = ['uncertainty-not-provided']
        if sentinel:
            flags.append('missing-or-dubious-parallax')
        if mismatch:
            flags.append('spherical-cartesian-mismatch')
        if not row['spect']:
            flags.append('spectral-type-not-provided')
        records.append({'id':identity,'sourceId':source_id,'sourceLine':line,'name':name,'identifiers':identifiers(row),
                        'coordinates':{'raHours':parsed['ra'],'decDegrees':parsed['dec'],'equatorialPc':[parsed['x'],parsed['y'],parsed['z']],'appPc':app_position,'catalogDistancePc':parsed['dist'],'sphericalResidualPc':residual,'roundingBoundPc':bound},
                        'photometry':{'apparentMagnitude':parsed['mag'],'absoluteMagnitude':parsed['absmag'],'colorIndex':parsed['ci'],'spectralType':row['spect'] or None,'luminositySolar':parsed['lum']},
                        'motion':{'properMotionRaMasYr':parsed['pmra'],'properMotionDecMasYr':parsed['pmdec'],'radialVelocityKmS':parsed['rv']},
                        'uncertainty':None,'quality':{'distanceStatus':'missing-or-dubious-parallax' if sentinel else 'catalog-distance','flags':flags}})
        if residual > max_retained_residual['residualPc']:
            max_retained_residual = {'sourceId':source_id,'residualPc':residual,'roundingBoundPc':bound}
    if len(records) != len(stars):
        raise ValueError('Runtime catalog has records not selected from the source')
    if sum(row['proper']=='Sol' for _,row,_ in rows) != 1:
        raise ValueError('Source must contain exactly one Sol row')
    if digest(source_path.read_bytes()) != SOURCE_SHA256:
        raise ValueError('Unsupported source bytes: this pipeline is pinned to the verified HYG v4.2 input')
    retained_quality = dict(sorted(collections.Counter(flag for record in records for flag in record['quality']['flags']).items()))
    duplicate_identifiers = {}
    for field in empty_identifiers:
        counts = collections.Counter(record['identifiers'][field] for record in records if record['identifiers'][field] is not None)
        duplicate_identifiers[field] = {'duplicateValues':sum(count>1 for count in counts.values()),'recordsWithRepeatedValues':sum(count for count in counts.values() if count>1)}
    summary = {'schemaVersion':1,'status':'passed','selection':{'sourceRows':len(rows),'retainedSourceRows':len(records)-1,'canonicalOriginRecords':1,'runtimeRecords':len(records),'excludedRows':len(excluded),'excluded':excluded,'missingRequiredFieldCounts':dict(sorted(collections.Counter(field for entry in excluded for field in entry['missingFields']).items()))},
               'sourceQuality':dict(sorted(source_quality.items())),'retainedQualityFlags':retained_quality,'distanceStatuses':dict(sorted(collections.Counter(record['quality']['distanceStatus'] for record in records).items())),
               'coordinateDiagnostics':{'allSourceMaximum':max_residual,'retainedMaximum':max_retained_residual,'meaning':'Internal consistency diagnostic based on serialized decimal steps; not scientific uncertainty or a guaranteed source rounding bound.'},
               'compatibility':{'uniqueRuntimeIds':len(records),'orderPreserved':True,'runtimeValuesUnchanged':True,'maxAbsoluteNumericDifference':max_runtime_difference,'allowedAbsoluteNumericDifference':TOLERANCE},'duplicateCrossIdentifiers':duplicate_identifiers,'uncertainty':{'recordsWithSourceErrorOrCovariance':0,'recordsWithUnknownUncertainty':len(records),'inventedErrorBars':0}}
    metadata = [{key:record[key] for key in ('id','sourceId','identifiers','quality','uncertainty')} for record in records]
    exports = {'records.json':json_bytes({'schemaVersion':1,'records':records}),'runtime-metadata.json':json_bytes({'schemaVersion':1,'records':metadata}),'quality-summary.json':json_bytes(summary)}
    manifest = {'schemaVersion':1,'pipelineVersion':PIPELINE_VERSION,
                'source':{'dataset':'HYG Database','version':'4.2','filename':source_path.name,'sha256':digest(source_path.read_bytes()),'bytes':source_path.stat().st_size,'versionVerification':{'status':'verified-byte-match','upstreamUrl':UPSTREAM_URL,'upstreamCommit':UPSTREAM_COMMIT,'gzipSha256':GZIP_SHA256},'license':{'spdx':'CC-BY-SA-4.0','url':'https://creativecommons.org/licenses/by-sa/4.0/','attribution':'David Nash / Astronexus, HYG Database'}},
                'runtimeCatalog':{'filename':runtime_path.name,'sha256':digest(runtime_path.read_bytes()),'bytes':runtime_path.stat().st_size,'records':len(records),'numericToleranceAbsolute':TOLERANCE,'role':'Immutable compatibility input: IDs, selection, order and values checked against the CSV; not the source of scientific sidecar values.'},
                'generator':{'path':'scripts/build_scientific_catalog.py','sha256':digest(Path(__file__).read_bytes()),'dependencies':'Python 3 standard library','serialization':'UTF-8 compact JSON, insertion-ordered keys, finite numbers, final LF, no timestamps/absolute paths'},
                'coordinates':{'origin':'Sun','frame':'equatorial','epoch':'J2000.0','equinox':'J2000.0','units':{'position':'pc','distance':'pc','ra':'hours','dec':'degrees','properMotion':'mas/year','radialVelocity':'km/s'},'sourceAxes':['vernal equinox (RA 0h)','RA 6h','north celestial pole'],'appAxisMap':['X','Z','-Y'],'appRotationMatrix':[[1,0,0],[0,0,1],[0,-1,0]],'properMotionApplied':False,'currentPositions':False},
                'qualityPolicy':{'id':'hyg-v4.2-quality-v1','sentinelDistancePc':100000,'sentinelRule':'dist >= 100000 means missing or dubious parallax; retain raw value, exclude from default scientific distance selection.','catalogDistanceMeaning':'A retained catalog distance, not certified accuracy.','uncertainty':'No error/covariance columns exist in this source; uncertainty is null, never zero.','crossIdentifiers':'Source assertions retained without new cross-matching; duplicates are allowed and must not replace HYG identity.','coordinateMismatch':'Euclidean raw RA/Dec/distance to raw XYZ residual exceeds an application diagnostic bound derived from serialized decimal steps. Neither bound nor lack of flag is scientific uncertainty or accuracy certification.','roundingBoundFormula':'half(dist decimal step) + abs(dist)*(half(RA step)*pi/12 + half(Dec step)*pi/180) + norm(half(XYZ steps)) + 16*machine_epsilon*max(1,abs(dist))','sourceMotionZeros':'Zero motion/velocity fields are retained as source values; they do not certify a measured zero or known uncertainty.','canonicalSun':'Synthetic heliocentric origin has sourceId null and related source row 0. Scientific separation is 0 pc. Legacy runtime dist=0.0000048481 pc and photometry are explicit compatibility conventions, not a stellar parallax measurement.'},
                'selectionPolicy':{'requiredNumericFields':REQUIRED,'sourceSunExcluded':True,'canonicalSunInsertedFirst':True,'sourceOrderPreserved':True,'missingColorIndexNote':'Legacy rendering excludes rows missing color index. This is a presentation-selection policy, not proof those stars are scientifically invalid.'},
                'outputs':{name:{'sha256':digest(value),'bytes':len(value),**({'records':len(records)} if name!='quality-summary.json' else {})} for name,value in exports.items()}}
    exports['manifest.json'] = json_bytes(manifest)
    return exports


def write_outputs(exports, directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name,data in exports.items():
        (directory/name).write_bytes(data)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT/'hyg_v42.csv')
    parser.add_argument('--catalog', type=Path, default=ROOT/'stars.json')
    parser.add_argument('--output-dir', type=Path, default=ROOT/'data/pipeline')
    parser.add_argument('--check', action='store_true', help='Rebuild in a temporary directory and require byte-identical existing outputs')
    args = parser.parse_args(argv)
    try:
        exports = build_outputs(args.source, args.catalog)
        if args.check:
            # The workspace cache is writable on restricted Windows sessions;
            # the inherited process TEMP may point to an inaccessible app silo.
            temporary_root = ROOT / '.runtime'
            temporary_root.mkdir(exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='galaxy-pipeline-check-', dir=temporary_root) as temporary:
                fresh = Path(temporary)
                write_outputs(exports,fresh)
                for name in exports:
                    existing = args.output_dir/name
                    if not existing.exists() or existing.read_bytes() != (fresh/name).read_bytes():
                        raise ValueError(f'Non-reproducible or missing export: {name}')
        else:
            write_outputs(exports,args.output_dir)
        print(json.dumps({'status':'passed','mode':'check' if args.check else 'build','outputs':{name:{'bytes':len(value),'sha256':digest(value)} for name,value in exports.items()}}))
        return 0
    except (ValueError, OSError, KeyError, TypeError, OverflowError, csv.Error) as error:
        print(json.dumps({'status':'failed','error':str(error)}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
