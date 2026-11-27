"""Version 1 of the offline Solar System identity and evidence contract."""

import math
import re
from collections import defaultdict, deque
from datetime import date


class CatalogError(ValueError):
    """A catalog snapshot cannot be safely admitted."""


def require(test, message):
    if not test:
        raise CatalogError(message)


def unique(records, key, section):
    index = {}
    for record in records:
        identifier = record[key]
        require(isinstance(identifier, str) and identifier.strip() == identifier and identifier,
                f'{section}: blank or invalid identifier')
        require(identifier not in index, f'{section}: duplicate {identifier}')
        index[identifier] = record
    return index


def id_is_valid(value):
    return re.fullmatch(r'sol|[a-z][a-z0-9-]*:[a-z0-9][a-z0-9:-]*', value) is not None


def normalized_name(value):
    return ' '.join(value.casefold().split())


def legacy_compatibility(stars, exploration):
    """Return the explicit identity-to-itself mapping for existing exported IDs."""
    star_index = unique(stars, 'id', 'legacy stars')
    require('sol' in star_index, 'legacy stars: missing sol')
    require(all(k == 'sol' or re.fullmatch(r'hyg:[1-9][0-9]*', k) for k in star_index),
            'legacy stars: unexpected ID namespace')
    solar = unique(exploration['solar']['objects'], 'id', 'legacy solar')
    require('sol' in solar and all(k == 'sol' or k.startswith('solar:') for k in solar),
            'legacy solar: unexpected ID namespace or missing sol')
    require(star_index.keys() & solar.keys() == {'sol'}, 'legacy star/solar identity collision')
    require(all(o['id'] in star_index for o in exploration['nearby']['objects']),
            'legacy nearby: missing stellar identity')
    return {key:key for key in star_index.keys() | solar.keys()}


def require_acyclic(edges, nodes, label):
    incoming = dict.fromkeys(nodes, 0)
    for successors in edges.values():
        for successor in successors:
            incoming[successor] += 1
    ready = deque(k for k, count in incoming.items() if count == 0)
    visited = 0
    while ready:
        node = ready.popleft()
        visited += 1
        for successor in edges.get(node, ()):
            incoming[successor] -= 1
            if incoming[successor] == 0:
                ready.append(successor)
    require(visited == len(nodes), f'{label}: cycle')


class Catalog:
    """Validate and query a curated snapshot independently of renderer and ingestion."""

    def __init__(self, document):
        require(document['schemaVersion'] == 1, 'Unsupported catalog version')
        self.sources = unique(document['sources'], 'id', 'sources')
        self.objects = unique(document['objects'], 'id', 'objects')
        require(all(id_is_valid(k) for k in self.objects), 'Invalid canonical ID')
        for obj in self.objects.values():
            self._sources(obj)
            require(obj['status'] in ('active','retired') and obj['name'].strip() and obj['kind'].strip(),
                    f'Invalid identity {obj["id"]}')
        self.aliases = {}
        for rec in document['aliases']:
            self._record(rec)
            key = (rec['namespace'],rec['value'])
            require(re.fullmatch(r'[a-z][a-z0-9-]*', key[0]) is not None
                    and isinstance(key[1], str) and key[1].strip() == key[1] and key[1],
                    'Aliases require a namespace and an exact nonempty identifier')
            require(key not in self.aliases, f'Alias ownership collision: {key}')
            require(rec['kind'] in ('designation','source-id','legacy-id'), f'Invalid alias kind: {key}')
            if key[0] == 'norad':
                require(re.fullmatch(r'[1-9][0-9]{0,8}', key[1]), f'Invalid NORAD number: {key[1]}')
            if rec['kind']=='legacy-id':
                require(key == ('legacy', rec['objectId']), f'Legacy ID cannot change: {key}')
            self.aliases[key] = rec['objectId']
        self.successors = {}
        self.events = unique(document['events'], 'id', 'lifecycle events')
        for event in self.events.values():
            self._event(event)
        require(self.successors.keys() == {k for k,v in self.objects.items() if v['status']=='retired'},
                'Every retired identity requires a lifecycle event')
        require_acyclic(self.successors, self.objects, 'identity history')
        self.relationships = unique(document['relationships'], 'id', 'relationships')
        self._validate_relationships()
        self.orbits = unique(document['orbits'], 'id', 'orbit solutions')
        self._validate_orbits()
        self.assets = unique(document['assets'], 'id', 'asset products')
        for asset in self.assets.values():
            self._record(asset)
            require(asset['id'].startswith('urn:nasa:pds:') and re.search(r'::\d+(?:\.\d+)+$',asset['id']),
                    f'Asset needs a versioned PDS product ID: {asset["id"]}')
            for key in ('labelMd5','fileMd5'):
                if key in asset:
                    require(re.fullmatch(r'[0-9a-f]{32}',asset[key]), f'Invalid {key}: {asset["id"]}')
        self.assertions = unique(document['assertions'], 'id', 'physical assertions')
        self.by_field = defaultdict(list)
        rules = document['fieldRules']
        for rule in rules.values():
            ranks = rule['sourcePriority']
            require(len(set(ranks)) == len(ranks) and all(k in self.sources for k in ranks),
                    'Unknown or duplicate field preference')
        for assertion in self.assertions.values():
            self._assertion(assertion, rules)
            self.by_field[(assertion['objectId'], assertion['field'])].append(assertion)
        self.field_rules = rules

    def _sources(self, rec):
        refs = rec['sourceIds']
        require(bool(refs) and len(set(refs)) == len(refs) and all(k in self.sources for k in refs),
                'Each evidence-bearing record requires valid source references')

    def _record(self, rec):
        self._sources(rec)
        require(rec['objectId'] in self.objects, f'Unknown object {rec["objectId"]}')

    def _event(self, event):
        self._sources(event)
        before, after = event['from'], event['to']
        require(len(set(before)) == len(before) and len(set(after)) == len(after)
                and not set(before) & set(after), 'Duplicate or self-referential lifecycle ID')
        require(all(k in self.objects for k in before + after), 'Unknown lifecycle ID')
        valid = {'merge':len(before) >= 1 and len(after) == 1,
                 'split':len(before) == 1 and len(after) >= 2,
                 'retire':len(before) == 1 and not after}
        require(valid.get(event['type'], False), 'Invalid lifecycle cardinality')
        require(event['reason'].strip() and date.fromisoformat(event['effectiveOn']), 'Undated lifecycle event')
        for key in before:
            require(self.objects[key]['status']=='retired' and key not in self.successors,
                    f'Conflicting lifecycle event for {key}')
            self.successors[key] = tuple(after)

    def _validate_relationships(self):
        certain_parents = defaultdict(list)
        for rel in self.relationships.values():
            self._record(rel)
            a, b = rel['objectId'], rel['relatedId']
            require(a != b and b in self.objects, 'Relationship target invalid')
            require(rel['type'] in ('orbits','companion-of','fragment-of')
                    and rel['certainty'] in ('confirmed','suspected'), 'Invalid relationship semantics')
            if rel['type']=='orbits' and rel['certainty']=='confirmed':
                certain_parents[a].append(b)
        require_acyclic(certain_parents, self.objects, 'orbital parent relationships')

    def _validate_orbits(self):
        for record in self.orbits.values():
            self._record(record)
            require(record['centerId'] in self.objects and record['objectId'] != record['centerId'],
                    'Orbit needs a distinct known center')
            require(all(record[k].strip() for k in ('frame','timeScale','method','sourceSolutionId')),
                    f'Incomplete coordinate metadata: {record["id"]}')
            require(isinstance(record['epoch'], (int,float)) and not isinstance(record['epoch'],bool)
                    and math.isfinite(record['epoch']) and record['epochUnit']=='JD', 'Invalid solution epoch')
            validity = record['validityJD']
            require(validity is None or (len(validity)==2 and all(math.isfinite(x) for x in validity)
                                        and validity[0] <= record['epoch'] <= validity[1]), 'Invalid solution validity')
            require(record['representation'] in ('cartesian-state','elements'), 'Unsupported orbit representation')
            values = record['parameters']
            require(bool(values) and all(isinstance(v['value'],(int,float)) and not isinstance(v['value'],bool)
                                        and math.isfinite(v['value']) and v['unit'] for v in values.values()),
                    'Orbit parameters require finite values with units')
            if record['representation']=='cartesian-state':
                require(values.keys()=={'x','y','z','vx','vy','vz'}
                        and all(values[k]['unit']==('km/s' if k.startswith('v') else 'km') for k in values),
                        'Cartesian state needs a complete position and velocity in km and km/s')

    def _assertion(self, assertion, rules):
        self._record(assertion)
        rule = rules[assertion['field']]
        status, value = assertion['status'], assertion['value']
        require(assertion['unit']==rule['unit'] and assertion['method'].strip(), 'Unspecified units or method')
        require(status in ('measured','estimated','modeled','reported','unknown'), 'Unknown evidence status')
        require((value is None) == (status=='unknown'), 'Unknown is represented by null')
        if value is not None and rule['unit'] != 'text':
            require(isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value),
                    'Physical quantity needs a finite number')
        elif value is not None:
            require(isinstance(value,str) and value.strip(), 'Text assertion is blank')
        uncertainty = assertion['uncertainty']
        require(uncertainty is None or (value is not None and rule['unit']!='text'
                and isinstance(uncertainty,(int,float)) and not isinstance(uncertainty,bool)
                and math.isfinite(uncertainty) and uncertainty >= 0), 'Invalid uncertainty')
        if assertion['field']=='composition' and status!='unknown':
            require(assertion['method'] not in ('orbit-class','taxonomy-label'),
                    'A classification alone cannot establish composition')

    def resolve(self, identifier):
        """Resolve IDs with retained merge/split/retirement history."""
        if identifier not in self.objects:
            return {'status':'missing','objectIds':[]}
        if identifier not in self.successors:
            return {'status':'exact','objectIds':[identifier]}
        if not self.successors[identifier]:
            return {'status':'retired','objectIds':[]}
        pending = deque([identifier])
        visited, destinations = set(), set()
        divergent = False
        while pending:
            key = pending.popleft()
            if key in visited:
                continue
            visited.add(key)
            choices = self.successors.get(key)
            if choices is None:
                destinations.add(key)
            else:
                divergent = divergent or len(choices) > 1
                pending.extend(choices)
        status = 'split' if divergent else ('redirect' if destinations else 'retired')
        return {'status':status,'objectIds':sorted(destinations)}

    def resolve_alias(self, namespace, value):
        return self.resolve(self.aliases.get((namespace,value)))

    def validate_successor_of(self, previous):
        """Check that a later snapshot preserves published identities and history."""
        for key, old in previous.objects.items():
            require(key in self.objects,
                    f'Published ID cannot disappear: {key}; record retirement instead')
            require(old['status'] != 'retired' or self.objects[key]['status'] == 'retired',
                    f'Retired ID cannot be reactivated: {key}')
        for key, owner in previous.aliases.items():
            require(self.aliases.get(key) == owner, f'Published alias owner changed: {key}')
        for key, event in previous.events.items():
            require(self.events.get(key) == event, f'Published lifecycle event changed: {key}')

    def name_candidates(self, name):
        lookup = normalized_name(name)
        return sorted(row['id'] for row in self.objects.values()
                      if row['status']=='active' and normalized_name(row['name']) == lookup)

    def physical_field(self, object_id, field):
        rows = sorted(self.by_field.get((object_id,field),()),key=lambda item:item['id'])
        rank = {source:i for i,source in enumerate(self.field_rules[field]['sourcePriority'])}
        def priority(row):
            return min(rank.get(source,len(rank)) for source in row['sourceIds'])
        known = [r for r in rows if r['status']!='unknown']
        best_rank = min(map(priority,known), default=None)
        top = [r for r in known if priority(r)==best_rank]
        # A tied disagreement needs review. Comparable assertions stay available.
        preferred = top[0] if top and len({r['value'] for r in top}) == 1 else None
        return {'preferred':preferred,'assertions':rows,
                'conflictingValues':len({r['value'] for r in known}) > 1}

    def orbit_solution(self, solution_id):
        """Return one stored solution with its coordinate and provenance fields intact."""
        return self.orbits.get(solution_id)
