"""Acceptance tests for the Step 2 identity and evidence contract."""

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from catalog_identity import Catalog, CatalogError, legacy_compatibility


def read(relative):
    return json.loads((ROOT/relative).read_bytes())


SEED = read('catalog/identity-seed.json')
FIXTURE = 'synthetic-contract-tests'


def identity(id_, name, status='active'):
    return {'id':id_,'name':name,'kind':'test object','status':status,'sourceIds':[FIXTURE]}


def alias(id_, namespace, value):
    return {'objectId':id_,'namespace':namespace,'value':value,'kind':'source-id','sourceIds':[FIXTURE]}


def event(id_, type_, prior, result):
    return {'id':id_,'type':type_,'from':prior,'to':result,'effectiveOn':'2026-11-27',
            'reason':'Synthetic lifecycle example','sourceIds':[FIXTURE]}


class IdentityContract(unittest.TestCase):
    def setUp(self):
        self.doc = copy.deepcopy(SEED)
        self.doc['sources'].append({'id':FIXTURE,'uri':'test:synthetic'})

    def test_all_released_ids_are_preserved(self):
        stars, exploration = read('stars.json'), read('data/exploration-catalog.json')
        original_ids = {row['id'] for row in stars + exploration['solar']['objects']}
        mapping = legacy_compatibility(stars, exploration)
        self.assertEqual(len(mapping), 117_744)
        self.assertEqual(mapping, {key:key for key in original_ids})
        catalog = Catalog(SEED)
        for row in SEED['aliases']:
            if row['kind'] == 'legacy-id':
                self.assertEqual(catalog.resolve_alias('legacy',row['value'])['objectIds'],[mapping[row['value']]])

    def test_pluto_charon_and_their_products_are_distinct(self):
        catalog = Catalog(SEED)
        self.assertEqual(catalog.resolve_alias('jpl-horizons','999')['objectIds'],['solar:pluto'])
        self.assertEqual(catalog.resolve_alias('iau-minor-planet','134340')['objectIds'],['solar:pluto'])
        self.assertEqual({r['objectId'] for r in catalog.relationships.values()
                          if r['relatedId']=='solar:pluto' and r['type']=='companion-of'},
                         {'solar:charon','solar:nix','solar:hydra','solar:kerberos','solar:styx'})
        products = {p['objectId']:p for p in catalog.assets.values()}
        for body, size, center in (('pluto',1_055_701_248,180),('charon',116_006_912,0)):
            asset = products['solar:'+body]
            self.assertTrue(asset['id'].endswith(f':nh_{body}_color_mosaic::1.0'))
            self.assertEqual(asset['expectedBytes'],size)
            self.assertEqual(asset['cartography']['centralMeridianDeg'],center)
            self.assertEqual(asset['raster']['missingBits'],'0xFF7FFFFB')
            self.assertEqual(asset['download'],'full file pending')
            self.assertEqual(catalog.physical_field('solar:'+body,'mapReferenceRadius')['preferred']['status'],'modeled')

    def test_provisional_name_does_not_make_known_moon_suspected(self):
        catalog = Catalog(SEED)
        self.assertEqual(catalog.resolve_alias('iau-satellite','S/2005 P 2')['objectIds'],['solar:nix'])
        self.assertEqual(catalog.name_candidates('Nix'),['solar:nix'])
        relations = catalog.relationships.values()
        self.assertTrue(any(r['objectId']=='solar:nix' and r['certainty']=='confirmed' for r in relations))
        self.assertTrue(any(r['objectId']=='minor:1016-candidate-2016' and r['certainty']=='suspected' for r in relations))

    def test_same_body_under_asteroid_and_comet_designations(self):
        catalog = Catalog(SEED)
        self.assertEqual(catalog.resolve_alias('iau-minor-planet','2060'),
                         catalog.resolve_alias('iau-comet','95P'))
        self.assertEqual(catalog.resolve_alias('iau-comet','95P')['objectIds'],['minor:2060'])
        self.assertEqual(catalog.resolve_alias('iau-comet','2060')['status'],'missing')

    def test_renamed_object_preserves_id_and_source_alias(self):
        original = Catalog(SEED).resolve_alias('iau-satellite','S/2005 P 2')
        self.doc['objects'] = [dict(o,name='Fixture rename') if o['id']=='solar:nix' else o
                               for o in reversed(self.doc['objects'])]
        catalog = Catalog(self.doc)
        self.assertEqual(catalog.resolve_alias('iau-satellite','S/2005 P 2'),original)
        self.assertEqual(catalog.name_candidates('fixture RENAME'),['solar:nix'])

    def test_duplicate_names_do_not_join_and_identifier_namespaces_are_separate(self):
        self.doc['objects'] += [identity('test:a','Shared Name'),identity('test:b','Shared Name')]
        self.doc['aliases'] += [alias('test:a','provider-a','12'),alias('test:b','provider-b','12')]
        catalog = Catalog(self.doc)
        self.assertEqual(catalog.name_candidates('  shared  NAME '),['test:a','test:b'])
        self.assertEqual(catalog.resolve_alias('provider-a','12')['objectIds'],['test:a'])
        self.assertEqual(catalog.resolve_alias('provider-b','12')['objectIds'],['test:b'])

    def test_alias_collision_is_rejected(self):
        self.doc['aliases'].append(alias('solar:charon','jpl-horizons','999'))
        with self.assertRaisesRegex(CatalogError,'Alias ownership collision'):
            Catalog(self.doc)

    def test_legacy_alias_cannot_be_reassigned(self):
        a = next(a for a in self.doc['aliases'] if a['namespace']=='legacy' and a['value']=='sol')
        a['objectId'] = 'solar:earth'
        with self.assertRaisesRegex(CatalogError,'Legacy ID cannot change'):
            Catalog(self.doc)

    def test_next_snapshot_cannot_reassign_published_alias(self):
        previous = Catalog(SEED)
        row = next(a for a in self.doc['aliases'] if a['namespace']=='jpl-horizons' and a['value']=='999')
        row['objectId']='solar:charon'
        with self.assertRaisesRegex(CatalogError,'Published alias owner changed'):
            Catalog(self.doc).validate_successor_of(previous)

    def test_next_snapshot_can_rename_and_retire_but_not_rewrite_history(self):
        previous = Catalog(SEED)
        nix = next(r for r in self.doc['objects'] if r['id']=='solar:nix')
        nix['name'] = 'Updated fixture name'
        self.doc['objects'].append(identity('test:old','Old fixture','retired'))
        entry = event('retire-old','retire',['test:old'],[])
        self.doc['events'].append(entry)
        snapshot = Catalog(copy.deepcopy(self.doc))
        snapshot.validate_successor_of(previous)
        entry['reason'] = 'Edited after publication'
        with self.assertRaisesRegex(CatalogError,'Published lifecycle event changed'):
            Catalog(self.doc).validate_successor_of(snapshot)

    def test_fragments_and_nine_digit_norad_ids_remain_distinct(self):
        self.doc['objects'] += [identity(f'test:{key}','Comet') for key in ('parent','frag-a','frag-b','sat')]
        self.doc['aliases'] += [alias('test:frag-a','iau-comet','73P-B'),alias('test:frag-b','iau-comet','73P-C'),
                                alias('test:sat','norad','100001234')]
        for key in ('frag-a','frag-b'):
            self.doc['relationships'].append({'id':key,'objectId':'test:'+key,'relatedId':'test:parent',
                                              'type':'fragment-of','certainty':'confirmed','sourceIds':[FIXTURE]})
        catalog = Catalog(self.doc)
        self.assertEqual(catalog.resolve_alias('iau-comet','73P-B')['objectIds'],['test:frag-a'])
        self.assertEqual(catalog.resolve_alias('iau-comet','73P-C')['objectIds'],['test:frag-b'])
        self.assertEqual(catalog.resolve_alias('norad','100001234')['objectIds'],['test:sat'])
        self.assertEqual(catalog.resolve_alias('norad','1234')['status'],'missing')

    def test_redirect_split_and_retirement_are_explicit(self):
        self.doc['objects'] += [identity('test:'+k,k,'retired') for k in ('duplicate','coarse','old')]
        self.doc['objects'] += [identity('test:'+k,k) for k in ('a','b')]
        self.doc['aliases'].append(alias('test:duplicate','test-provider','old-id'))
        self.doc['events'] += [event('dedupe','merge',['test:duplicate'],['test:a']),
                               event('separate','split',['test:coarse'],['test:a','test:b']),
                               event('retire','retire',['test:old'],[])]
        catalog = Catalog(self.doc)
        self.assertEqual(catalog.resolve_alias('test-provider','old-id'),{'status':'redirect','objectIds':['test:a']})
        self.assertEqual(catalog.resolve('test:coarse'),{'status':'split','objectIds':['test:a','test:b']})
        self.assertEqual(catalog.resolve('test:old'),{'status':'retired','objectIds':[]})
        self.assertEqual(catalog.events['separate']['sourceIds'],[FIXTURE])

    def test_redirect_cycle_is_rejected(self):
        self.doc['objects'] += [identity('test:x','X','retired'),identity('test:y','Y','retired')]
        self.doc['events'] += [event('cycle-x','merge',['test:x'],['test:y']),
                               event('cycle-y','merge',['test:y'],['test:x'])]
        with self.assertRaisesRegex(CatalogError,'identity history: cycle'):
            Catalog(self.doc)

    def test_orbit_bundles_remain_atomic(self):
        first = self.doc['orbits'][0]
        second = copy.deepcopy(first)
        second.update(id='fixture-different-orbit',sourceIds=[FIXTURE],sourceSolutionId='synthetic-other',
                      epoch=2460000.0,validityJD=[2460000.0,2460000.0])
        second['parameters']['x']['value'] = 123
        self.doc['orbits'].append(second)
        catalog = Catalog(self.doc)
        self.assertEqual(catalog.orbit_solution(first['id']),first)
        self.assertEqual(catalog.orbit_solution(second['id']),second)
        self.assertEqual(catalog.orbit_solution(first['id'])['validityJD'],[2451545.0,2451545.0])
        self.assertIsNone(catalog.orbit_solution('missing'))
        del second['parameters']['vx']
        with self.assertRaisesRegex(CatalogError,'complete position and velocity'):
            Catalog(self.doc)

    def test_assertion_conflicts_and_field_priority(self):
        self.doc['fieldRules']['exampleRadius'] = {'unit':'km','sourcePriority':['horizons-pluto',FIXTURE]}
        def reading(id_, source, value, status, uncertainty):
            return {'id':id_,'objectId':'solar:pluto','field':'exampleRadius','sourceIds':[source],
                    'value':value,'unit':'km','status':status,'method':'synthetic reading','uncertainty':uncertainty}
        self.doc['assertions'] += [reading('measurement-a','horizons-pluto',50,'measured',1),
                                   reading('estimate-b',FIXTURE,52,'estimated',None)]
        result = Catalog(self.doc).physical_field('solar:pluto','exampleRadius')
        self.assertEqual(result['preferred']['value'],50)
        self.assertTrue(result['conflictingValues'])
        self.assertEqual({a['value'] for a in result['assertions']},{50,52})
        self.doc['assertions'].append(reading('measurement-c','horizons-pluto',51,'measured',0.1))
        self.assertIsNone(Catalog(self.doc).physical_field('solar:pluto','exampleRadius')['preferred'])

    def test_unknown_composition_is_distinct_from_taxonomy(self):
        catalog = Catalog(SEED)
        self.assertEqual(catalog.physical_field('minor:2060','taxonomy')['preferred']['value'],'B-type')
        unknown = catalog.physical_field('minor:2060','composition')
        self.assertIsNone(unknown['preferred'])
        self.assertEqual(unknown['assertions'][0]['status'],'unknown')
        row = next(r for r in self.doc['assertions'] if r['field']=='composition')
        row.update(value='B-type',status='reported',method='taxonomy-label')
        with self.assertRaisesRegex(CatalogError,'cannot establish composition'):
            Catalog(self.doc)

    def test_unknown_provenance_and_invalid_units_are_rejected(self):
        record = self.doc['assertions'][0]
        record['sourceIds'] = ['missing-source']
        with self.assertRaisesRegex(CatalogError,'valid source references'):
            Catalog(self.doc)
        record.update(sourceIds=[FIXTURE],unit='km')
        with self.assertRaisesRegex(CatalogError,'Unspecified units or method'):
            Catalog(self.doc)


if __name__ == '__main__':
    unittest.main()
