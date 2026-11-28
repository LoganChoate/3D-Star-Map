"""Check that the local workbench applies an accepted Step 5 receipt only to its pinned scope."""

import argparse
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "scripts"))

from catalog_acquire import write_json
from catalog_workbench import StaleCatalog, Workbench


def checks(bundle,index,validation,output):
    report=json.loads(validation.read_bytes())
    view=Workbench(bundle,index,validation)
    expected={key for key,record in report["orbitalReview"].items() if record["status"]=="historical-samples"}
    cases=[]

    page=view.search({"validity":"historical-samples"})
    assert page["nextCursor"] is None
    assert {item["id"] for item in page["items"]}==expected and len(expected)==15
    assert view.options()["scienceReviewLoaded"]
    cases.append("Only the 15 objects with checked historical samples appear in that validity filter")

    nears=[("norad:25544","TEME","UTC"),("jpl-small-body:20099942","ICRF","TDB")]
    for key,frame,scale in nears:
        query={"q":key,"mode":"exact"}
        assert not view.search({**query,"validity":"validated"})["items"]
        result=view.search({**query,"validity":"estimate-only"})["items"]
        assert len(result)==1
        proof=view.object(key)["scientificReview"]
        assert proof["frame"]==frame and proof["timeScale"]==scale and proof["currentTracking"] is False
        assert proof["limitHoursFromEpoch"]==24
    cases.append("SGP4 and two-body estimates preserve their different frames and never become checked ephemerides")

    for key in ("solar:uranus","companion:a:65803:1","spacecraft:mars-reconnaissance-orbiter"):
        proof=view.object(key)["scientificReview"]
        assert proof["exactEpochsJd"] and proof["currentTracking"] is False
    assert view.object("solar:uranus")["scientificReview"]["priorComparison"]
    cases.append("Uranus source disagreement and exact Dimorphos and MRO epochs remain visible")

    ids={key for key,v in report["orbitalReview"].items() if v["status"]=="data-only"}
    assert ids and {a["id"] for a in view.search({"validity":"data-only"})["items"]}==ids
    for key in ids:
        assert view.object(key)["validity"]=="data-only"
    assert view.object("moon:saturn:xxvii")["validity"]=="unchecked"
    cases.append("Docked and missing-GP records remain searchable, and unreviewed models remain unchecked")

    asset_id=report["assetReview"]["usgs-charon-dem"]["catalogAssetId"]
    proof=view.asset(asset_id)["scientificReview"]
    assert proof["classification"]=="elevation" and proof["metadata"]["units"] is None
    assert proof["unresolvedVerticalUnits"] and proof["payloadNoData"]==-32768
    native_id=report["assetReview"]["native-charon"]["catalogAssetId"]
    assert view.asset(native_id)["scientificReview"]["classification"]=="processed-multispectral"
    cases.append("Asset dossiers distinguish multispectral Mosaic and DEM and expose missing vertical units")

    with TemporaryDirectory() as temporary:
        copy=Path(temporary)/"receipt.json"
        write_json(copy,{**report,"sourceSha256":"0"*64})
        try:
            view.load_science(copy,report["sourceSha256"])
        except StaleCatalog:
            pass
        else:
            raise AssertionError("Receipt for a different catalog was accepted")
        patched={**report["orbitalReview"],"norad:25544":{**report["orbitalReview"]["norad:25544"],"currentTracking":True}}
        write_json(copy,{**report,"orbitalReview":patched})
        try:
            view.load_science(copy,report["sourceSha256"])
        except StaleCatalog:
            pass
        else:
            raise AssertionError("Live tracking flag was accepted")
    cases.append("The workbench rejects mismatched evidence and live-tracking claims")

    standalone=Workbench(bundle,index)
    assert not standalone.search({"validity":"historical-samples"})["items"]
    assert standalone.object("solar:uranus")["scientificReview"] is None
    cases.append("The original offline workbench still runs with no scientific receipt attached")
    result={"status":"passed","cases":cases,"historicalObjectCount":len(expected)}
    write_json(output,result)
    print(json.dumps(result))


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    for field in ("bundle","index","validation","output"):
        parser.add_argument(field,type=Path)
    checks(**vars(parser.parse_args()))
