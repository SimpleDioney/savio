const StaticConfigs = require("./staticConfigs")

function consoleDebug(identity, ...otherParams)
{
    if (StaticConfigs.isDebug() && !StaticConfigs.isQuiet() && StaticConfigs.isFilteredLog(identity)) {
        console.debug(`DEBUG (${identity}) : `, ...otherParams);
    }
}

function consoleError(identity, ...otherParams)
{
    if (!StaticConfigs.isQuiet() && StaticConfigs.isFilteredLog(identity)) {
        console.error(`ERROR (${identity}) : `, ...otherParams);
    }
}

function consoleInfo(identity, ...otherParams)
{
    if (!StaticConfigs.isQuiet() && StaticConfigs.isFilteredLog(identity)) {
        console.info(`INFO (${identity}) : `, ...otherParams);
    }
}

module.exports = {
    logDebug: consoleDebug,
    logError: consoleError,
    logInfo:  consoleInfo
}