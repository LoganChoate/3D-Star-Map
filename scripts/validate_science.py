"""Replay Step 5 reference, frame, time and trajectory comparisons offline."""

import argparse
from contextlib import closing
from dataclasses import asdict
from decimal import Decimal
from importlib import metadata
import json
import math
from pathlib import Path
import re
import sqlite3
import subprocess
import zipfile

import spiceypy as spice
from sgp4.api import Satrec, WGS72

from acquire_science_references import CATALOG_EPOCH, MAJORS, MOONS, SMALL_BODIES
from catalog_acquire import digest, verified_input, write_json
from scientific_asset_audit import audit_assets
from trajectory_models import (
    CoverageError, DAY_SECONDS, J2000, Sgp4Orbit, State, at_sample, compose, conic,
    conic_elements, difference, epoch, parse_horizons, to_icrf,
)


REPO = Path(__file__).resolve().parents[1]
POLICY = REPO / "catalog" / "science-validation-policy.json"
REF_SGP4 = REPO / "scripts" / "reference_sgp4.cjs"
MODEL_EDGES = {"companion-dart": (120065803,920065803,"dart-kernel","companionKernelCrossCheck"),
               "spacecraft-mro-nov19": (-74,499,"mro-kernel","spacecraftCrossCheck")}
TARGET_NAMES = {"apophis":"Apophis","ceres":"Ceres","chiron":"Chiron","quaoar":"Quaoar",
                "hale-bopp":"Hale-Bopp","brorsen-1989":"23P/Brorsen-Metcalf",
                "brewington":"Brewington","parabolic":"240 V1"}
HISTORICAL_IDS = {"moon":"solar:moon","io":"moon:jupiter:i","titan":"moon:saturn:vi",
                  "charon":"solar:charon","companion-dart":"companion:a:65803:1",
                  "spacecraft-mro-nov19":"spacecraft:mars-reconnaissance-orbiter"}


def read(path):
    return json.loads(path.read_bytes())


def et(jd):
    return float((epoch(jd)-J2000)*DAY_SECONDS)


def add_case(cases, name, result, thresholds, *, estimate=False, extra=None):
    passed=all(result[key]<=limit for key,limit in thresholds.items())
    cases.append({"id":name,"outcome":"pass" if passed else "withheld" if estimate else "fail",
                  "measured":result,"limits":thresholds,**(extra or {})})
    return passed


def compare(cases,name,actual,expected,tolerance,*,estimate=False,extra=None):
    evidence={"computedState":asdict(actual),"referenceState":asdict(expected),
              "units":{"position":"km","velocity":"km/s"},**(extra or {})}
    return add_case(cases,name,difference(actual,expected),tolerance,estimate=estimate,extra=evidence)


def assert_refusal(cases, name, callback, error=CoverageError):
    try:
        callback()
    except error as failure:
        cases.append({"id":name,"outcome":"pass","refusal":str(failure)})
    else:
        cases.append({"id":name,"outcome":"fail","reason":"Unsupported state was returned"})


class References:
    def __init__(self, root):
        self.root=root
        self.inputs={}
        self.meta={}

    def path(self,name):
        receipt=read(self.root / "receipts" / (name+".json"))
        if receipt.get("name")!=name:
            raise ValueError("Reference receipt identity mismatch")
        self.inputs[name]=receipt
        return verified_input(self.root,receipt)

    def series(self,name,center,**settings):
        response=read(self.path(name))
        info,states=parse_horizons(response,center,**settings)
        self.meta[name]={"apiVersion":response["signature"]["version"],**info}
        return states


def loaded_state(target, center, at, coverage):
    seconds=et(at)
    if not any(first<=seconds<=last for first,last in coverage):
        raise CoverageError("Requested time is outside the retained SPK segment coverage")
    result,_=spice.spkezr(str(target),seconds,"J2000","NONE",str(center))
    return State(str(center),"ICRF","TDB",format(epoch(at),"f"),tuple(float(v) for v in result))


def checked_horizons(refs, cases, objects, policy):
    tol=policy["tolerances"]
    samples={}
    for name, target in MAJORS.items():
        job="major-"+name
        series=refs.series(job,10,target=target)
        at_sample(series,CATALOG_EPOCH)
        samples[name]=series
        objects["solar:"+name]={"status":"historical-samples","method":"Horizons geometric state",
                               "centerId":"10","frame":"ICRF","timeScale":"TDB",
                               "exactEpochsJd":[format(k,"f") for k in series],
                               "source":refs.inputs[job]["url"],"currentTracking":False}
        if name!="pluto":
            # Older committed runtime snapshots are independent saved exports in AU and the J2000 ecliptic.
            raw=(REPO / "data" / "horizons" / (name+".txt")).read_text(encoding="utf-8")
            existing,existing_states=parse_horizons({"signature":{"source":"NASA/JPL Horizons API","version":"1.2"},
                                       "result":raw},10,target=target,plane="ECLIPTIC",units="AU-D")
            assert existing["Reference frame"].startswith("Ecliptic of J2000.0")
            # The live pair below has explicit vector-table versions. This check compares the retained app position.
            converted=to_icrf(at_sample(existing_states,J2000),policy["frames"]["horizonsEclipticObliquityArcsec"])
            old_center=existing["Center body name"]
            new_center=refs.meta[job]["Center body name"]
            matched=old_center==new_center
            accepted=compare(cases,"existing-app-"+name,converted,at_sample(series,J2000),tol["frameRotation"],
                    estimate=not matched,extra={"retainedFileSha256":digest(REPO / "data" / "horizons" / (name+".txt")),
                                                "retainedCenter":old_center,"referenceCenter":new_center,
                                                "crossSource":not matched})
            if not accepted and not matched:
                objects["solar:"+name]["priorComparison"] = "Older app snapshot uses a different Sun-center solution. Cross-source agreement was withheld."
    for name,job in (("earth","earth-ecliptic"),("uranus","uranus-matched-ecliptic")):
        rotated=refs.series(job,10,target=MAJORS[name],plane="ECLIPTIC",units="AU-D")
        for jd, old in rotated.items():
            actual=to_icrf(old,policy["frames"]["horizonsEclipticObliquityArcsec"])
            compare(cases,f"frame-and-units-{name}-{jd}",actual,at_sample(samples[name],jd),tol["frameRotation"],
                    extra={"eclipticCenter":refs.meta[job]["Center body name"],
                           "icrfCenter":refs.meta["major-"+name]["Center body name"]})
    assert_refusal(cases,"reject-sparse-ephemeris-interpolation",lambda:at_sample(samples["earth"],"2461370.25"))
    assert_refusal(cases,"reject-unrotated-frame",lambda:difference(next(iter(rotated.values())),
        next(iter(samples["uranus"].values()))),ValueError)
    for name,(code,parent) in MOONS.items():
        parent_name=next(k for k,value in MAJORS.items() if value==parent)
        relative=at_sample(refs.series("parent-"+name,parent,target=code),CATALOG_EPOCH)
        direct=at_sample(refs.series("direct-"+name,10,target=code),CATALOG_EPOCH)
        base=at_sample(samples[parent_name],CATALOG_EPOCH)
        added=compose(base,relative,parent)
        if compare(cases,"parent-center-"+name,added,direct,tol["parentClosure"],
                   extra={"bodyCenter":str(parent),"parentState":asdict(base),"relativeState":asdict(relative)}):
            objects[HISTORICAL_IDS[name]]={"status":"historical-samples","method":"Horizons parent-relative geometry",
                                          "centerId":str(parent),"frame":"ICRF","timeScale":"TDB",
                                          "exactEpochsJd":[relative.at],
                                          "source":refs.inputs["parent-"+name]["url"],"currentTracking":False}
        if name=="charon":
            assert_refusal(cases,"reject-pluto-barycenter-substitution",lambda:compose(base,relative,9),ValueError)


def check_time(refs,cases,policy):
    tol=policy["tolerances"]["timeConversion"]
    ticks=[spice.str2et(f"2016 DEC 31 23:59:{second:02d} UTC") for second in (59,60)]
    ticks.append(spice.str2et("2017 JAN 01 00:00:00 UTC"))
    delta=max(abs(ticks[i+1]-ticks[i]-1) for i in range(2))
    add_case(cases,"utc-leap-second",{"seconds":delta},{"seconds":tol["seconds"]},
             extra={"source":"NAIF naif0012.tls, 2016-12-31 leap insertion"})
    ref=at_sample(refs.series("earth-utc",10,target=399,scale="UT"),"2460676.5")
    converted=spice.str2et("2025 JAN 01 00:00:00 UTC")
    reference=at_sample(refs.series("earth-time-tdb",10,target=399),"2460676.500800740")
    timing=abs(converted-et(reference.at))
    retyped=State(ref.center,ref.frame,"TDB",reference.at,ref.values)
    limits={key:value for key,value in tol.items() if key!="seconds"}
    compare(cases,"utc-and-tdb-earth-vectors",retyped,reference,limits,
            extra={"utc":"2025-01-01T00:00:00Z","tdbJd":reference.at,"sampleTimeOffsetSeconds":timing})
    assert_refusal(cases,"reject-ut-tdb-without-conversion",lambda:difference(ref,reference),ValueError)


def check_kernels(refs,cases,objects,policy):
    for name,(target,center,input_name,tolerance_name) in MODEL_EDGES.items():
        path=refs.path(input_name)
        refs.path("mro-label" if input_name=="mro-kernel" else "dart-label")
        spice.furnsh(str(path))
        try:
            window=spice.spkcov(str(path),target)
            coverage=[spice.wnfetd(window,k) for k in range(spice.wncard(window))]
            if not coverage:
                raise ValueError(f"SPK has no segments for {target}")
            reference=refs.series(name,center,target=target)
            known=[]
            for jd,expected in reference.items():
                try:
                    measured=loaded_state(target,center,jd,coverage)
                    ok=compare(cases,f"{name}@{jd}",measured,expected,
                               policy["tolerances"][tolerance_name],estimate=True)
                    if ok:
                        known.append(format(jd,"f"))
                except (CoverageError,spice.utils.exceptions.SpiceyError) as error:
                    cases.append({"id":f"{name}@{jd}","outcome":"withheld","reason":str(error)[:230]})
            earlier=J2000+Decimal(str(coverage[0][0]-1))/DAY_SECONDS
            later=J2000+Decimal(str(coverage[-1][-1]+1))/DAY_SECONDS
            for title,jd in (("early",earlier),("late",later)):
                assert_refusal(cases,"reject-"+name+"-"+title,lambda:loaded_state(target,center,jd,coverage))
            objects[HISTORICAL_IDS[name]]={
                "status":"historical-samples" if known else "validation-withheld",
                "method":"NAIF archival SPICE checked against Horizons","centerId":str(center),
                "frame":"J2000 axes","timeScale":"TDB","exactEpochsJd":known,"currentTracking":False,
                "kernelCoverageEtSeconds":coverage,"source":refs.inputs[name]["url"],
            }
        finally:
            spice.unload(str(path))


def select(db,dataset,key):
    row=db.execute("SELECT object_id,disposition,payload FROM source_rows WHERE dataset=? AND source_key=?",
                   (dataset,key)).fetchone()
    if row is None:
        raise ValueError(f"Missing pinned Step 3 source row {dataset}:{key}")
    return row[0],row[1],json.loads(row[2])


def check_conics(refs,cases,objects,policy,db,fields):
    mu=float(spice.bodvrd("SUN","GM",1)[1][0])
    hours=policy["limits"]["jplConicHoursFromElements"]
    limit=policy["tolerances"]
    for name,(dataset,key,_,expected_epoch) in SMALL_BODIES.items():
        identity,_,values=select(db,dataset,key)
        row=dict(zip(fields,values))
        if epoch(row["epoch"])!=epoch(expected_epoch) or str(row["spkid"])!=key:
            raise ValueError(f"Accepted small-body identity or epoch changed: {name}")
        numeric=conic_elements(row,mu)
        spice_elements=(*numeric[:6],et(numeric[6]),mu)
        reference=refs.series("small-"+name,10,target_contains=TARGET_NAMES[name])
        benchmark_data={"method":"Two-body osculating estimate",
                        "status":"estimate-only","sourceSolution":row["orbit_id"],
                        "solutionEpochJdTdb":row["epoch"],"lastObservation":row["last_obs"],
                        "centerId":"10","frame":"ICRF","timeScale":"TDB","currentTracking":False,
                        "source":refs.inputs["small-"+name]["url"],"precisionAgreementJd":[],
                        "limitHoursFromEpoch":hours}
        for jd,context in reference.items():
            state=conic(row,jd,mu,hours)
            official=State("10","ECLIPJ2000","TDB",state.at,tuple(spice.conics(spice_elements,et(jd))))
            compare(cases,f"conic-arithmetic-{name}@{jd}",state,official,limit["conicArithmetic"],
                    extra={"class":row["class"],"eccentricity":row["e"],"acceptedSourceRow":row})
            converted=to_icrf(state,policy["frames"]["horizonsEclipticObliquityArcsec"])
            if compare(cases,f"conic-versus-horizons-{name}@{jd}",converted,context,
                       limit["smallBodyEstimate"],estimate=True):
                benchmark_data["precisionAgreementJd"].append(context.at)
        objects[identity]=benchmark_data
        if name=="apophis":
            conic(row,epoch(expected_epoch)+Decimal(hours)/24,mu,hours)
            assert_refusal(cases,"reject-conic-just-outside-window",
                           lambda:conic(row,epoch(expected_epoch)+Decimal(hours)/24+Decimal("0.0000001"),mu,hours))
    uid,_,dimorphos=select(db,"small-moons","a:65803:1")
    required={"e","epoch","ma","a","w","i","om"}
    missing=sorted(key for key in required if dimorphos["orbit"].get(key) is None)
    if not missing:
        raise ValueError("Expected missing fields in the accepted companion fixture")
    cases.append({"id":"dimorphos-unusable-catalog-elements","outcome":"pass","missing":missing,
                  "decision":"Withheld catalog-element propagation. Independent archived kernel handled separately."})
    if uid not in objects:
        objects[uid]={"status":"validation-withheld","method":"Incomplete SB satellites source row",
                      "currentTracking":False}


def published_sgp4(cases, refs, policy, dependency_dir):
    with zipfile.ZipFile(refs.path("celestrak-vallado")) as archive:
        source=archive.read("sgp4/cpp/testsgp4/SGP4-VER.TLE").decode("ascii")
    tles={}
    line1=None
    for line in source.splitlines():
        if line.startswith("1 "):
            line1=line
        elif line.startswith("2 ") and line1:
            tles[int(line[2:7])]=(line1[:69],line[:69])
    reference_file=dependency_dir / "sgp4" / "tcppver.out"
    vectors={}
    group=None
    for line in reference_file.read_text(encoding="ascii").splitlines():
        if m:=re.fullmatch(r"\s*(\d+)\s+xx\s*",line):
            group=int(m[1])
        elif group in {5,4632,6251,8195}:
            cols=line.split()
            if len(cols)>=7:
                vectors.setdefault(group,[]).append((float(cols[0]),tuple(map(float,cols[1:7]))))
    if vectors[5][0][1]!=(7022.46529266,-1400.08296755,0.03995155,1.893841015,6.405893759,4.534807250):
        raise ValueError("Bundled output does not match the published first Vallado record")
    for norad,rows in vectors.items():
        engine=Satrec.twoline2rv(*tles[norad],WGS72)
        for minutes,wanted in (rows[0],rows[-1]):
            code,pos,vel=engine.sgp4_tsince(minutes)
            assert code==0
            values=tuple(pos)+tuple(vel)
            add_case(cases,f"vallado-{norad}@{minutes:g}min",
                     {"positionKm":math.dist(values[:3],wanted[:3]),
                      "velocityKmPerS":math.dist(values[3:],wanted[3:])},
                     policy["tolerances"]["sgp4Arithmetic"],
                     extra={"reference":"Vallado Rev. 3 TCPPVER.OUT","sourceMinutesFromEpoch":minutes})
    return digest(reference_file)


def modern_sgp4(cases,refs,objects,policy,db):
    rows=[]
    for key in ("25544","100000","41866"):
        raw=db.execute("SELECT source_key FROM source_rows WHERE dataset='gp-active' AND source_key=? AND disposition='imported'",
                       (key,)).fetchone()
        if raw:
            rows.append(select(db,"gp-active",key))
    if not any(float(row["MEAN_MOTION"])<6 for _,_,row in rows):
        key=db.execute("""SELECT source_key FROM source_rows WHERE dataset='gp-active' AND disposition='imported'
                      AND CAST(json_extract(payload,'$.MEAN_MOTION') AS REAL)<2 LIMIT 1""").fetchone()[0]
        rows.append(select(db,"gp-active",key))
    minutes=[-1440,0,720,1440]
    js_path=refs.path("celestrak-sgp4")
    reference=json.loads(subprocess.check_output(["node",str(REF_SGP4),str(js_path)],
        input=json.dumps([{"row":row,"minutes":minutes} for _,_,row in rows]).encode(),timeout=25))
    max_hours=policy["limits"]["sgp4HoursFromElements"]
    for (identity,_,row),values in zip(rows,reference,strict=True):
        engine=Sgp4Orbit(row,max_hours)
        success=True
        for offset,wanted in zip(minutes,values,strict=True):
            actual=engine.sample(offset)
            target=State("399","TEME","UTC",actual.at,tuple(wanted))
            success &= compare(cases,f"modern-gp-{engine.norad}@{offset}min",actual,target,
                               policy["tolerances"]["sgp4Arithmetic"],
                               extra={"UTCNominalJulianDay":actual.at,"acceptedSourceRow":row})
        objects[identity]={"status":"estimate-only" if success else "validation-withheld",
                            "method":"SGP4/WGS72","source":refs.inputs["celestrak-sgp4"]["url"],
                            "centerId":"399","frame":"TEME","timeScale":"UTC",
                            "solutionEpochUtc":engine.solution.isoformat(),"limitHoursFromEpoch":max_hours,
                            "currentTracking":False}
    engine=Sgp4Orbit(rows[0][2],max_hours)
    assert_refusal(cases,"reject-sgp4-just-outside-window",lambda:engine.sample(1440.001))
    identifier="987654321"
    synthetic=Sgp4Orbit({**rows[0][2],"NORAD_CAT_ID":identifier},max_hours)
    assert synthetic.norad==identifier
    add_case(cases,"preserve-nine-digit-norad",difference(synthetic.sample(0),engine.sample(0)),
             {"positionKm":0,"velocityKmPerS":0},extra={"synthetic":True,"noradId":identifier})
    assert_refusal(cases,"reject-nonsgp4-orbit-theory",
                   lambda:Sgp4Orbit({**rows[0][2],"MEAN_ELEMENT_THEORY":"DSST"},max_hours),ValueError)
    dock=db.execute("SELECT source_key FROM source_rows WHERE dataset='gp-stations' AND disposition='imported-docked' LIMIT 1").fetchone()
    if dock:
        identity,disposition,_=select(db,"gp-stations",dock[0])
        objects[identity]={"status":"data-only","method":"Docked SATCAT association","currentTracking":False}
        cases.append({"id":"docked-gp-withheld","outcome":"pass","objectId":identity,"disposition":disposition})
    missing=db.execute("""SELECT s.object_id FROM source_rows s WHERE s.dataset='satcat' AND s.object_id IS NOT NULL
                         AND json_extract(s.payload,'$.OBJECT_TYPE')='DEB' AND NOT EXISTS (
                            SELECT 1 FROM source_rows g WHERE g.dataset IN ('gp-active','gp-stations')
                            AND g.source_key=s.source_key AND g.disposition='imported'
                         ) LIMIT 1""").fetchone()
    if missing:
        objects[missing[0]]={"status":"data-only","method":"SATCAT identity, no matched GP elements","currentTracking":False}
        cases.append({"id":"no-sgp4-for-untracked-debris","outcome":"pass","objectId":missing[0]})


def run(bundle, reference_dir, asset_inputs, dependency_dir, output):
    src=read(bundle / "manifest.json")
    db_path=bundle / "catalog.sqlite3"
    if src["status"]!="reconciled" or digest(db_path)!=src["catalogSha256"]:
        raise ValueError("Step 5 requires the hash-verified Step 3 bundle")
    p=read(POLICY)
    refs=References(reference_dir)
    cases,objects=[],{}
    spice.kclear()
    spice.furnsh(str(refs.path("naif-lsk")))
    spice.furnsh(str(refs.path("naif-gm")))
    out_hash=None
    try:
        with closing(sqlite3.connect(db_path.resolve().as_uri()+"?mode=ro&immutable=1",uri=True)) as db:
            checked_horizons(refs,cases,objects,p)
            check_time(refs,cases,p)
            check_kernels(refs,cases,objects,p)
            check_conics(refs,cases,objects,p,db,src["formats"]["sbdbFields"])
            out_hash=published_sgp4(cases,refs,p,dependency_dir)
            modern_sgp4(cases,refs,objects,p,db)
            assets=audit_assets(asset_inputs)
    finally:
        spice.kclear()
    for key in assets:
        cases.append({"id":"asset-"+key,"outcome":"pass","decision":assets[key]["verification"]})
    failed=sum(row["outcome"]=="fail" for row in cases)
    counts={label:sum(row["outcome"]==label for row in cases) for label in ("pass","withheld","fail")}
    report={"schema":1,"status":"passed" if failed==0 else "failed","sourceSha256":src["catalogSha256"],
            "policySha256":digest(POLICY),"cases":cases,"counts":counts,"orbitalReview":objects,"assetReview":assets,
            "referenceReceipts":refs.inputs,"horizonsHeaders":refs.meta,"valladoOutputSha256":out_hash,
            "software":{k:metadata.version(k) for k in ("spiceypy","sgp4","numpy")}}
    write_json(output,report)
    print(json.dumps({"status":report["status"],"counts":counts,"orbitalReviews":len(objects),"assetReviews":len(assets),
                      "withheld":[{"id":r["id"],"measured":r.get("measured"),"reason":r.get("reason")}
                                  for r in cases if r["outcome"]=="withheld"],
                      "failed":[r for r in cases if r["outcome"]=="fail"]}),flush=True)
    return failed


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle",type=Path)
    parser.add_argument("reference_dir",type=Path)
    parser.add_argument("asset_inputs",type=Path)
    parser.add_argument("dependency_dir",type=Path)
    parser.add_argument("output",type=Path)
    raise SystemExit(bool(run(**vars(parser.parse_args()))))
