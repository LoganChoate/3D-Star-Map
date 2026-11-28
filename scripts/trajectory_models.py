"""Frame- and time-aware trajectory models for offline catalog acceptance."""

import csv
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import math
import re


AU_KM = 149597870.700
DAY_SECONDS = 86400
J2000 = Decimal("2451545.0")
UTC_ORIGIN = datetime(2000,1,1,12,tzinfo=timezone.utc)


class CoverageError(ValueError):
    """The requested time or model is outside supported coverage."""


def epoch(value):
    try:
        result = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError("Invalid Julian epoch") from exc
    if not result.is_finite():
        raise ValueError("Nonfinite Julian epoch")
    return result


@dataclass(frozen=True)
class State:
    center: str
    frame: str
    scale: str
    at: str
    values: tuple

    def __post_init__(self):
        if len(self.values) != 6 or any(not math.isfinite(v) for v in self.values):
            raise ValueError("A state needs six finite position/velocity components")

    def compatible(self, other):
        return (self.center, self.frame, self.scale, epoch(self.at)) == (
            other.center, other.frame, other.scale, epoch(other.at)
        )


def difference(state, reference):
    if not state.compatible(reference):
        raise ValueError("State comparison requires matching center, frame, time scale and epoch")
    return {"positionKm": math.dist(state.values[:3], reference.values[:3]),
            "velocityKmPerS": math.dist(state.values[3:], reference.values[3:])}


def compose(parent, relative, parent_id):
    if relative.center != str(parent_id):
        raise ValueError("Relative state is not centered on the supplied primary")
    if (parent.frame, parent.scale, epoch(parent.at)) != (relative.frame, relative.scale, epoch(relative.at)):
        raise ValueError("Parent and relative states must share frame and epoch")
    return State(parent.center, parent.frame, parent.scale, parent.at,
                 tuple(a+b for a,b in zip(parent.values, relative.values)))


def rotate_x(vector, angle):
    x,y,z=vector
    cos,sin=math.cos(angle),math.sin(angle)
    return (x,y*cos-z*sin,y*sin+z*cos)


def rotate_z(vector, angle):
    x,y,z=vector
    cos,sin=math.cos(angle),math.sin(angle)
    return (x*cos-y*sin,x*sin+y*cos,z)


def to_icrf(state, obliquity_arcsec):
    if state.frame!="ECLIPJ2000":
        raise ValueError("Expected the declared J2000 ecliptic frame")
    angle=math.radians(obliquity_arcsec/3600)
    return State(state.center,"ICRF",state.scale,state.at,
                 rotate_x(state.values[:3],angle)+rotate_x(state.values[3:],angle))


def parse_horizons(response, center, *, target=None, target_contains=None, plane="FRAME",
                   scale="TDB", units="KM-S"):
    signature=response.get("signature",{})
    if signature.get("source")!="NASA/JPL Horizons API" or signature.get("version") not in {"1.2","1.3"}:
        raise ValueError("Unrecognized Horizons response version/source")
    text=response["result"]
    lines={key:re.search(r"^"+key+r"\s*:\s*(.*)$",text,re.M) for key in
           ("Target body name","Center body name","Reference frame","Output units","Output type")}
    if any(not value for value in lines.values()):
        raise ValueError("Missing Horizons state metadata")
    info={key:value[1].strip() for key,value in lines.items()}
    code_match=lambda value, code: bool(re.search(r"\("+re.escape(str(code))+r"\)\s*(?:\{|$)",value))
    target_report=info["Target body name"]
    if (target is not None and not code_match(target_report,target)) or (
        target_contains and target_contains.casefold() not in target_report.casefold()
    ):
        raise ValueError(f"Horizons target identity mismatch: {target_report}")
    frame, prefix = ("ICRF","ICRF") if plane=="FRAME" else ("ECLIPJ2000","Ecliptic of J2000.0")
    if (not code_match(info["Center body name"],center) or not info["Reference frame"].startswith(prefix)
            or info["Output units"]!=units or not info["Output type"].startswith("GEOMETRIC")):
        raise ValueError(f"Horizons center, frame, units or correction mismatch: {info}")
    heading = "JDTDB," if scale=="TDB" else "JDUT ,"
    if heading not in text or "Calendar Date ("+("TDB" if scale=="TDB" else "UT ") + ")" not in text:
        raise ValueError("Horizons time scale header mismatch")
    if text.count("$$SOE")!=1 or text.count("$$EOE")!=1:
        raise ValueError("Missing or repeated Horizons vector boundaries")
    payload=text.split("$$SOE",1)[1].split("$$EOE",1)[0].strip()
    result={}
    for row in csv.reader(payload.splitlines()):
        if len(row)<8:
            raise ValueError("Truncated Horizons vector row")
        at=epoch(row[0])
        if at in result:
            raise ValueError("Ambiguous Horizons sample epoch")
        values=tuple(float(v) for v in row[2:8])
        if units=="AU-D":
            values=tuple(v*AU_KM for v in values[:3])+tuple(v*AU_KM/DAY_SECONDS for v in values[3:])
        result[at]=State(str(center),frame,scale,format(at,"f"),values)
    return info,result


def at_sample(series, jd):
    try:
        return series[epoch(jd)]
    except KeyError as exc:
        raise CoverageError("No retained Horizons state at this exact epoch") from exc


def finite(value):
    result=float(value)
    if not math.isfinite(result):
        raise ValueError("Nonfinite orbital parameter")
    return result


def utc_julian(instant):
    """Represent a civil UTC instant on the nominal day scale used by SGP4."""
    if instant.utcoffset()!=timedelta(0):
        raise ValueError("Expected a UTC instant")
    delta=instant-UTC_ORIGIN
    seconds=Decimal(delta.days*DAY_SECONDS+delta.seconds)+Decimal(delta.microseconds)/1000000
    return J2000+seconds/DAY_SECONDS


def root(fn, low, high):
    """Solve a monotonic equation on a verified finite bracket."""
    if fn(low)>0 or fn(high)<0:
        raise ValueError("Orbit solver could not bracket anomaly")
    for _ in range(90):
        mid=(low+high)/2
        if mid==low or mid==high:
            return mid
        if fn(mid)>0:
            high=mid
        else:
            low=mid
    return (low+high)/2


def conic_elements(row, mu):
    if row.get("equinox")!="J2000":
        raise ValueError("Expected JPL ecliptic J2000 elements")
    q,e=finite(row["q"])*AU_KM,finite(row["e"])
    at=epoch(row["epoch"])
    if q<=0 or e<0 or mu<=0:
        raise ValueError("Invalid eccentricity, perihelion or gravitational parameter")
    if abs(e-1)<1e-8 and e!=1:
        raise CoverageError("Near-parabolic representation needs a validated universal-variable model")
    angles=tuple(math.radians(finite(row[x])) for x in ("i","om","w"))
    # The provider's mean anomaly belongs to this precise solution epoch.
    if e==1:
        seconds=float((at-epoch(row["tp"]))*DAY_SECONDS)
        mean=seconds/math.sqrt(2*q**3/mu)
    elif row.get("ma") is None:
        raise CoverageError("The conic has no mean anomaly at its solution epoch")
    else:
        mean=math.radians(finite(row["ma"]))
    return q,e,*angles,mean,at,mu


def conic(row, jd, mu, max_hours):
    q,e,inc,node,arg,mean,start,mu=conic_elements(row,mu)
    at=epoch(jd)
    days=at-start
    if abs(days)*24>max_hours:
        raise CoverageError("Requested time is outside the allowed two-body estimate window")
    seconds=float(days*DAY_SECONDS)
    if e==1:
        mean += seconds/math.sqrt(2*q**3/mu)
        d=2*math.sinh(math.asinh(1.5*mean)/3)
        x,y=q*(1-d*d),2*q*d
        s,c=2*d/(1+d*d),(1-d*d)/(1+d*d)
        speed=math.sqrt(mu/(2*q))
        vx,vy=-speed*s,speed*(1+c)
    else:
        a=q/abs(1-e)
        n=math.sqrt(mu/a**3)
        mean += n*seconds
        if e<1:
            mean=math.remainder(mean,math.tau)
            ang=root(lambda s:s-e*math.sin(s)-mean,mean-e,mean+e)
            cos,sin=math.cos(ang),math.sin(ang)
            slope=math.sqrt((1-e)*(1+e))
            x,y=a*(cos-e),a*slope*sin
            v=a*n/(1-e*cos)
            vx,vy=-v*sin,v*slope*cos
        else:
            wanted=abs(mean)
            ang=math.copysign(root(lambda h:e*math.sinh(h)-h-wanted,0,math.asinh(wanted/e)+3),mean)
            cos,sin=math.cosh(ang),math.sinh(ang)
            slope=math.sqrt((e-1)*(e+1))
            x,y=a*(e-cos),a*slope*sin
            v=a*n/(e*cos-1)
            vx,vy=-v*sin,v*slope*cos

    def rotate(values):
        return rotate_z(rotate_x(rotate_z(values,arg),inc),node)

    return State("10","ECLIPJ2000","TDB",format(at,"f"),rotate((x,y,0))+rotate((vx,vy,0)))


class Sgp4Orbit:
    def __init__(self,row,max_hours):
        from sgp4 import omm
        from sgp4.api import Satrec, WGS72
        self.norad = str(row["NORAD_CAT_ID"])
        if not re.fullmatch(r"[1-9][0-9]{0,8}",self.norad):
            raise ValueError("Expected a 1–9 digit NORAD identity")
        for key, default in (("CENTER_NAME","EARTH"),("REF_FRAME","TEME"),("TIME_SYSTEM","UTC"),
                             ("MEAN_ELEMENT_THEORY","SGP4")):
            if row.get(key,default).upper()!=default:
                raise ValueError(f"Unsupported GP convention for {key}")
        self.solution=datetime.fromisoformat(row["EPOCH"])
        if self.solution.utcoffset() not in {None,timedelta(0)}:
            raise ValueError("CelesTrak GP epochs require zero-offset UTC")
        self.solution=self.solution.replace(tzinfo=timezone.utc)
        self.max_minutes=60*max_hours
        engine_id=self.norad if int(self.norad)<=339999 else "1"
        self.engine=Satrec()
        omm.initialize(self.engine,{**row,"NORAD_CAT_ID":engine_id,
                                     "EPOCH":self.solution.replace(tzinfo=None).isoformat(timespec="microseconds")},WGS72)

    def sample(self,minutes):
        if not math.isfinite(minutes) or abs(minutes)>self.max_minutes:
            raise CoverageError("Requested time is outside the allowed SGP4 estimate window")
        error,xyz,velocity=self.engine.sgp4_tsince(minutes)
        if error:
            raise CoverageError(f"SGP4 rejected this state with code {error}")
        at=utc_julian(self.solution+timedelta(minutes=minutes))
        return State("399","TEME","UTC",format(at,"f"),tuple(xyz)+tuple(velocity))
