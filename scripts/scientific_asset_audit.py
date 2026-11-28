"""Check the representative raster metadata and preserve source-specific unknowns."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET

from catalog_acquire import digest


REPO=Path(__file__).resolve().parents[1]
RADAR="https://pds-geosciences.wustl.edu/missions/magellan/gxdr/"
SVS="https://svs.gsfc.nasa.gov/4720/"
FIELDS=("productId","version","doi","target","observation","instrument","projection","registration",
        "verticalDatum","units","resolution","footprint","spectralInterpretation","fileSizeBytes","credit")


def read(path):
    return json.loads(path.read_bytes())


def label(path):
    tree=ET.parse(path)
    root=tree.getroot()
    def tag(node):
        return node.tag.rsplit("}",1)[-1]

    def values(name, parent=None):
        group=root if parent is None else parent
        return [node for node in group.iter() if tag(node)==name]

    def grab(name, parent=None):
        return next((node.text.strip() for node in values(name,parent) if node.text and node.text.strip()),None)

    return values,grab


def stage_evidence(workspace,target):
    target.mkdir(parents=True,exist_ok=True)
    archive=workspace / "evidence" / "pluto-archive"
    attachments=workspace / ".codex-attachments"
    for body in ("pluto","charon"):
        products={f"native-{body}.xml":list(attachments.glob(f"**/nh_{body}_color_mosaic.lblx.xml"))}
        for kind in ("mosaic","dem"):
            products[f"usgs-{body}-{kind}.xml"]=list(archive.glob(f"*_usgs-xml-{body}-{kind}.sample"))
        for name,options in products.items():
            if len(options)!=1:
                raise ValueError(f"Need a uniquely retained source label for {name}")
            final=target / name
            if final.exists():
                if digest(options[0])!=digest(final):
                    raise ValueError(f"Staged label changed: {name}")
            else:
                shutil.copyfile(options[0],final)


def normalized(*,verification,classification,source,fields,**evidence):
    return {"verification":verification,"classification":classification,"source":source,
            "metadata":{key:fields.get(key) for key in FIELDS},
            "unknownFields":[key for key in FIELDS if fields.get(key) is None],
            "largeMasterAcquiredInStep5":False,**evidence}


def native_metadata(path,body,product,collections):
    values,get=label(path)
    recorded=product["raster"]
    map_info=product["cartography"]
    ident=get("logical_identifier")+"::"+get("version_id")
    if hashlib.md5(path.read_bytes(),usedforsecurity=False).hexdigest()!=product["labelMd5"] or ident!=product["lidvid"]:
        raise ValueError(f"PDS label digest or LIDVID mismatch for {body}")
    axes={get("axis_name",axis):int(get("elements",axis)) for axis in values("Axis_Array")}
    resolutions=[get("pixel_resolution_x"),get("pixel_resolution_y")]
    bands=[node.text.strip() for node in values("filter_name")]
    same=(axes=={"Band":4,"Line":recorded["height"],"Sample":recorded["width"]}
        and recorded["dataType"]==get("data_type")=="IEEE754LSBSingle"
        and get("missing_constant")==recorded["missingBits"]
        and [int(x) for x in resolutions]==map_info["metersPerPixel"]
        and [int(get(which)) for which in ("upperleft_corner_x","upperleft_corner_y")]==map_info["upperLeftMeters"]
        and int(get("a_axis_radius"))==map_info["referenceRadiusMeters"]
        and get("latitude_type")==map_info["latitudeType"] and get("longitude_direction")==map_info["longitudeDirection"]
        and bands==[item["name"] for item in recorded["bands"]]
        and int(get("offset"))+4*axes["Band"]*axes["Line"]*axes["Sample"]==product["bytes"])
    if not same:
        raise ValueError(f"PDS archive label and catalog disagree for {body}")
    return normalized(verification="Label MD5, LIDVID, band order, sampling and binary byte count agree",
        classification="processed-multispectral",
        source=product["labelUrl"],
        fields={"productId":ident,"version":get("version_id"),"doi":collections["composition"]["doi"],
                "target":get("name",values("Target_Identification")[0]),
                "observation":[get("start_date_time"),get("stop_date_time")] if get("start_date_time") else None,
                "instrument":get("name",values("Observing_System_Component")[1]),
                "projection":get("map_projection_name"),"registration":get("pixel_registration"),
                "verticalDatum":None,"units":"Dimensionless processed reflectance-like samples",
                "resolution":{"value":[int(x) for x in resolutions],"unit":"m/pixel"},
                "footprint":map_info.get("observedFootprint"),
                "spectralInterpretation":"Four processed channels in archive order: "+", ".join(bands),
                "fileSizeBytes":product["bytes"],"credit":"New Horizons MVIC, NASA PDS Small Bodies Node"},
        targetCode=body,catalogAssetId=ident,sourceSha256=digest(path),
        labelMd5=product["labelMd5"],dataType=recorded["dataType"],
        registrationEvidence={"sampleOrdering":recorded["order"],"projectionOriginMeters":map_info["upperLeftMeters"],
                              "pixelCenterConvention":"unknown","coordinateReferenceRadiusMeters":map_info["referenceRadiusMeters"],
                              "latitude":map_info["latitudeType"],"longitude":map_info["longitudeDirection"]},
        noDataBits=recorded["missingBits"],rights=product["derivedDistribution"])


def usgs_metadata(path,body,kind,product):
    _,get=label(path)
    sizes=(int(get("colcount")),int(get("rowcount")))
    if sizes!=tuple(product["dimensions"]) or get("onlink")!=product["productPage"]:
        raise ValueError(f"USGS XML dimensions or URL differ for {body} {kind}")
    datum=None
    units=None
    conflict=None
    if kind=="dem":
        units=get("altunits")
        if units and units.lower()!="meters":
            raise ValueError("Unexpected vertical units in the USGS DEM")
        if not units:
            conflict="FGDC altunits is blank. The access register documents meters from product descriptions. Confirm decoded payload units before use."
        datum={"value":product["referenceRadiusMeters"],"unit":"m","description":"Body reference sphere"}
        if product.get("noData")!=-32768:
            raise ValueError("DEM NODATA differs from the verified TIFF header record")
    return normalized(verification="USGS XML identity, dimensions, registration and attribution match archive evidence",
        classification="elevation" if kind=="dem" else "grayscale-image",
        source=product["label"],fields={"productId":get("file_identifier"),
        "version":get("edition"),"doi":None,"target":body.title(),
        "observation":{"start":get("begdate"),"end":get("enddate"),"scope":"FGDC source interval"},
        "instrument":"New Horizons LORRI/MVIC","projection":product["projection"],"registration":get("rasttype"),
        "verticalDatum":datum,"units":units if kind=="dem" else "Display brightness",
        "resolution":{"value":product["nominalMetersPerPixel"],"unit":"m/pixel"},
        "footprint":None,"spectralInterpretation":"Mono base map" if kind=="mosaic" else "Stereo-derived height",
        "fileSizeBytes":product["bytes"],"credit":get("origin")},
        targetCode=body,catalogAssetId=product["productPage"],sourceSha256=digest(path),
        relatedPdsLidvid=product.get("relatedPdsLidvid"),
        unresolvedVerticalUnits=conflict,dimensions=sizes,payloadNoData=product.get("noData"),
        rights={"access":get("accconst"),"attribution":get("useconst"),
                "redistribution":product["originalRedistribution"]})


def audit_assets(directory):
    archive=read(REPO / "docs" / "pluto-archive-register.json")
    results={}
    for entry in archive["products"]:
        body=entry["target"]
        if "lidvid" in entry:
            key=f"native-{body}"
            results[key]=native_metadata(directory / (key+".xml"),body,entry,archive["collections"])
        else:
            kind="dem" if entry["kind"]=="USGS elevation" else "mosaic"
            key=f"usgs-{body}-{kind}"
            results[key]=usgs_metadata(directory / (key+".xml"),body,kind,entry)

    moon=read(REPO / "assets" / "moon" / "manifest.json")
    assert moon["body"]["meanRadiusKm"]==1737.4
    for key,kind,product_id,interpretation in (
        ("moon-color","natural-color-processed","LROC Hapke normalized WAC mosaic",
         "Processed lunar reflectance appearance with white balance and polar treatment"),
        ("moon-elevation","elevation","ldem_64.tif","LOLA floating-point height above a sphere"),
    ):
        heights=kind=="elevation"
        results[key]=normalized(verification="NASA SVS source conventions checked against the approved Moon manifest",
            classification=kind,source=SVS,
            fields={"productId":product_id,"target":"Moon","instrument":"LRO LOLA" if heights else "LRO WAC",
                    "projection":"Global cylindrical, centered on 0 degrees",
                    "verticalDatum":{"value":1737.4,"unit":"km"} if heights else None,
                    "units":"km" if heights else "Processed texture color",
                    "resolution":{"value":64,"unit":"pixels/degree"} if heights else None,
                    "spectralInterpretation":interpretation,"credit":"NASA Scientific Visualization Studio"},
            sourceSha256=digest(REPO / "assets" / "moon" / "manifest.json"))
    for key,product_id,doi,kind,meaning in (
        ("magellan-reflectivity","MGN-V-RDRS-5-GDR-REFLECTIVITY-V1.0","10.17189/1522517",
         "radar-reflectivity","Radar reflection coefficients"),
        ("magellan-topography","MGN-V-RDRS-5-GDR-TOPOGRAPHIC-V1.0","10.17189/1522522",
         "elevation","Radar altimetry-derived topography"),
    ):
        results[key]=normalized(verification="PDS Magellan GxDR product-class and DOI records reviewed; product raster audit pending",
            classification=kind,source=RADAR,fields={"productId":product_id,"version":"1.0","doi":doi,"target":"Venus",
                  "instrument":"Magellan Radar System","spectralInterpretation":meaning,"credit":"NASA Magellan / PDS Geosciences Node"},
            doiSource="https://pds-geosciences.wustl.edu/dataserv/doi.htm",
            classificationSource="https://pds.nasa.gov/datastandards/documents/dd/all/current/ch67s09.html")
    if len({x["classification"] for x in results.values()})<5:
        raise ValueError("Spectrum, reflectivity and elevation classifications collapsed")
    return results


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace",type=Path)
    parser.add_argument("target",type=Path)
    stage_evidence(**vars(parser.parse_args()))
