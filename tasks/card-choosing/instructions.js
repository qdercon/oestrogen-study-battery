// Import necessary functions and components
import { interBlockStimulus } from './utils.js';
import { 
    updateState,
    createPressBothTrial,
    shuffleArray
} from '@utils/index.js';
import { buildCardChoosingTask } from './utils.js';

// Configuration constants for PILT instructions
const small_coin_size = 100; // Size of coin images in pixels
const demo_stimuli = [
    "almond_1.jpg",
    "envelope_1.jpg",
    "strainer_1.jpg",
    "anchor_1.jpg",
    "bus_1.jpg",
    "cantaloupe_1.jpg"
]

/**
 * Prepares the complete instruction sequence for the PILT (Probabilistic Instrumental Learning Task)
 * @returns {Array} Array of jsPsych trial objects containing all instruction pages, practice trials, and quiz
 */
function preparePILTInstructions(settings) {
    // Create inter-block instruction stimulus
    const inter_block_instruct = {
        type: jsPsychInstructions,
        css_classes: ['instructions'],
        pages: () => [interBlockStimulus()],
        show_clickable_nav: true,
        data: {trialphase: "pilt_instruction"}
    }

    // Main instruction sequence
    let inst =  [
        {
            type: jsPsychInstructions,
            css_classes: ['instructions'],
            pages: () => {

            let pages = [
            `<p><b>THE CARD CHOOSING GAME</b></p>
                <p>In this game you will flip cards to collect the coins behind them.</p>
                <p>Some cards are luckier than others. Your goal is to collect as much game money as possible and avoid losing it.</p>
                <p>At the end of this session, the coins you collected will be turned into a points score, so the more coins you collect, the higher your score.</p>`,
            `<p>On each turn of this game, you will see two cards.
                You have four seconds to flip one of the two cards.</p>
                <p>This will reveal the coin you collect: either 1 pound, 50 pence, or 1 penny.</p>
                <div style='display: grid;'><table style='width: 200px; grid-column: 2;'><tr>
                <td><img src='./assets/images/card-choosing/outcomes/1pound.png' style='width:${small_coin_size}px; height:${small_coin_size}px;'></td>
                <td><img src='./assets/images/card-choosing/outcomes/50pence.png' style='width:${small_coin_size}px; height:${small_coin_size}px;'></td>
                <td><img src='./assets/images/card-choosing/outcomes/1penny.png' style='width:${small_coin_size}px; height:${small_coin_size}px;'></td></tr></table></div>`,
        ];

        pages.push(`<p>When you flip a card, you might see broken coins like these:</p>\
                <div style='display: grid;'><table style='width: 200px; grid-column: 2;'><tr>
                <td><img src='./assets/images/card-choosing/outcomes/1poundbroken.png' style='width:${small_coin_size}px; height:${small_coin_size}px;'></td>
                <td><img src='./assets/images/card-choosing/outcomes/50pencebroken.png' style='width:${small_coin_size}px; height:${small_coin_size}px;'></td>
                <td><img src='./assets/images/card-choosing/outcomes/1pennybroken.png' style='width:${small_coin_size}px; height:${small_coin_size}px;'></td></tr></table></div>
                <p>This means you lose that amount of game coins.</p>`);
            pages.push(`<p>Sometimes, losing coins cannot be avoided. Your goal then is to lose as little money as possible.</p>
                <p>To cover these losses, you will start the game with £100 in game coins.</p>`)

        return pages
    },
        show_clickable_nav: true,
        data: {trialphase: "pilt_instruction"},
        on_start: () => {updateState("pilt_instructions_start")}
    }
    ];

    // Add explanation and practice instructions
    inst = inst.concat([{
        type: jsPsychInstructions,
        css_classes: ['instructions'],
        pages: [
            `<p>Some cards are better than others, and through trial and error, you can learn which ones are best.</p> 
            <p>However, even the best cards may sometimes give only a penny or occasionally break a one-pound coin.</p>`
        ],
        show_clickable_nav: true,
        data: {trialphase: "pilt_instruction"}
    },
    createPressBothTrial(
        `<p>Let's practice collecting coins. \
            On the next screen, choose cards to collect as much money as you can.</p>
            <p>One of the picture cards has mostly £1 coins behind it, while the other has mostly broken £1 coins behind it.</p>
            <p>When you're ready, place your fingers comfortably on the <strong>left and right arrow keys</strong> as shown below. Press down <strong> both left and right arrow keys at the same time </strong> to begin.</p>
            <img src='./assets/images/2_finger_keys.jpg' style='width:250px;'></img>
        `,
        "pilt_instruction"
    )
   ]);

    // Generate randomized practice trial sequences
    let dumbbell_on_right = shuffleArray([true, true, false, true, false, false], settings.session);
    let reward_magnitude = shuffleArray([1, 1, 1, 0.5, 1, 1.], settings.session + "b");

    // Four practice trials
    dumbbell_on_right = dumbbell_on_right.slice(0, 4);
    reward_magnitude = reward_magnitude.slice(0, 4);

    // Add main practice task
    inst.push(
        {
            timeline: buildCardChoosingTask(
                [
                    // Map trials with alternating good/bad card positions
                    dumbbell_on_right.map((e, i) => 
                        ({
                            stimulus_left: e ? demo_stimuli[2] : demo_stimuli[3],
                            stimulus_right: e ? demo_stimuli[3] : demo_stimuli[2],
                            stimulus_middle: "",
                            feedback_middle: "",
                            n_stimuli: 2,
                            optimal_side: "",
                            // Set feedback values based on card position and session type
                            feedback_left: e ? -1. : reward_magnitude[i],
                            feedback_right: e ? reward_magnitude[i] : -1.,
                            optimal_right: e,
                            block: "practice2",
                            trial: i,
                            valence: 0,
                            stimulus_group: 1,
                            stimulus_group_id: 1,
                            n_groups: 1,
                            rest: {},
                            early_stop: false
                        })
                    )
                ],
                false,
                settings
            )
        }
    );

    // Add block summary message
    inst.push(inter_block_instruct);

    // Add quiz introduction
    inst.push({
                type: jsPsychInstructions,
                css_classes: ['instructions'],
                pages: [`<p>Before you start playing, you'll answer a few questions about the instructions you just read.</p>
                        <p>You must answer all questions correctly to begin the game.</p>\
                        <p>If not, you can review the instructions and try again.</p>`],
                show_clickable_nav: true,
                data: {trialphase: "pilt_instruction"}
            });
    
    // Instruction comprehension quiz, repeated until passed
    const inst_loop = buildQuizLoop(
        [
            {
                prompt: `Some cards are better than others, but even the best cards might only give a penny or break a £1 coin.`,
                correct: "True",
                explanation: "You can learn which cards are better by trial and error. However, cards are not 100% consistent in the coins behind them."
            },
            {
                prompt: "If I find a broken coin, that means I lose that amount.",
                correct: "True",
                explanation: "If you find a broken coin, you lose that amount of game coins. This means that if you find a broken £1 coin, you lose £1 in the game."
            },
            {
                prompt: `My goal is to collect as much game coins as I can and avoid losing them.`,
                correct: "True",
                explanation: "Your goal is to collect as many coins as possible. This means learning to choose cards that give you the most coins, and avoiding cards that break valuable coins."
            }
        ],
        "instruction_quiz",
        "pilt_instruction_quiz_review"
    );

    // Build final instruction timeline
    let inst_total = [];

    inst_total = inst_total.concat(inst);

    // Add instruction loop and final ready message
    inst_total = inst_total.concat(
        [
            inst_loop,
            createPressBothTrial(
                `<p>Great! Let's start playing for real.</p>
                <p>You will now complete 15 rounds of the card choosing game, taking 10-15 minutes on average to complete.</p>
                <p>You will be able to take a short break between rounds, if you feel you need it.</p>
                <p>When you're ready, place your fingers comfortably on the <strong>left and right arrow keys</strong> as shown below. Press down <strong> both left and right arrow keys at the same time </strong> to begin.</p>
                <img src='./assets/images/2_finger_keys.jpg' style='width:250px;'></img>`,
                "pilt_instruction"
            )
        ]
    )

    return inst_total
} 

/**
 * Builds a true/false comprehension quiz that repeats until every answer is correct.
 * After a failed attempt, an explanation page is shown for each question answered wrongly.
 * @param {Array} questions - Objects with prompt, correct ("True"/"False") and explanation
 * @param {string} quiz_trialphase - trialphase recorded on the quiz trial
 * @param {string} review_trialphase - trialphase recorded on the explanation pages
 * @returns {Object} jsPsych looping timeline object
 */
function buildQuizLoop(questions, quiz_trialphase, review_trialphase) {

    // Responses to the most recent attempt, in question order
    const lastResponses = () => Object.values(
        jsPsych.data.get().filter({trialphase: quiz_trialphase}).last(1).select('response').values[0]
    );

    const quizFailed = () => {
        const responses = lastResponses();
        return questions.some((q, i) => responses[i] !== q.correct);
    };

    return {
        timeline: [
            {
                type: jsPsychSurveyMultiChoice,
                questions: questions.map(q => ({
                    prompt: q.prompt,
                    options: ["True", "False"],
                    required: true
                })),
                css_classes: ["instructions"],
                preamble: `<div class=instructions><p>For each statement, please indicate whether it is true or false:</p></div>`,
                data: {
                    trialphase: quiz_trialphase
                },
                simulation_options: {
                    data: {
                        response: Object.fromEntries(questions.map((q, i) => [`Q${i}`, q.correct]))
                    }
                }
            },
            {
                type: jsPsychInstructions,
                css_classes: ['instructions'],
                allow_keys: false,
                show_page_number: false,
                show_clickable_nav: true,
                data: {
                    trialphase: review_trialphase
                },
                timeline: [
                    {
                        pages: () => {
                            const responses = lastResponses();
                            return questions.filter((q, i) => responses[i] !== q.correct).map(q => `
                                <p>You gave the wrong answer for the following question:</p>
                                <h3 style="color: darkred; width: 700px; text-align: left;">Question: ${q.prompt}</h3>
                                <br>
                                <p style="max-width: 700px; text-align: left;"><strong>The correct answer:</strong> ${q.correct}</p>
                                <p style="max-width: 700px; text-align: left;"><strong>Explanation:</strong> ${q.explanation}</p>
                                <p>Press next to try the quiz again.</p>
                            `);
                        }
                    }
                ],
                conditional_function: quizFailed
            }
        ],
        // Allow unlimited quiz attempts
        loop_function: quizFailed
    };
}


// Task-specific text for the post-learning test phases. Each is shown right
// after the other, so they need to read as clearly different screens.
const test_instruction_pages = {
    pilt_test: `<p><b>CARD MEMORY: PART 1</b></p>
        <p>Next, you will see cards from the <b>first game</b>, where you chose between two cards on every turn.</p>
        <p>On each turn, you will again choose between two of those cards, but they may now be paired differently from before.
        Try your best to pick the card that you think is most rewarding.</p>
        <p>In this round, you will not see the coins you collect after each choice, but your coins will still be added to your safe.</p>
        <p>This round will take about three minutes to complete.</p>`,
    wm_test: `<p><b>CARD MEMORY: PART 2 (FINAL ROUND)</b></p>
        <p>Well done, you have finished part 1. This is the last round of the session.</p>
        <p>This time, you will see cards from the <b>second game</b>, where you saw one card at a time and pressed an arrow key to flip it.</p>
        <p>Those cards will now be shown in pairs. On each turn, pick the card that you think is most rewarding.</p>
        <p>As in part 1, you will not see the coins you collect after each choice, but they will still be added to your safe.</p>
        <p>This round will take about two minutes to complete.</p>`
};

/**
 * Creates instructions for a post-learning test phase
 * @param {string} task - The test phase identifier ("pilt_test" or "wm_test")
 * @returns {Object} jsPsych instruction trial object for test phase
 */
const testInstructions = (task) => {
    return {
        type: jsPsychInstructions,
        css_classes: ['instructions'],
        pages: [test_instruction_pages[task]],
        show_clickable_nav: true,
        on_start: () => {
            updateState(`${task}_test_instructions_start`);
        },
        data: {trialphase: `post-${task}_test_instructions`},
        on_finish: () => {
            jsPsych.data.addProperties({
                [`${task}_test_n_warnings`]: 0
            });
            console.log(jsPsych.data.get().last(1).select(`${task}_test_n_warnings`).values)
        }
    }
}

/**
 * Instructions for the Long-Term Memory (LTM) task variant
 * Uses three-card choice with arrow key controls (left, right, up)
 */
const LTM_instructions = [
    {
        type: jsPsychInstructions,
        css_classes: ['instructions'],
        pages: [
            '<p>You will now play another round of the card choosing game.</p>\
                <p>Your goal remains to add as much money as you can to your safe.</p>',
            `<p>This time, you will choose between three cards on every turn.<p>
            <p>In every triplet, one picture card will always have £1 and 50-pence coins behind it, while the other two cards will have only pennies.<p>
            <p>You can earn more by learning which is the better picture card in each triplet and choosing that card when you next see same triplet.</p>`,
            `<p>Use the right arrow key to choose the card on the right, the left arrow key to choose the card on the left, 
            and <b>use the upwards arrow key to choose the card in the middle.</b>
            `
        ],
        show_clickable_nav: true,
        data: {trialphase: "LTM_instructions"}
    },
    {
        type: jsPsychHtmlKeyboardResponse,
        css_classes: ['instructions'],
        stimulus: `<p>Let's get started!</p>
        <p>You will play one round with no breaks, lasting about 8 minutes.</p>
        <p>When you are ready to start playing, place your fingers on the left, right, and up arrow keys as shown below, and press the up arrow key.</p>
        <img src='./assets/images/3_finger_keys.jpg' style='width:250px;'></img>`,
        choices: ['arrowup'],
        data: {trialphase: "LTM_instructions"},
        on_finish: () => {
            jsPsych.data.addProperties({
                ltm_n_warnings: 0
            });
        }
    }
]

/**
 * Instructions for the Working Memory (WM) task variant
 * Single card presented with three possible key responses (left, right, up arrows)
 */
const WM_instructions = [
    {
        type: jsPsychInstructions,
        css_classes: ['instructions'],
        pages: [
            '<p>You will now play another round of the card choosing game.</p>\
                <p>Your goal remains to add as much money as you can to your safe.</p>',
            `<p>This time, you will see only one card on each turn.<p>
            <p>You can flip this card by pressing either the left <span class="spacebar-icon">&nbsp;←&nbsp;</span>, up <span class="spacebar-icon">&nbsp;↑&nbsp;</span>, or right <span class="spacebar-icon">&nbsp;→&nbsp;</span> arrow keys on your keyboard.</p>
            <p>For each card, pressing one of the keys will always reveal £1 and 50-pence coins, while the other two keys will reveal only pennies.<p>
            <p>You can earn more by learning which is the better key to press for each card and pressing that key when you next see same card.</p>`
        ],
        show_clickable_nav: true,
        data: {trialphase: "WM_instructions"}
    },
    {
        type: jsPsychInstructions,
        css_classes: ['instructions'],
        pages: [`<p>Before you start playing, you'll answer a few questions about the instructions you just read.</p>
                <p>You must answer all questions correctly to begin the game.</p>
                <p>If not, you can review the instructions and try again.</p>`],
        show_clickable_nav: true,
        data: {trialphase: "WM_instructions"}
    },
    buildQuizLoop(
        [
            {
                prompt: "On each turn, I will see one card, and I flip it by pressing the left, up, or right arrow key.",
                correct: "True",
                explanation: "In this game you see a single card on each turn. You flip it by pressing one of the three arrow keys: left, up, or right."
            },
            {
                prompt: "For each card, one of the keys will always reveal £1 or 50-pence coins, while the other two keys will reveal only pennies.",
                correct: "True",
                explanation: "Every card has one better key. Pressing it always reveals £1 or 50-pence coins, while the other two keys reveal only pennies."
            },
            {
                prompt: "The better key to press is the same for every card.",
                correct: "False",
                explanation: "Each card has its own better key. To collect the most coins, you need to learn and remember which key is better for each card."
            },
            {
                prompt: "In this game, pressing the wrong key can break my coins.",
                correct: "False",
                explanation: "There are no broken coins in this game. Pressing one of the other keys reveals only a penny."
            }
        ],
        "wm_instruction_quiz",
        "wm_instruction_quiz_review"
    ),
    {
        type: jsPsychHtmlKeyboardResponse,
        css_classes: ['instructions'],
        stimulus: `<p>Great! Let's get started!</p>
        <p>You will play one round with no breaks, lasting about 8 minutes.</p>
        <p>When you are ready to start playing, place your fingers on the left, right, and up arrow keys as shown below, and press the up arrow key.</p>
        <img src='./assets/images/3_finger_keys.jpg' style='width:250px;'></img>`,
        choices: ['arrowup'],
        data: {trialphase: "WM_instructions"},
        on_finish: () => {
            jsPsych.data.addProperties({
                wm_n_warnings: 0
            });
        }
    }
]

export {
    preparePILTInstructions,
    testInstructions,
    WM_instructions
};


