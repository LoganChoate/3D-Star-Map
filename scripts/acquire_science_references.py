"""Collect bounded, pinned upstream inputs for the Step 5 scientific acceptance suite."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlencode

from catalog_acquire import fetch, verified_input, write_json


HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/"
MRO_KERNEL = "spk_psp_rec95262_95170_95262_r-v1.bsp"
DART_ARCHIVE = NAIF + "pds/pds4/dart/dart_spice/spice_kernels/spk/"
DART_MODEL = "didymos_system_s542_v01"
CATALOG_EPOCH = "2461370.5"  # 2026-11-26 00:00 TDB, historical validation sample
MAJORS = {"mercury":199,"venus":299,"earth":399,"mars":499,"jupiter":599,"saturn":699,
          "uranus":799,"neptune":899,"pluto":999}
MOONS = {"moon":(301,399), "io":(501,599), "titan":(606,699), "charon":(901,999)}
SMALL_BODIES = {
    "apophis": ("asteroid-neos","20099942","99942;","2461200.5"),
    "ceres": ("main-belt","20000001","1;","2461200.5"),
    "chiron": ("centaurs","20002060","2060;","2461200.5"),
    "quaoar": ("tno","20050000","50000;","2461200.5"),
    "hale-bopp": ("long-period","1000132","DES=1995 O1;","2459837.5"),
    "brorsen-1989": ("comet-neos","1000009","90000344;","2447800.5"),
    "brewington": ("open-orbit-comets","1000155","DES=1996 N1;","2450304.5"),
    "parabolic": ("open-orbit-comets","1000591","DES=240 V1;","1809031.5"),
}
DEPENDENCY_URLS = {
    "naif-lsk": NAIF + "generic_kernels/lsk/naif0012.tls",
    "naif-gm": NAIF + "generic_kernels/pck/gm_de440.tpc",
    "mro-kernel": NAIF + "MRO/kernels/spk/" + MRO_KERNEL,
    "mro-label": NAIF + "MRO/kernels/spk/" + MRO_KERNEL + ".lbl",
    "dart-kernel": DART_ARCHIVE + DART_MODEL + ".bsp",
    "dart-label": DART_ARCHIVE + DART_MODEL + ".xml",
    "celestrak-sgp4": "https://celestrak.org/software/SGP4/satellite.js",
    "celestrak-vallado": "https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753.zip",
}


def horizon_url(command, center, epochs, *, plane="FRAME", scale="TDB", units="KM-S", list_type="JD"):
    options = {
        "COMMAND": command, "CENTER": f"500@{center}", "MAKE_EPHEM": "YES", "OBJ_DATA": "NO",
        "EPHEM_TYPE": "VECTORS", "REF_SYSTEM": "ICRF", "REF_PLANE": plane, "TIME_TYPE": scale,
        "OUT_UNITS": units, "VEC_TABLE": "2", "VEC_CORR": "NONE", "CSV_FORMAT": "YES",
        "TIME_DIGITS": "FRACSEC", "TLIST_TYPE": list_type, "TLIST": " ".join(epochs),
    }
    return HORIZONS + "?" + urlencode({"format": "json", **{k: f"'{v}'" for k,v in options.items()}})


def horizons_jobs():
    jobs = {}
    for name, code in MAJORS.items():
        jobs["major-" + name] = horizon_url(str(code), 10, ["2451545.0",CATALOG_EPOCH])
    for name, (code, parent) in MOONS.items():
        jobs["direct-" + name] = horizon_url(str(code),10,[CATALOG_EPOCH])
        jobs["parent-" + name] = horizon_url(str(code),parent,[CATALOG_EPOCH])
    jobs["earth-ecliptic"] = horizon_url("399",10,["2451545.0",CATALOG_EPOCH],plane="ECLIPTIC",units="AU-D")
    jobs["uranus-matched-ecliptic"] = horizon_url(str(MAJORS["uranus"]),10,["2451545.0",CATALOG_EPOCH],
                                                 plane="ECLIPTIC",units="AU-D")
    jobs["earth-utc"] = horizon_url("399",10,["2025-01-01 00:00:00"],list_type="CAL",scale="UT")
    jobs["earth-time-tdb"] = horizon_url("399",10,["2460676.500800740"])
    for name, (_, _, command, jd) in SMALL_BODIES.items():
        jobs["small-" + name] = horizon_url(command,10,[jd,str(float(jd)+0.5)])
    jobs["spacecraft-mro-nov19"] = horizon_url("-74",499,["2461363.5","2461364.0"])
    jobs["companion-dart"] = horizon_url("120065803",920065803,["2459848.5","2459850.5"])
    return jobs


def run(root, provider):
    jobs = horizons_jobs() if provider=="horizons" else (
        {k:v for k,v in DEPENDENCY_URLS.items() if not k.startswith("celestrak")}
        if provider=="naif" else {k:v for k,v in DEPENDENCY_URLS.items() if k.startswith("celestrak")})
    outcomes = {}
    for name,url in jobs.items():
        try:
            receipt = fetch(root,name,url,attempts=1 if provider=="celestrak" else 2,
                            allow_resume=provider!="celestrak", compressed=False)
            if provider=="horizons":
                response = json.loads(verified_input(root,receipt).read_bytes())
                signature = response.get("signature",{})
                if signature.get("version") not in {"1.2","1.3"} or signature.get("source")!="NASA/JPL Horizons API":
                    raise ValueError(f"Unexpected Horizons API signature {signature}")
                result = response.get("result","")
                if response.get("error") or "$$SOE" not in result or "$$EOE" not in result:
                    raise ValueError((response.get("error") or result[-600:]).strip())
            outcomes[name] = {"status":"received","receipt":receipt}
            print(name,receipt["bytes"],flush=True)
        except (OSError, ValueError, KeyError) as error:
            outcomes[name] = {"status":"unavailable", "reason":str(error)[:750],"url":url}
            print(name,"unavailable",str(error)[:160],flush=True)
            if provider=="celestrak":
                break
    write_json(root / f"{provider}-outcomes.json",outcomes)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root",type=Path)
    parser.add_argument("provider",choices=("horizons","naif","celestrak"))
    run(**vars(parser.parse_args()))
