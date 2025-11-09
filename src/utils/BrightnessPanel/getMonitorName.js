const getMonitorName = (monitor, renames) => {
    if (Object.keys(renames).indexOf(monitor.id) >= 0 && renames[monitor.id] != "") {
        return renames[monitor.id]
    } else {
        return monitor.name
    }
}

export default getMonitorName