// api/task-registry.js
// This module defines a registry for tasks in the API, allowing for easy management and execution of tasks.

import { computeRelativeCardChoosingBonus, createCardChoosingTimeline, createPostLearningTestTimeline } from '@tasks/card-choosing/index.js';

export const TaskRegistry = {
  PILT: {
    name: 'PILT',
    description: 'A task measuring probabilistic instrumental learning in a card choosing scenario',
    createTimeline: createCardChoosingTimeline,
    computeBonus: computeRelativeCardChoosingBonus,
    defaultConfig: {
        task_name: "pilt",
        n_choices: 2,
        valence: "mixed",
        include_instructions: true,
        sequence: 'wk0',
        session: 'wk0'
    },
    sequences: {
        wk0: '@tasks/card-choosing/sequences/PILT/trial1_wk0.js',
        wk2: '@tasks/card-choosing/sequences/PILT/trial1_wk2.js',
        wk4: '@tasks/card-choosing/sequences/PILT/trial1_wk4.js',
    },
    requirements: {
      css: ['@tasks/card-choosing/styles.css'],
    },
    resumptionRules: {
        enabled: true,
        granularity: 'block', // or 'trial' for finer control
        statePattern: (taskName) => `${taskName}_block_(\\d+)_start`,
        extractProgress: (lastState, taskName) => {
            const match = lastState.match(new RegExp(`${taskName}_block_(\\d+)_start`));
            return match ? parseInt(match[1]) : 0;
        }
    },
    configOptions: {
        task_name: "The name of the task being tested. Default is 'pilt'.",
        n_choices: "Number of choice options presented. Default is 2.",
        valence: "Valence of the stimuli - can be 'both' (includes both punishment and reward blocks), 'mixed' (includes mixed valence blocks), 'punishment', or 'reward'. Default is 'mixed'.",
        include_instructions: "Whether to show instructions before the task. Default is true.",
        sequence: "The key for the sequence to use for the learning phase. Default is 'wk0'.",
        session: "Session identifier to govern session-specific behaviour. Default is 'wk0'. Should be deprecated, with settings exposed."
    }
  },
  WM: {
    name: 'WM',
    description: 'Anne Collins\'s RLWM task',
    createTimeline: createCardChoosingTimeline,
    computeBonus: computeRelativeCardChoosingBonus,
    defaultConfig: {
        task_name: "wm",
        n_choices: 3,
        valence: "reward",
        include_instructions: true,
        sequence: 'wk0',
        session: 'wk0'
    },
    sequences: {
        wk0: '@tasks/card-choosing/sequences/WM/trial1_wk0.js',
        wk2: '@tasks/card-choosing/sequences/WM/trial1_wk2.js',
        wk4: '@tasks/card-choosing/sequences/WM/trial1_wk4.js',
    },
    requirements: {
      css: ['@tasks/card-choosing/styles.css'],
    },
    resumptionRules: {
        enabled: true,
        granularity: 'block', // or 'trial' for finer control
        statePattern: (taskName) => `${taskName}_block_(\\d+)_start`,
        extractProgress: (lastState, taskName) => {
            const match = lastState.match(new RegExp(`${taskName}_block_(\\d+)_start`));
            return match ? parseInt(match[1]) : 0;
        }
    },
    configOptions: {
        task_name: "The name of the task being tested. Default is 'pilt'.",
        n_choices: "Number of choice options presented. Default is 2.",
        valence: "Valence of the stimuli - can be 'both' (includes both punishment and reward blocks), 'mixed' (includes mixed valence blocks), 'punishment', or 'reward'. Default is 'mixed'.",
        include_instructions: "Whether to show instructions before the task. Default is true.",
        sequence: "The key for the sequence to use for the learning phase. Default is 'wk0'.",
        session: "Session identifier to govern session-specific behaviour. Default is 'wk0'. Should be deprecated, with settings exposed."
    }
  },
  post_PILT_test: {
    name: 'Post PILT Test',
    description: 'A test phase that evaluates learning performance in notional extinction after completing the PILT task',
    createTimeline: createPostLearningTestTimeline,
    defaultConfig: {
        task_name: "pilt_test",
        test_confidence_every: 4,
        sequence: 'wk0'
    },
    requirements: {
      css: ['@tasks/card-choosing/styles.css'],
    },
    sequences: {
      wk0: '@tasks/card-choosing/sequences/PILT-test/trial1_wk0.js',
      wk2: '@tasks/card-choosing/sequences/PILT-test/trial1_wk2.js',
      wk4: '@tasks/card-choosing/sequences/PILT-test/trial1_wk4.js',
    },
    resumptionRules: {
      enabled: true
    },
    configOptions: {
        task_name: "The name of the test phase - can be 'pilt_test' or 'wm_test'. Default is 'pilt_test'.",
        test_confidence_every: "How often (in trials) to elicit confidence ratings in the test phase. Default is every 4 trials.",
        sequence: "The key for the sequence to use for the test phase - should match the learning phase. Default is 'wk0'.",
    }
  },
  post_WM_test: {
    name: 'Post WM Task Test',
    description: 'A test phase that evaluates learning performance in notional extinction after completing the RLWM task',
    createTimeline: createPostLearningTestTimeline,
    defaultConfig: {
        task_name: "wm_test",
        test_confidence_every: 4,
        sequence: 'wk0'
    },
    requirements: {
      css: ['@tasks/card-choosing/styles.css'],
    },
    sequences: {
      wk0: '@tasks/card-choosing/sequences/WM-test/trial1_wk0.js',
      wk2: '@tasks/card-choosing/sequences/WM-test/trial1_wk2.js',
      wk4: '@tasks/card-choosing/sequences/WM-test/trial1_wk4.js',
    },
    resumptionRules: {
      enabled: true
    },
    configOptions: {
        task_name: "The name of the test phase - can be 'pilt_test' or 'wm_test'. Default is 'wm_test'.",
        test_confidence_every: "How often (in trials) to elicit confidence ratings in the test phase. Default is every 4 trials.",
        sequence: "The key for the sequence to use for the test phase - should match the learning phase. Default is 'wk0'.",
    }
  }
};

// Global settings that apply to all tasks unless overridden
export const globalConfig = {
    max_warnings_per_task: 3,
    warning_expected_n_back: 1,
    default_response_deadline: 4000,
    long_response_deadline: 6000,
    interimWarning: 5,
    finalWarning: 15
}

export const globalConfigOptions = {
    max_warnings_per_task: "Maximum number of deadline warnings allowed per task. Default is 3.",
    warning_expected_n_back: "How many jsPsych trials back to check for the previous deadline warning. Default is 1.",
    default_response_deadline: "Default response deadline in milliseconds. Default is 4000.",
    long_response_deadline: "Long response deadline in milliseconds. Default is 6000.",
    interimWarning: "Show message about abiding by instructions after participant receives this many warnings in a task. Default is 5.",
    finalWarning: "Show message about abiding by instructions after participant receives this many warnings in a task. Default is 15."
}
