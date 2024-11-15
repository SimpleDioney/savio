
const process = require("process")

const PORT = process.env.PORT || 5239;
const DEBUG = process.env.DEBUG || "OFF"
const QUIET = process.env.QUIET || "OFF"
const MODE = process.env.MODE || "prod"
const FILTERED_LOG = process.env.F_LOG || null

// NEM SEI SE FUNCIONA, MAS COLOQUEI PQ VAI Q NÉ :)
if (QUIET.toLowerCase() == "on") {
    console.log = () => {}
    console.debug = () => {}
    console.error = () => {}
}

module.exports = {
    getPort: () => PORT,
    inDevelopment: () => MODE.toLocaleLowerCase() == "dev",
    isDebug: () => DEBUG.toLowerCase() == "on",
    isQuiet: () => QUIET.toLowerCase() == "on",
    isFilteredLog: (identity) => FILTERED_LOG == null || identity == FILTERED_LOG
};