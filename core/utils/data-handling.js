import { preventRefresh } from "./participation-validation.js"
import { flushNow, recordState, finaliseSession } from "./saveData.js"

/**
 * Data handling utilities.
 *
 * Trial data reaches Firestore through saveData.js, driven by jsPsych's
 * on_data_update hook - see experiment.html. The helpers here are the
 * checkpoint and end-of-session hooks that task code calls directly.
 */

/**
 * Formats a date string into a standardized YYYY-MM-DD_HH:MM:SS format.
 * @param {string} s - The date string to format
 * @returns {string} Formatted date string in YYYY-MM-DD_HH:MM:SS format
 */
function format_date_from_string(s){
    const dateTime = new Date(s);

    // Get individual components
    const year = dateTime.getFullYear();
    const month = String(dateTime.getMonth() + 1).padStart(2, '0'); // Months are zero-indexed
    const day = String(dateTime.getDate()).padStart(2, '0');
    const hours = String(dateTime.getHours()).padStart(2, '0');
    const minutes = String(dateTime.getMinutes()).padStart(2, '0');
    const seconds = String(dateTime.getSeconds()).padStart(2, '0');

    // Format the date and time
    const formattedDate = `${year}-${month}-${day}`;
    const formattedTime = `${hours}:${minutes}:${seconds}`;

    return formattedDate + "_" + formattedTime
}

/**
 * Force any buffered trial data to be written now.
 *
 * Trials are already persisted continuously, so this is a checkpoint rather
 * than an upload: it just stops the writer waiting out its coalescing interval
 * at points where losing the last second of data would matter.
 *
 * @returns {Promise} Resolves once the buffer is empty
 */
function flushData() {
    return flushNow();
}

/**
 * Records an experiment state marker and flushes buffered data.
 *
 * State markers land on the session document (`last_state` plus a `states`
 * array), which makes a participant's progress visible in Firestore while the
 * session is still running.
 *
 * @param {string} state - Current experiment state identifier
 * @param {boolean} save_data - Whether to also flush buffered trial data
 */
function updateState(state, save_data = true) {
    console.log(state);
    recordState(state);

    if (!state.includes("no_resume") && save_data){
        flushData();
    }
}

/**
 * Handles experiment completion: local backup, final flush, session summary.
 */
async function endExperiment() {

    console.log("Experiment finished. Sending final data...");

    // Remove beforeunload event listener to allow page navigation
    window.removeEventListener('beforeunload', preventRefresh);

    // Write the local CSV backup first: it is instant and cannot fail on a bad
    // network, so the session is never left with no copy at all.
    const sitting_start_time = format_date_from_string(jsPsych.getStartTime());
    const record_id = window.participantID + "_" + sitting_start_time;
    jsPsych.data.get().localSave('csv', `${record_id}.csv`);

    // Then close out the session document and wait for the server to confirm.
    const last = jsPsych.data.get().last(1);
    await finaliseSession({
        bonus: last.select('bonus').values[0] ?? null,
        total_time: jsPsych.getTotalTime(),
        n_warnings: last.select('n_warnings').values[0] ?? 0
    });

    console.log("All data acknowledged by the server.");
}

// Export functions for use in other modules
export {
    format_date_from_string,
    updateState,
    flushData,
    endExperiment
};
