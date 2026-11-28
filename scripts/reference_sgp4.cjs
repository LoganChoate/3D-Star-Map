const fs = require("node:fs");
const path = require("node:path");

const satellite = require(path.resolve(process.argv[2]));
// This distribution's OMM initializer calls the browser's satellite global.
globalThis.satellite = satellite;
// The provider's browser build logs epoch details during initialization.
console.log = console.error;
if (typeof satellite.json2satrec !== "function" || typeof satellite.sgp4 !== "function") {
    throw new Error("The retained CelesTrak library does not support modern GP");
}

const inputs = JSON.parse(fs.readFileSync(0, "utf8"));
const results = inputs.map(({row, minutes}) => {
    for (const field of ["MEAN_MOTION_DOT", "MEAN_MOTION_DDOT", "BSTAR", "INCLINATION",
        "RA_OF_ASC_NODE", "ECCENTRICITY", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "MEAN_MOTION"]) {
        row[field] = Number(row[field]);
    }
    const reference = satellite.json2satrec(row);
    return minutes.map(offset => {
        const state = satellite.sgp4(reference, offset);
        if (!state.position || !state.velocity || reference.error) throw new Error("SGP4 reference rejected the case");
        const values = [state.position.x,state.position.y,state.position.z,state.velocity.x,state.velocity.y,state.velocity.z];
        if (!values.every(Number.isFinite)) throw new Error("Nonfinite SGP4 reference state");
        return values;
    });
});
process.stdout.write(JSON.stringify(results));
