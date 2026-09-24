/**
 * Bonus calculation utilities for experimental tasks
 * Handles bonus computation and payment tracking across different experimental modules
 */

import { flushData } from "./data-handling.js";
import { recordBonusState } from "./saveData.js";

/**
 * Rounds a numeric value to a specified number of decimal places
 * @param {number} value - The number to round
 * @param {number} digits - Number of decimal places (default: 2)
 * @returns {number} The rounded value
 */
function roundDigits(value, digits = 2) {
    const multiplier = Math.pow(10, digits);
    return Math.round(value * multiplier) / multiplier;
}

/**
 * Computes the total bonus payment for the current task
 * Scales performance between minimum and maximum bonus amounts
 * @returns {number} Total bonus amount in GBP
 */

function computeTotalBonus(module) {

    // Maximum bonus amounts for each task type
    const min_bonus = module.max_bonus * module.min_prop_bonus;

    // Initialize cumulative bonus values
    let totalEarned = 0;
    let totalMin = 0;
    let totalMax = 0;

    // Iterate over module elements
    for (const element of module.elements) {
        // Check if element is a task
        if (element.type === "task") {
            // Get the task object
            const task = element.__task;
            
            // Call the computeBonus function if it exists
            if (task.computeBonus && typeof task.computeBonus === 'function') {
                const bonusResult = task.computeBonus({
                    ...task.defaultConfig,
                    ...element.config
                });
                
                // Handle the result (could be 0, object, or array)
                if (bonusResult && typeof bonusResult === 'object') {
                    totalEarned += bonusResult.earned || 0;
                    totalMin += bonusResult.min || 0;
                    totalMax += bonusResult.max || 0;
                }
            }
        }
    }

    // Calculate proportion of performance between min and max possible scores
    const prop = Math.max(0, Math.min(1, (totalEarned - totalMin) / (totalMax - totalMin)));
    const totalBonus = prop * (module.max_bonus - min_bonus) + min_bonus;

    // Add insurance to ensure bonus is never below minimum or NaN
    return Number.isNaN(totalBonus) ? min_bonus : totalBonus;
}

/**
 * Records the running bonus tally for a task on the session document.
 *
 * computeBonus() is cumulative - it re-scans every trial of the task so far -
 * so the tally is replaced, not added to. (Accumulating would double-count on
 * every inter-block message.) This is informational only: the bonus actually
 * paid is recomputed from the trial data by computeTotalBonus().
 */
function updateBonusState(settings) {
    const taskBonus = settings.__task.computeBonus(settings) || { earned: 0, min: 0, max: 0 };

    const session_state = { ...(window.session_state || {}) };
    session_state[settings.task_name] = {
        earned: roundDigits(taskBonus.earned || 0),
        min: roundDigits(taskBonus.min || 0),
        max: roundDigits(taskBonus.max || 0)
    };

    console.log("Bonus so far:", session_state);
    window.session_state = session_state;
    recordBonusState(session_state);
}

/**
 * jsPsych trial configuration for displaying bonus payment information
 * Shows final bonus amount and handles bonus state updates
 */
function bonusTrial(module) {
    return {
        type: jsPsychHtmlKeyboardResponse,
        css_classes: ['instructions'],
        stimulus: function () {
            const total_bonus = computeTotalBonus(module);
            const formatted = total_bonus.toLocaleString('en-GB', {
                style: 'currency',
                currency: 'GBP'
            });

            // Laid out as its own block rather than through `.instructions p`,
            // whose fixed 700px left-aligned paragraphs left the heading
            // centred and the body text off to one side.
            return `
                <style>
                    .bonus-screen {
                        width: 700px;
                        max-width: 90vw;
                        margin: 0 auto;
                        text-align: center;
                        color: #182b4b;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                                     Roboto, "Helvetica Neue", Arial, sans-serif;
                    }
                    .bonus-screen .bonus-title {
                        font-size: 28px;
                        font-weight: 600;
                        line-height: 1.3;
                        margin: 0 0 0.7em;
                    }
                    .bonus-screen .bonus-lead {
                        font-size: 18px;
                        line-height: 1.5;
                        margin: 0 0 1.6em;
                    }
                    .bonus-screen .bonus-amount {
                        display: inline-block;
                        padding: 20px 44px;
                        border-radius: 12px;
                        border: 2px solid #f4ce5c;
                        background: rgba(244, 206, 92, 0.22);
                    }
                    .bonus-screen .bonus-amount-label {
                        font-size: 15px;
                        letter-spacing: 0.04em;
                        text-transform: uppercase;
                        opacity: 0.75;
                        margin-bottom: 8px;
                    }
                    .bonus-screen .bonus-amount-value {
                        font-size: 46px;
                        font-weight: 700;
                        line-height: 1.1;
                    }
                    .bonus-screen .bonus-footer {
                        font-size: 18px;
                        margin-top: 1.9em;
                    }
                </style>
                <div class="bonus-screen">
                    <div class="bonus-title">Thank you for completing this session!</div>
                    <div class="bonus-lead">It is time to reveal your total bonus payment for this session.</div>
                    <div class="bonus-amount">
                        <div class="bonus-amount-label">Altogether, you will earn an extra</div>
                        <div class="bonus-amount-value">${formatted}</div>
                    </div>
                    <div class="bonus-footer">Please call the experimenter.</div>
                </div>
            `;
    },
    choices: ['p'],
    data: { trialphase: 'bonus_trial' },
    on_start: () => {
      const bonus = computeTotalBonus(module).toFixed(2);
      
      jsPsych.data.addProperties({
          bonus: bonus
      });

      flushData();
    },
    // Never auto-advanced, including in a simulated run: pressing "p" is the
    // deliberate act of finishing the session. Everything that ends a session
    // hangs off it - endExperiment() downloads the local CSV and finalises the
    // session document - so a run parked here can still be abandoned by simply
    // closing the tab, leaving no download and no completed session.
    simulation_options: {
      simulate: false
    }
  };
}

// Export functions for use in other modules
export {
    roundDigits,
    computeTotalBonus,
    updateBonusState,
    bonusTrial
};
